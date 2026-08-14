import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "./auth.guard.js";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.headers.authorization) return true;
    try {
      return await this.auth.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) return true;
      throw error;
    }
  }
}
