import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentAgent, type AuthenticatedAgent } from "./agent-auth.js";
import { AgentGuard } from "./agent.guard.js";
import { AgentHeartbeatDto } from "./agents.dto.js";
import { AgentsService } from "./agents.service.js";

@ApiTags("Agent transport")
@ApiBearerAuth("agent-key")
@UseGuards(AgentGuard)
@Controller("agent")
export class AgentTransportController {
  constructor(private readonly agents: AgentsService) {}

  @Get("tasks")
  poll(@CurrentAgent() agent: AuthenticatedAgent, @Query("limit") limit?: string) {
    return this.agents.poll(agent, limit ? Number(limit) : undefined);
  }

  @Post("heartbeat")
  @HttpCode(200)
  heartbeat(@CurrentAgent() agent: AuthenticatedAgent, @Body() input: AgentHeartbeatDto) {
    return this.agents.heartbeat(agent, input);
  }
}
