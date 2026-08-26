export function statusPagePath(id: string, slug: string): string {
  return `/status/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
}
