import { invoke, isTauri } from "@tauri-apps/api/core";

export type MobileAgentBackgroundMode = "inactive" | "scheduled" | "restricted";

export interface MobileAgentState {
  available: boolean;
  enrolled: boolean;
  agentId: string | null;
  agentName: string | null;
  serverUrl: string | null;
  collectionIntervalSeconds: number | null;
  lastSubmittedAt: string | null;
  lastError: string | null;
  backgroundMode: MobileAgentBackgroundMode;
  backgroundRestricted: boolean;
  batteryOptimizationExempt: boolean;
  bootRecoveryEnabled: boolean;
  foregroundService: false;
  notificationPermissionRequired: false;
}

export interface MobileAgentEnrollment {
  serverUrl: string;
  enrollmentKey: string;
}

export async function mobileAgentState(): Promise<MobileAgentState> {
  requireAgentRuntime();
  return invoke<MobileAgentState>("plugin:agent-mobile|status");
}

export async function enrollMobileAgent(
  enrollment: MobileAgentEnrollment
): Promise<MobileAgentState> {
  requireAgentRuntime();
  return invoke<MobileAgentState>("plugin:agent-mobile|enroll", { ...enrollment });
}

export async function collectMobileStatusNow(): Promise<MobileAgentState> {
  requireAgentRuntime();
  return invoke<MobileAgentState>("plugin:agent-mobile|collect_now");
}

export async function openMobileAgentBackgroundSettings(): Promise<void> {
  requireAgentRuntime();
  await invoke("plugin:agent-mobile|open_background_settings");
}

export async function unenrollMobileAgent(): Promise<MobileAgentState> {
  requireAgentRuntime();
  return invoke<MobileAgentState>("plugin:agent-mobile|unenroll");
}

function requireAgentRuntime(): void {
  if (!isTauri() || import.meta.env.VITE_MIMORII_ANDROID_PRODUCT !== "agent") {
    throw new Error("Android collection is available only in Mimorii Agent");
  }
}
