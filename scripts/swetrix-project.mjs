export const swetrixProjectOrigins = [
  "mimorii.app",
  "*.mimorii.app",
  "localhost",
  "127.0.0.1",
  "tauri.localhost",
  "*.app.github.dev",
];
export const swetrixWebsiteUrl = "https://mimorii.app";
export const swetrixFunnels = [
  { name: "Registration", steps: ["/", "/register", "/app"] },
  {
    name: "Monitor setup",
    steps: ["/app", "/app/monitoring/resources", "/app/monitoring/checks"],
  },
];
export const swetrixViews = [
  {
    name: "App traffic",
    type: "traffic",
    filters: [{ dimension: "page", operator: "contains", value: "/app" }],
  },
  {
    name: "App performance",
    type: "performance",
    filters: [{ dimension: "page", operator: "contains", value: "/app" }],
  },
];

export function getSwetrixProjectId() {
  return process.env.VITE_SWETRIX_PROJECT_ID?.trim() || "vN8owpoxr4NW";
}
