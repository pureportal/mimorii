import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

export interface PinnedRequestOptions {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maximumBytes: number;
}

export interface PinnedResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export class RequestTimeoutError extends Error {
  override name = "TimeoutError";

  constructor() {
    super("Request timed out");
  }
}

export class ResponseTooLargeError extends Error {
  constructor() {
    super("Response is too large");
  }
}

export function pinnedRequest(
  url: URL,
  address: string,
  options: PinnedRequestOptions
): Promise<PinnedResponse> {
  const family = isIP(address);
  if (family === 0) return Promise.reject(new Error("Resolved address is invalid"));
  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requester(
      url,
      { method: options.method, headers: options.headers, lookup, maxHeaderSize: 16 * 1_024 },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > options.maximumBytes) {
            settle(() => reject(new ResponseTooLargeError()));
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          settle(() =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks),
            })
          )
        );
        response.on("error", (error) => settle(() => reject(error)));
        response.on("close", () =>
          settle(() => reject(new Error("Response ended before it was complete")))
        );
      }
    );
    const timer = setTimeout(() => {
      settle(() => reject(new RequestTimeoutError()));
      request.destroy();
    }, options.timeoutMs);
    request.on("error", (error) => settle(() => reject(error)));
    request.end(options.body);
  });
}
