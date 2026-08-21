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
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

interface RemoteResponse {
  body: Buffer;
  finalUrl: URL;
  headers: IncomingHttpHeaders;
}

interface FaviconCandidate {
  score: number;
  url: URL;
}

export class FaviconRetrievalError extends Error {
  constructor() {
    super("Favicon could not be retrieved");
    this.name = "FaviconRetrievalError";
  }
}

@Injectable()
export class FaviconFetcherService {
  constructor(private readonly targets: TargetSafetyService) {}

  async retrieve(websiteUrl: string): Promise<Buffer> {
    const deadline = Date.now() + retrievalTimeoutMs;
    const initialUrl = this.targets.validateHttpUrl(websiteUrl);
    let pageUrl = initialUrl;
    let candidates: FaviconCandidate[] = [];

    try {
      const page = await this.fetch(
        initialUrl,
        maximumPageBytes,
        "text/html,application/xhtml+xml",
        deadline
      );
      pageUrl = page.finalUrl;
      if (this.isHtml(page.headers["content-type"])) {
        candidates = discoverFavicons(page.body.toString("utf8"), page.finalUrl);
      }
    } catch {
      candidates = [];
    }

    candidates.push({ score: -1, url: new URL("/favicon.ico", pageUrl.origin) });
    const uniqueCandidates = candidates.filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.url.href === candidate.url.href) === index
    );

    return this.retrieveCandidate(uniqueCandidates.slice(0, maximumCandidates), deadline);
  }

  private async retrieveCandidate(
    candidates: FaviconCandidate[],
    deadline: number,
    index = 0
  ): Promise<Buffer> {
    const candidate = candidates[index];
    if (!candidate || Date.now() >= deadline) throw new FaviconRetrievalError();
    try {
      const image = await this.fetch(candidate.url, imageAssetMaxBytes, "image/*", deadline);
      return await optimizeImageAsset(image.body, faviconDimension, true);
    } catch {
      return this.retrieveCandidate(candidates, deadline, index + 1);
    }
  }

  private async fetch(
    input: URL,
    maximumBytes: number,
    accept: string,
    deadline: number,
    redirects = 0
  ): Promise<RemoteResponse> {
    const url = this.targets.validateHttpUrl(input.toString());
    const addresses = await beforeDeadline(
      this.targets.resolveStrictPublicHost(url.hostname),
      deadline
    );
    const response = await this.request(url, addresses[0]!.address, maximumBytes, accept, deadline);

    if (redirectStatuses.has(response.statusCode)) {
      if (!response.headers.location || redirects >= maximumRedirects) {
        throw new FaviconRetrievalError();
      }
      return this.fetch(
        new URL(response.headers.location, url),
        maximumBytes,
        accept,
        deadline,
        redirects + 1
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new FaviconRetrievalError();
    }
    return { body: response.body, finalUrl: url, headers: response.headers };
  }

  private request(
    url: URL,
    address: string,
    maximumBytes: number,
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
          if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
            response.destroy(new FaviconRetrievalError());
            fail(new FaviconRetrievalError());
            return;
          }

          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maximumBytes) {
              response.destroy(new FaviconRetrievalError());
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            succeed({
              body: Buffer.concat(chunks),
              headers: response.headers,
              statusCode: response.statusCode ?? 0,
            });
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

function discoverFavicons(html: string, documentUrl: URL): FaviconCandidate[] {
  const document = parse(html);
  const elements = descendants(document);
  const baseHref = elements
    .filter((element) => element.tagName === "base")
    .map((element) => attribute(element, "href"))
    .find(Boolean);
  const baseUrl = resolveHttpUrl(baseHref, documentUrl) ?? documentUrl;

  return elements
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
