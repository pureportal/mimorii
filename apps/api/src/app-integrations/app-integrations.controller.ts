import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { appKinds, type AppKind } from "@mimorii/contracts";
import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import { AppIntegrationsService } from "./app-integrations.service.js";

export class CreateAppDto {
  @ApiProperty({ enum: appKinds })
  @IsIn(appKinds)
  kind!: AppKind;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  address?: string;
}

@ApiTags("Apps")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/apps")
export class AppIntegrationsController {
  constructor(private readonly apps: AppIntegrationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateAppDto
  ) {
    return this.apps.create(user.id, teamId, input);
  }
}
