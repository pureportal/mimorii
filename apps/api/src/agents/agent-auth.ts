import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AgentCapability, AgentKind } from "@mimorii/contracts";
import type { Request } from "express";

export interface AuthenticatedAgent {
  id: string;
  teamId: string;
  name: string;
  kind: AgentKind;
  capabilities: AgentCapability[];
  collectionIntervalSeconds: number;
}

export interface AgentRequest extends Request {
  agent: AuthenticatedAgent;
}

export const CurrentAgent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAgent =>
    context.switchToHttp().getRequest<AgentRequest>().agent
);
