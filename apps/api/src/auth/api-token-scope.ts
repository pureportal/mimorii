import { SetMetadata } from "@nestjs/common";
import type { TeamRole } from "@mimorii/contracts";
import { AsyncLocalStorage } from "node:async_hooks";

export const apiTokenTeamRoles = new AsyncLocalStorage<ReadonlyMap<string, TeamRole>>();

export const apiTokenWithoutTeamKey = "mimorii:api-token-without-team";

export const AllowApiTokenWithoutTeam = () => SetMetadata(apiTokenWithoutTeamKey, true);
