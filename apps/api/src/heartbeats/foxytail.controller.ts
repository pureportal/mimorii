import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { FoxytailService } from "./foxytail.service.js";

export class EnrollFoxytailDto {
  @ApiProperty({ minLength: 1, maxLength: 100, default: "Foxytail" })
  @IsString()
  @Length(1, 100)
  name!: string;
}

@ApiTags("Heartbeats")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/heartbeats/foxytail")
export class FoxytailController {
  constructor(private readonly foxytail: FoxytailService) {}

  @Post()
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: EnrollFoxytailDto
  ) {
    return this.foxytail.enroll(user.id, teamId, input.name);
  }
}
