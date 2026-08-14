import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/current-user.decorator.js";

@Injectable()
export class GlobalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user.isGlobalAdmin || user.authMethod !== "session") {
      throw new ForbiddenException("Global administrator access required");
    }
    return true;
  }
}
