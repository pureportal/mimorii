import { imageAssetMaxBytes } from "@mimorii/contracts";
import { Injectable } from "@nestjs/common";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { parse } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import { TargetSafetyService } from "../common/target-safety.service.js";
import { optimizeImageAsset } from "../common/image-asset.js";

const faviconDimension = 128;
const maximumPageBytes = 512 * 1024;
const maximumRedirects = 3;
const maximumCandidates = 12;
const retrievalTimeoutMs = 8_000;
const maximumNameLength = 100;
const maximumDescriptionLength = 500;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

interface RemoteResponse {
  body: Buffer;
  finalUrl: URL;
  headers: IncomingHttpHeaders;
}

interface BodyLimit {
  bytes: number;
  truncate: boolean;
}

const pageLimit: BodyLimit = { bytes: maximumPageBytes, truncate: true };
const imageLimit: BodyLimit = { bytes: imageAssetMaxBytes, truncate: false };

interface FaviconCandidate {
  score: number;
  url: URL;
}

interface WebsiteDocument {
  icons: FaviconCandidate[];
  name: string | null;
  description: string | null;
}

export interface WebsiteInspection {
  requestedUrl: URL;
  finalUrl: URL;
  reachable: boolean;
  name: string | null;
  description: string | null;
  icon: Buffer | null;
}

export class FaviconRetrievalError extends Error {
  constructor(readonly statusCode: number | null = null) {
    super("Favicon could not be retrieved");
    this.name = "FaviconRetrievalError";
  }
}

@Injectable()
export class FaviconFetcherService {
  constructor(private readonly targets: TargetSafetyService) {}

  async retrieve(websiteUrl: string): Promise<Buffer> {
    const { icon } = await this.inspect(websiteUrl);
    if (!icon) throw new FaviconRetrievalError();
    return icon;
  }

  async inspect(websiteUrl: string): Promise<WebsiteInspection> {
    const deadline = Date.now() + retrievalTimeoutMs;
    const requestedUrl = this.targets.validateHttpUrl(websiteUrl);
    let finalUrl = requestedUrl;
    let reachable = false;
    let document: WebsiteDocument = { icons: [], name: null, description: null };

    try {
      const page = await this.fetch(
        requestedUrl,
        pageLimit,
        "text/html,application/xhtml+xml",
        deadline
      );
      finalUrl = page.finalUrl;
      reachable = true;
      if (this.isHtml(page.headers["content-type"])) {
        document = readWebsiteDocument(page.body.toString("utf8"), page.finalUrl);
      }
    } catch (error) {
      reachable = error instanceof FaviconRetrievalError && error.statusCode !== null;
    }

    const candidates = [
      ...document.icons,
      { score: -1, url: new URL("/favicon.ico", finalUrl.origin) },
    ].filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.url.href === candidate.url.href) === index
    );
    const icon = await this.retrieveCandidate(
      candidates.slice(0, maximumCandidates),
      deadline
    ).catch(() => null);

    return {
      requestedUrl,
      finalUrl,
      reachable,
      name: document.name,
      description: document.description,
      icon,
    };
  }

  private async retrieveCandidate(
    candidates: FaviconCandidate[],
    deadline: number,
    index = 0
  ): Promise<Buffer> {
    const candidate = candidates[index];
    if (!candidate || Date.now() >= deadline) throw new FaviconRetrievalError();
    try {
      const image = await this.fetch(candidate.url, imageLimit, "image/*", deadline);
      return await optimizeImageAsset(image.body, faviconDimension, true);
    } catch {
      return this.retrieveCandidate(candidates, deadline, index + 1);
    }
  }

  private async fetch(
    input: URL,
    limit: BodyLimit,
    accept: string,
    deadline: number,
    redirects = 0
  ): Promise<RemoteResponse> {
    const url = this.targets.validateHttpUrl(input.toString());
    const addresses = await beforeDeadline(
      this.targets.resolveStrictPublicHost(url.hostname),
      deadline
    );
    const response = await this.request(url, addresses[0]!.address, limit, accept, deadline);

    if (redirectStatuses.has(response.statusCode)) {
      if (!response.headers.location || redirects >= maximumRedirects) {
        throw new FaviconRetrievalError();
      }
      return this.fetch(
        new URL(response.headers.location, url),
        limit,
        accept,
        deadline,
        redirects + 1
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new FaviconRetrievalError(response.statusCode);
    }
    return { body: response.body, finalUrl: url, headers: response.headers };
  }

  private request(
    url: URL,
    address: string,
    limit: BodyLimit,
    accept: string,
    deadline: number
  ): Promise<{ body: Buffer; headers: IncomingHttpHeaders; statusCode: number }> {
    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) return Promise.reject(new FaviconRetrievalError());

    return new Promise((resolve, reject) => {
      let deadlineTimer: NodeJS.Timeout | undefined;
      const succeed = (value: {
        body: Buffer;
        headers: IncomingHttpHeaders;
        statusCode: number;
      }) => {
        if (deadlineTimer) clearTimeout(deadlineTimer);
        resolve(value);
      };
      const fail = (error: Error) => {
        if (deadlineTimer) clearTimeout(deadlineTimer);
        reject(error);
      };
      const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = requester(
        {
          hostname: address,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: {
            accept,
            "accept-encoding": "identity",
            "accept-language": "en",
            host: url.host,
            "user-agent": "Mimorii/5 favicon-fetcher",
          },
          maxHeaderSize: 16 * 1024,
          ...(url.protocol === "https:"
            ? { servername: url.hostname, rejectUnauthorized: true }
            : {}),
        },
        (response) => {
          const contentLength = Number(response.headers["content-length"]);
          if (!limit.truncate && Number.isFinite(contentLength) && contentLength > limit.bytes) {
            response.destroy(new FaviconRetrievalError());
            fail(new FaviconRetrievalError());
            return;
          }

          const chunks: Buffer[] = [];
          let bytes = 0;
          const complete = () =>
            succeed({
              body: Buffer.concat(chunks),
              headers: response.headers,
              statusCode: response.statusCode ?? 0,
            });
          response.on("data", (chunk: Buffer) => {
            const remaining = limit.bytes - bytes;
            bytes += chunk.length;
            if (bytes <= limit.bytes) {
              chunks.push(chunk);
              return;
            }
            if (!limit.truncate) {
              response.destroy(new FaviconRetrievalError());
              return;
            }
            chunks.push(chunk.subarray(0, remaining));
            complete();
            response.destroy();
          });
          response.on("end", () => {
            complete();
          });
          response.on("error", fail);
        }
      );
      request.setTimeout(remainingTime, () => request.destroy(new FaviconRetrievalError()));
      deadlineTimer = setTimeout(() => request.destroy(new FaviconRetrievalError()), remainingTime);
      request.on("error", fail);
      request.end();
    });
  }

  private isHtml(contentType: string | string[] | undefined): boolean {
    if (!contentType) return true;
    const value = Array.isArray(contentType) ? contentType.join(",") : contentType;
    return /^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(value);
  }
}

