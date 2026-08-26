import { getServerUrl } from "./api";

export function dashboardViewPath(id: string, slug: string, accessKey?: string): string {
  const path = `/dashboard/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
  return accessKey ? `${path}#${new URLSearchParams({ key: accessKey })}` : path;
}

export function dashboardShareUrl(id: string, slug: string, accessKey: string): string {
  const url =
    window.location.protocol === "tauri:"
      ? new URL(getServerUrl().replace(/\/api\/?$/, ""))
      : new URL(window.location.origin);
  url.pathname = `/dashboard/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
  url.search = "";
  url.hash = new URLSearchParams({ key: accessKey }).toString();
  return url.toString();
}

export function dashboardAccessKey(hash: string): string | undefined {
  return new URLSearchParams(hash.replace(/^#/, "")).get("key") ?? undefined;
}

export function dashboardKeyFingerprint(accessKey: string | undefined): string {
  if (!accessKey) return "none";
  let hash = 2_166_136_261;
  for (const character of accessKey) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash.toString(16).padStart(8, "0");
}
