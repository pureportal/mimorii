export const defaultCorsOrigins = [
  "http://localhost:5180",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
];

export const allowedCorsMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function configuredCorsOrigins(value = process.env.MIMORII_CORS_ORIGINS): string[] {
  return (value ?? defaultCorsOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
