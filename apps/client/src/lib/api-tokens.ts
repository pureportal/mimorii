import type { ApiTokenAccess, ApiTokenSummary, TeamRole } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const apiTokensQueryKey = ["api-tokens"] as const;

export const apiTokenAccessLabels: Record<ApiTokenAccess, string> = {
  read: "Read only",
  write: "Read and write",
};

export const teamRoleLabels: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function useApiTokens() {
  return useQuery({
    queryKey: apiTokensQueryKey,
    queryFn: () => api<ApiTokenSummary[]>("/auth/api-tokens"),
  });
}
