import { invoke, isTauri } from "@tauri-apps/api/core";

export interface MobileCollectorState {
  available: boolean;
  enrolled: boolean;
  collectorId: string | null;
  collectionIntervalSeconds: number | null;
  lastSubmittedAt: string | null;
  lastError: string | null;
}

export interface MobileCollectorEnrollment {
  serverUrl: string;
  enrollmentKey: string;
  collectorId: string;
  collectionIntervalSeconds: number;
}

const unavailableState: MobileCollectorState = {
  available: false,
  enrolled: false,
  collectorId: null,
  collectionIntervalSeconds: null,
  lastSubmittedAt: null,
  lastError: null,
};

const mobileAgentEnabled = import.meta.env.VITE_MIMORII_ANDROID_PRODUCT === "agent";

export async function mobileCollectorState(): Promise<MobileCollectorState> {
  if (!isTauri() || !mobileAgentEnabled) return unavailableState;
  return invoke<MobileCollectorState>("plugin:agent-mobile|status");
}

export async function enrollMobileCollector(
  enrollment: MobileCollectorEnrollment
): Promise<MobileCollectorState> {
  if (!isTauri() || !mobileAgentEnabled) {
    throw new Error("Mobile collection is available only in Mimorii Agent for Android");
  }
  return invoke<MobileCollectorState>("plugin:agent-mobile|enroll", { ...enrollment });
}

export async function collectMobileStatusNow(): Promise<MobileCollectorState> {
  if (!isTauri() || !mobileAgentEnabled) {
    throw new Error("Mobile collection is available only in Mimorii Agent for Android");
  }
  return invoke<MobileCollectorState>("plugin:agent-mobile|collect_now");
}

export async function unenrollMobileCollector(): Promise<MobileCollectorState> {
  if (!isTauri() || !mobileAgentEnabled) {
    throw new Error("Mobile collection is available only in Mimorii Agent for Android");
  }
  return invoke<MobileCollectorState>("plugin:agent-mobile|unenroll");
}
