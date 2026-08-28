import { HttpException, HttpStatus } from "@nestjs/common";

export type OAuthErrorCode =
  | "access_denied"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_scope"
  | "unsupported_grant_type"
  | "unsupported_response_type";

export class OAuthException extends HttpException {
  constructor(
    public readonly code: OAuthErrorCode,
    description: string,
    status = HttpStatus.BAD_REQUEST
  ) {
    super({ error: code, error_description: description }, status);
  }
}
