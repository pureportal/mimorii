import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CollectorCapability, CollectorKind } from "@mimorii/contracts";
import type { Request } from "express";
import { hashSecret } from "../common/crypto.js";
import { DatabaseService } from "../database/database.service.js";
import type { AgentRequest, AuthenticatedAgent } from "./agent-auth.js";

interface AgentRow {
  id: string;
  team_id: string;
  name: string;
  kind: CollectorKind;
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
      `SELECT id, team_id, name, kind, capabilities_json, collection_interval_seconds FROM agents
       WHERE key_hash = ? AND revoked_at IS NULL`,
      hashSecret(key)
    );
    if (!row) throw new UnauthorizedException("Agent key is invalid");
    const agent: AuthenticatedAgent = {
      id: row.id,
      teamId: row.team_id,
      name: row.name,
      kind: row.kind,
      capabilities: JSON.parse(row.capabilities_json) as CollectorCapability[],
      collectionIntervalSeconds: row.collection_interval_seconds,
    };
    (request as AgentRequest).agent = agent;
    return true;
  }
}
