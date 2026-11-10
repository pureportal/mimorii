import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { apiTokenTeamRoles } from "./api-token-scope.js";
import type { AuthenticatedRequest } from "./current-user.decorator.js";

@Injectable()
export class ApiTokenScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const credential = context.switchToHttp().getRequest<AuthenticatedRequest>().authCredential;
    if (credential?.type !== "apiToken") return next.handle();
    return new Observable((subscriber) =>
      apiTokenTeamRoles.run(credential.teamRoles, () => next.handle().subscribe(subscriber))
    );
  }
}
