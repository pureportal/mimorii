import { createHash } from "node:crypto";
import type { DatabaseService } from "../database.service.js";

export interface SeedContext {
  database: DatabaseService;
  userId: string;
  teamId: string;
  teamSlug: string;
  agentId: string;
  passwordHash: string;
  now: Date;
}

export function seedId(context: SeedContext, key: string): string {
  const hex = createHash("sha256").update(`${context.teamId}:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function globalSeedId(key: string): string {
  const hex = createHash("sha256").update(`mimorii:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function seedSecret(context: SeedContext, prefix: string, key: string): string {
  return `${prefix}_${createHash("sha256").update(`${context.teamId}:${key}`).digest("base64url")}`;
}

export function at(context: SeedContext, milliseconds: number): string {
  return new Date(context.now.getTime() + milliseconds).toISOString();
}

export function days(value: number): number {
  return value * 86_400_000;
}

export function hours(value: number): number {
  return value * 3_600_000;
}

export function minutes(value: number): number {
  return value * 60_000;
}
