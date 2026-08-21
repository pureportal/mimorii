export type ApplicationRuntime = "web" | "android-client" | "android-agent";

export const applicationRuntime = runtimeFromAndroidProduct(
  import.meta.env.VITE_MIMORII_ANDROID_PRODUCT
);

export function runtimeFromAndroidProduct(value: string | undefined): ApplicationRuntime {
  if (value === "client") return "android-client";
  if (value === "agent") return "android-agent";
  return "web";
}

export function startupPath(runtime: ApplicationRuntime): string {
  return runtime === "android-client" ? "/login" : "/";
}