function readWebsiteDocument(html: string, documentUrl: URL): WebsiteDocument {
  const elements = descendants(parse(html));
  const baseHref = elements
    .filter((element) => element.tagName === "base")
    .map((element) => attribute(element, "href"))
    .find(Boolean);
  const baseUrl = resolveHttpUrl(baseHref, documentUrl) ?? documentUrl;
  const icons = elements
    .filter((element) => element.tagName === "link")
    .flatMap((element) => {
      const rel = (attribute(element, "rel") ?? "").toLowerCase().split(/\s+/);
      if (!rel.some((token) => token === "icon" || token.startsWith("apple-touch-icon"))) {
        return [];
      }
      const url = resolveHttpUrl(attribute(element, "href"), baseUrl);
      return url ? [{ score: iconScore(attribute(element, "sizes")), url }] : [];
    })
    .toSorted((left, right) => right.score - left.score);
  const metaElements = elements.filter((element) => element.tagName === "meta");
  const meta = (key: string) => {
    const element = metaElements.find((candidate) =>
      [attribute(candidate, "property"), attribute(candidate, "name")].some(
        (value) => value?.toLowerCase() === key
      )
    );
    return collapseWhitespace(element && attribute(element, "content"));
  };
  const title = collapseWhitespace(
    textContent(elements.find((element) => element.tagName === "title"))
  );
  const name =
    meta("og:site_name") ??
    meta("application-name") ??
    meta("apple-mobile-web-app-title") ??
    brandFromTitle(title, documentUrl.hostname);
  const description = meta("description") ?? meta("og:description");
  return {
    icons,
    name: name?.slice(0, maximumNameLength) ?? null,
    description: description?.slice(0, maximumDescriptionLength) ?? null,
  };
}

function brandFromTitle(title: string | null, hostname: string): string | null {
  if (!title) return null;
  const segments = title
    .split(/\s+[|·•–—-]\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2)
    .toSorted((left, right) => left.length - right.length);
  const hostLabels = hostname
    .toLowerCase()
    .split(".")
    .slice(0, -1)
    .filter((label) => label.length >= 3 && label !== "www");
  return (
    segments.find((segment) => {
      const compact = segment.toLowerCase().replace(/[^a-z0-9]/g, "");
      return hostLabels.some((label) => compact.includes(label.replace(/[^a-z0-9]/g, "")));
    }) ??
    segments[0] ??
    null
  );
}

function textContent(element: DefaultTreeAdapterTypes.Element | undefined): string | undefined {
  return element?.childNodes
    .map((node) => ("value" in node && node.nodeName === "#text" ? node.value : ""))
    .join("");
}

function collapseWhitespace(value: string | undefined): string | null {
  return value ? value.replace(/\s+/g, " ").trim() || null : null;
}

function descendants(root: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Element[] {
  const elements: DefaultTreeAdapterTypes.Element[] = [];
  const visit = (node: DefaultTreeAdapterTypes.Node) => {
    if ("tagName" in node) elements.push(node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(root);
  return elements;
}

function attribute(element: DefaultTreeAdapterTypes.Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name.toLowerCase() === name)?.value;
}

function resolveHttpUrl(value: string | undefined, base: URL): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function iconScore(sizes: string | undefined): number {
  if (!sizes) return 0;
  if (sizes.toLowerCase().split(/\s+/).includes("any")) return Number.MAX_SAFE_INTEGER;
  return sizes.split(/\s+/).reduce((largest, size) => {
    const match = /^(\d+)x(\d+)$/i.exec(size);
    return match ? Math.max(largest, Number(match[1]) * Number(match[2])) : largest;
  }, 0);
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remainingTime = deadline - Date.now();
  if (remainingTime <= 0) throw new FaviconRetrievalError();
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new FaviconRetrievalError()), remainingTime);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
