import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/rows.js";
import {
  CreateStatusPageDto,
  SubscribeStatusPageDto,
  UpdateStatusPageDto,
} from "./status-pages.dto.js";
import { StatusPagesService } from "./status-pages.service.js";

@ApiTags("Status pages")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("teams/:teamId/status-pages")
export class StatusPagesController {
  constructor(private readonly statusPages: StatusPagesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("teamId") teamId: string) {
    return this.statusPages.list(user.id, teamId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Body() input: CreateStatusPageDto
  ) {
    return this.statusPages.create(user.id, teamId, input);
  }

  @Get(":id/subscribers")
  subscribers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.statusPages.subscribers(user.id, teamId, id);
  }

  @Delete(":id/subscribers/:subscriberId")
  @HttpCode(204)
  removeSubscriber(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Param("subscriberId") subscriberId: string
  ) {
    return this.statusPages.removeSubscriber(user.id, teamId, id, subscriberId);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Body() input: UpdateStatusPageDto
  ) {
    return this.statusPages.update(user.id, teamId, id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("id") id: string
  ) {
    return this.statusPages.remove(user.id, teamId, id);
  }
}

@ApiTags("Public status")
@Controller("public/status-pages")
export class PublicStatusPagesController {
  constructor(private readonly statusPages: StatusPagesService) {}

  @Get(":id/:slug")
  get(@Param("id") id: string, @Param("slug") _slug: string) {
    return this.statusPages.publicPage(id);
  }

  @Post(":id/:slug/subscribers")
  subscribe(
    @Param("id") id: string,
    @Param("slug") _slug: string,
    @Body() input: SubscribeStatusPageDto
  ) {
    return this.statusPages.subscribe(id, input);
  }

  @Post("subscriptions/:token/verify")
  @HttpCode(200)
  verify(@Param("token") token: string) {
    return this.statusPages.verify(token);
  }

  @Post("subscriptions/:reference/unsubscribe")
  @HttpCode(200)
  unsubscribe(@Param("reference") reference: string) {
    return this.statusPages.unsubscribe(reference);
  }
}
