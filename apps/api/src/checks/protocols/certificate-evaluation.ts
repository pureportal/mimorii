import { isIP } from "node:net";
import type { TLSSocket } from "node:tls";
import type { CheckMetrics } from "../check-outcome.js";

export type CertificateSocket = Pick<
  TLSSocket,
  "authorized" | "authorizationError" | "getPeerCertificate" | "getProtocol" | "getCipher"
>;

export interface CertificateEvaluation {
  status: "up" | "degraded" | "down";
  message: string | null;
  metrics: CheckMetrics;
}

const authorizationProblems: Record<string, string> = {
  CERT_HAS_EXPIRED: "TLS certificate has expired",
  CERT_NOT_YET_VALID: "TLS certificate is not valid yet",
  CERT_REVOKED: "TLS certificate was revoked",
  DEPTH_ZERO_SELF_SIGNED_CERT: "TLS certificate is self-signed",
  SELF_SIGNED_CERT_IN_CHAIN: "TLS certificate chain is not trusted",
  UNABLE_TO_GET_ISSUER_CERT: "TLS certificate chain is incomplete",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS certificate chain is not trusted",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS certificate chain is incomplete",
  ERR_TLS_CERT_ALTNAME_INVALID: "TLS certificate doesn't match the host",
};

export function tlsServerName(host: string): string | undefined {
  return isIP(host) ? undefined : host;
}

export function evaluateCertificate(
  socket: CertificateSocket,
  validate: boolean,
  warningDays: number | undefined
): CertificateEvaluation {
  const certificate = socket.getPeerCertificate();
  const metrics: CheckMetrics = {
    tlsProtocol: socket.getProtocol(),
    tlsCipher: socket.getCipher()?.name ?? null,
    certificateTrusted: socket.authorized,
  };
  const issuer = certificate.issuer?.O ?? certificate.issuer?.CN ?? null;
  metrics.certificateIssuer = Array.isArray(issuer) ? issuer.join(", ") : issuer;
  const subject = certificate.subject?.CN ?? null;
  metrics.certificateSubject = Array.isArray(subject) ? subject.join(", ") : subject;
  if (!certificate.valid_to) {
    return { status: "down", message: "TLS certificate is unavailable", metrics };
  }
  const now = Date.now();
  const expiresAt = new Date(certificate.valid_to).getTime();
  const daysRemaining = Math.floor((expiresAt - now) / 86_400_000);
  metrics.certificateExpiresAt = new Date(expiresAt).toISOString();
  metrics.certificateDaysRemaining = daysRemaining;
  if (expiresAt <= now) return { status: "down", message: "TLS certificate has expired", metrics };
  if (new Date(certificate.valid_from).getTime() > now) {
    return { status: "down", message: "TLS certificate is not valid yet", metrics };
  }
  if (validate && !socket.authorized) {
    const problem = authorizationProblems[String(socket.authorizationError)];
    return { status: "down", message: problem ?? "TLS validation failed", metrics };
  }
  if (warningDays !== undefined && daysRemaining <= warningDays) {
    return { status: "degraded", message: "TLS certificate is nearing expiration", metrics };
  }
  return { status: "up", message: null, metrics };
}
