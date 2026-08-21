import { invoke, isTauri } from "@tauri-apps/api/core";

export type MobileCollectorBackgroundMode = "inactive" | "scheduled" | "restricted";

export interface MobileCollectorState {
  available: boolean;
  enrolled: boolean;
  collectorId: string | null;
  collectorName: string | null;
  serverUrl: string | null;
  collectionIntervalSeconds: number | null;
  lastSubmittedAt: string | null;
  lastError: string | null;
  backgroundMode: MobileCollectorBackgroundMode;
  backgroundRestricted: boolean;
  batteryOptimizationExempt: boolean;
  bootRecoveryEnabled: boolean;
  foregroundService: false;
  notificationPermissionRequired: false;
}

export interface MobileCollectorEnrollment {
  serverUrl: string;
  enrollmentKey: string;
}

export async function mobileCollectorState(): Promise<MobileCollectorState> {
  requireAgentRuntime();
  return invoke<MobileCollectorState>("plugin:agent-mobile|status");
}

export async function enrollMobileCollector(
  enrollment: MobileCollectorEnrollment
): Promise<MobileCollectorState> {
  requireAgentRuntime();
  return invoke<MobileCollectorState>("plugin:agent-mobile|enroll", { ...enrollment });
}

export async function collectMobileStatusNow(): Promise<MobileCollectorState> {
  requireAgentRuntime();
  return invoke<MobileCollectorState>("plugin:agent-mobile|collect_now");
}

export async function openMobileAgentBackgroundSettings(): Promise<void> {
  requireAgentRuntime();
  await invoke("plugin:agent-mobile|open_background_settings");
}

export async function unenrollMobileCollector(): Promise<MobileCollectorState> {
  requireAgentRuntime();
  return invoke<MobileCollectorState>("plugin:agent-mobile|unenroll");
}

function requireAgentRuntime(): void {
  if (!isTauri() || import.meta.env.VITE_MIMORII_ANDROID_PRODUCT !== "agent") {
    throw new Error("Android collection is available only in Mimorii Agent");
  }
}
