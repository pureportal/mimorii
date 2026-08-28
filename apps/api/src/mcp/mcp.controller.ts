import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/current-user.decorator.js";
import { McpAuthGuard } from "./mcp-auth.guard.js";
import { McpRequestGuard } from "./mcp-request.guard.js";
import { McpService } from "./mcp.service.js";

@ApiExcludeController()
@Controller("mcp")
@UseGuards(McpRequestGuard, McpAuthGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  handle(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Body() body: unknown
  ): Promise<void> {
    return this.mcp.handle(request, response, body);
  }
}
