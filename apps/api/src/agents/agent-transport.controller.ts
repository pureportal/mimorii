import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AgentEnrollment } from "@mimorii/contracts";
import { CurrentAgent, type AuthenticatedAgent } from "./agent-auth.js";
import { AgentGuard } from "./agent.guard.js";
import { AgentHeartbeatDto } from "./agents.dto.js";
import { AgentsService } from "./agents.service.js";
import { MobileDeviceStatusDto } from "./mobile-device-status.dto.js";
import { MobileDeviceStatusService } from "./mobile-device-status.service.js";

@ApiTags("Agent transport")
@ApiBearerAuth("agent-key")
@UseGuards(AgentGuard)
@Controller("agent")
export class AgentTransportController {
  constructor(
    private readonly agents: AgentsService,
    private readonly mobileDeviceStatuses: MobileDeviceStatusService
  ) {}

  @Get("enrollment")
  enrollment(@CurrentAgent() agent: AuthenticatedAgent): AgentEnrollment {
    return {
      agentId: agent.id,
      resourceId: agent.resourceId,
      resourceName: agent.resourceName,
      kind: agent.kind,
      collectionIntervalSeconds: agent.collectionIntervalSeconds,
    };
  }

  @Get("tasks")
  poll(@CurrentAgent() agent: AuthenticatedAgent, @Query("limit") limit?: string) {
    return this.agents.poll(agent, limit ? Number(limit) : undefined);
  }

  @Post("heartbeat")
  @HttpCode(200)
  heartbeat(@CurrentAgent() agent: AuthenticatedAgent, @Body() input: AgentHeartbeatDto) {
    return this.agents.heartbeat(agent, input);
  }

  @Post("device-status")
  @HttpCode(200)
  deviceStatus(@CurrentAgent() agent: AuthenticatedAgent, @Body() input: MobileDeviceStatusDto) {
    return this.mobileDeviceStatuses.report(agent, input);
  }
}
