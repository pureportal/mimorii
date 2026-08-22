import type { SponsorshipTierCollection } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";

const OFFICIAL_SPONSOR_API_URL = "https://mimorii.app/api";

export function useSponsors() {
  return useQuery({
    queryKey: ["sponsors"],
    queryFn: () => sponsorApi<SponsorshipTierCollection[]>("/sponsors"),
  });
}

export async function sponsorApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(sponsorUrl(path), {
    ...options,
    credentials: "omit",
    headers,
  });
  if (!response.ok) throw await sponsorApiError(response);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Official sponsor service returned an invalid response");
  }
}

export function sponsorUrl(path: string): string {
  return `${OFFICIAL_SPONSOR_API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function sponsorApiError(response: Response): Promise<Error> {
  let message = response.statusText || "Sponsor request failed";
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message[0] ?? message;
    else if (body.message) message = body.message;
  } catch {
    message = response.statusText || "Sponsor request failed";
  }
  return new Error(message);
}
