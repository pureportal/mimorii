import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../common/rows.js";

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  authCredential?: {
    type: "apiToken" | "oauth";
    id: string;
    expiresAt: string | null;
    clientId?: string;
    scopes: string[];
    resource?: string;
  };
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
