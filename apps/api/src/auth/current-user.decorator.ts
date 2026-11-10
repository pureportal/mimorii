import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ApiTokenAccess, TeamRole } from "@mimorii/contracts";
import type { Request } from "express";
import type { AuthenticatedUser } from "../common/rows.js";

export type AuthCredential =
  | {
      type: "apiToken";
      id: string;
      access: ApiTokenAccess;
      teamRoles: ReadonlyMap<string, TeamRole>;
    }
  | {
      type: "oauth";
      id: string;
      expiresAt: string | null;
      clientId?: string;
      scopes: string[];
      resource?: string;
    };

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  authCredential?: AuthCredential;
}

export interface OptionallyAuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user
);

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<OptionallyAuthenticatedRequest>().user
);
