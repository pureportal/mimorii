import { teamRoles, type TeamRole } from "@mimorii/contracts";

export function teamRoleAtLeast(role: TeamRole, minimum: TeamRole): boolean {
  return teamRoles.indexOf(role) <= teamRoles.indexOf(minimum);
}

export function lowerTeamRole(first: TeamRole, second: TeamRole): TeamRole {
  return teamRoleAtLeast(first, second) ? second : first;
}
