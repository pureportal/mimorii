import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TeamsModule } from "../teams/teams.module.js";
import { NotificationPoliciesService } from "./notification-policies.service.js";
import { FirebasePushProvider } from "./firebase-push.provider.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { PushDeliveryService } from "./push-delivery.service.js";
import { PushEndpointsService } from "./push-endpoints.service.js";
import { WebPushProvider } from "./web-push.provider.js";

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPoliciesService,
    PushEndpointsService,
    PushDeliveryService,
    WebPushProvider,
    FirebasePushProvider,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
