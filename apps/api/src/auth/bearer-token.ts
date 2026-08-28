import type { Request } from "express";

export function readBearerToken(request: Pick<Request, "headers">): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization) return undefined;
  const match = /^Bearer[\t ]+([^\s,]+)$/i.exec(authorization.trim());
  return match?.[1];
}
