const defaultApiBaseUrl = "https://swetrix.pureportal.io/backend";

export class SwetrixApi {
  constructor(apiKey, baseUrl = process.env.SWETRIX_ADMIN_API_URL || defaultApiBaseUrl) {
    if (!apiKey) throw new Error("SWETRIX_API_KEY is not set");
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async request(path, { method = "GET", body } = {}) {
    const url = new URL(path.replace(/^\/+/, ""), `${this.baseUrl}/`);
    const headers = { "X-Api-Key": this.apiKey };
    const signal = AbortSignal.timeout(15_000);
    const requestOptions = { method, headers, signal };
    if (body !== undefined) {
      requestOptions.headers = { ...headers, "Content-Type": "application/json" };
      requestOptions.body = JSON.stringify(body);
    }
    const response = await fetch(url, requestOptions);
    const text = await response.text();
    const data = parseResponse(text);
    if (!response.ok) {
      const message =
        data && typeof data === "object" && "message" in data ? String(data.message) : text;
      throw new Error(`Swetrix API returned ${response.status}: ${message || response.statusText}`);
    }
    return data;
  }

  async probe(path) {
    const url = new URL(path.replace(/^\/+/, ""), `${this.baseUrl}/`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-Api-Key": this.apiKey, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    return response.status;
  }
}

export function parseCommaSeparated(value) {
  return [
    ...new Set(
      (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

export function readJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("SWETRIX_ADMIN_API_URL must use HTTP or HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function parseResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
