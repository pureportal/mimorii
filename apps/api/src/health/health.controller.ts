import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DatabaseService } from "../database/database.service.js";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOkResponse({ description: "API and database health" })
  async health() {
    const database = (await this.database.get<{ ok: number }>("SELECT 1 AS ok"))?.ok === 1;
    return {
      status: database ? "ok" : "unavailable",
      database,
      scheduler: process.env.MIMORII_SCHEDULER_ENABLED !== "false",
      time: new Date().toISOString(),
      version: "2.0.1",
    };
  }
}
