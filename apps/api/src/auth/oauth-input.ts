import * as z from "zod/v4";
import { OAuthException } from "./oauth-error.js";

const scope = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/);
const clientId = z.string().min(1).max(2_048);
const resource = z.string().min(1).max(2_048);

export const oauthAuthorizationRequestSchema = z
  .object({
    response_type: z.literal("code"),
    client_id: clientId,
    redirect_uri: z.string().min(1).max(2_048),
    scope: scope.optional(),
    state: z.string().min(1).max(512).optional(),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
    resource,
  })
  .strict();

export const oauthAuthorizationDecisionSchema = oauthAuthorizationRequestSchema.extend({
  decision: z.enum(["approve", "deny"]),
});

export const oauthTokenRequestSchema = z
  .object({
    grant_type: z.string().min(1).max(128),
    client_id: clientId,
    resource,
    code: z.string().min(1).max(512).optional(),
    code_verifier: z
      .string()
      .regex(/^[A-Za-z0-9._~-]{43,128}$/)
      .optional(),
    redirect_uri: z.string().min(1).max(2_048).optional(),
    refresh_token: z.string().min(1).max(512).optional(),
    scope: scope.optional(),
  })
  .strict();

export const oauthRevocationRequestSchema = z
  .object({
    token: z.string().min(1).max(512),
    client_id: clientId,
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  })
  .strict();

export type OAuthAuthorizationRequest = z.infer<typeof oauthAuthorizationRequestSchema>;
export type OAuthAuthorizationDecision = z.infer<typeof oauthAuthorizationDecisionSchema>;
export type OAuthTokenRequest = z.infer<typeof oauthTokenRequestSchema>;
export type OAuthRevocationRequest = z.infer<typeof oauthRevocationRequestSchema>;

export function parseOAuthInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new OAuthException("invalid_request", "OAuth request is invalid");
  return parsed.data;
}
