import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import {
  CreateHeartbeatMonitorDto,
  HeartbeatSignalDto,
  UpdateHeartbeatMonitorDto,
} from "./heartbeats.dto.js";
import { HeartbeatsService } from "./heartbeats.service.js";

const heartbeatRateLimit = Math.min(
  Math.max(Number(process.env.MIMORII_HEARTBEAT_RATE_LIMIT) || 2_000, 10),
  100_000
);

@ApiTags("Heartbeats")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/heartbeats")
export class HeartbeatsController {
  constructor(private readonly heartbeats: HeartbeatsService) {}

  @Get()
  @ApiQuery({ name: "resourceId", required: false, format: "uuid" })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Query("resourceId") resourceId?: string
  ) {
    return this.heartbeats.list(user.id, teamId, resourceId);
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.heartbeats.get(user.id, teamId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateHeartbeatMonitorDto
  ) {
    return this.heartbeats.create(user.id, teamId, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateHeartbeatMonitorDto
  ) {
    return this.heartbeats.update(user.id, teamId, id, input);
  }

  @Post(":id/rotate-token")
  @HttpCode(200)
  rotateToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.heartbeats.rotateToken(user.id, teamId, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.heartbeats.remove(user.id, teamId, id);
  }

  @Get(":id/history")
  @ApiQuery({ name: "limit", required: false, minimum: 1, maximum: 1000 })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Query("limit") limit?: string
  ) {
    return this.heartbeats.history(user.id, teamId, id, Number(limit) || 200);
  }
}

@ApiTags("Heartbeat ingestion")
@Controller("heartbeats")
export class HeartbeatIngestionController {
  constructor(private readonly heartbeats: HeartbeatsService) {}

  @Post(":token")
  @HttpCode(202)
  @Throttle({ default: { limit: heartbeatRateLimit, ttl: 60_000 } })
  succeeded(@Param("token") token: string, @Body() input: HeartbeatSignalDto) {
    return this.heartbeats.signal(token, "succeeded", input);
  }

  @Post(":token/start")
  @HttpCode(202)
  @Throttle({ default: { limit: heartbeatRateLimit, ttl: 60_000 } })
  started(@Param("token") token: string, @Body() input: HeartbeatSignalDto) {
    return this.heartbeats.signal(token, "started", input);
  }

  @Post(":token/fail")
  @HttpCode(202)
  @Throttle({ default: { limit: heartbeatRateLimit, ttl: 60_000 } })
  failed(@Param("token") token: string, @Body() input: HeartbeatSignalDto) {
    return this.heartbeats.signal(token, "failed", input);
  }
}
