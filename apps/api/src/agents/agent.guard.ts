import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AgentCapability, AgentKind } from "@mimorii/contracts";
import type { Request } from "express";
import { hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import type { AgentRequest, AuthenticatedAgent } from "./agent-auth.js";

interface AgentRow {
  id: string;
  team_id: string;
  resource_id: string;
  resource_name: string;
  kind: AgentKind;
  capabilities_json: string;
  collection_interval_seconds: number;
}

@Injectable()
export class AgentGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer "))
      throw new UnauthorizedException("Agent key required");
    const key = authorization.slice(7).trim();
    if (!key.startsWith("mim_agent_")) throw new UnauthorizedException("Agent key is invalid");
    const row = await this.database.get<AgentRow>(
      `SELECT a.id, a.team_id, a.resource_id, r.name AS resource_name, a.kind,
        a.capabilities_json, a.collection_interval_seconds
       FROM agents a JOIN resources r ON r.id = a.resource_id
       WHERE a.key_hash = ? AND a.revoked_at IS NULL`,
      hashSecret(key)
    );
    if (!row) throw new UnauthorizedException("Agent key is invalid");
    const agent: AuthenticatedAgent = {
      id: row.id,
      teamId: row.team_id,
      resourceId: row.resource_id,
      resourceName: row.resource_name,
      kind: row.kind,
      capabilities: JSON.parse(row.capabilities_json) as AgentCapability[],
      collectionIntervalSeconds: row.collection_interval_seconds,
    };
    (request as AgentRequest).agent = agent;
    return true;
  }
}
