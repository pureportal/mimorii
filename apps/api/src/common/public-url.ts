export function publicBaseUrl(): string {
  return (process.env.MIMORII_PUBLIC_URL ?? "http://localhost:4310").replace(/\/$/, "");
}
