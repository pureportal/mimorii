import { Injectable } from "@nestjs/common";
import type { GrpcCheckConfig } from "@mimorii/contracts";
import { connect as connectHttp2, type ClientHttp2Session } from "node:http2";
import { connect as connectTcp } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { evaluateCertificate, tlsServerName } from "./certificate-evaluation.js";
import {
  CheckFailure,
  elapsedMs,
  failedOutcome,
  type CheckMetrics,
  type CheckOutcome,
} from "../check-outcome.js";

interface HealthReply {
  httpStatus: number;
  grpcStatus: number | null;
  body: Buffer;
}

const servingStatuses = ["Unknown", "Serving", "Not serving", "Service unknown"] as const;
const maximumReplyBytes = 64 * 1024;

@Injectable()
export class GrpcCheckService {
  constructor(private readonly targets: TargetSafetyService) {}

  async run(config: GrpcCheckConfig, timeoutMs: number): Promise<CheckOutcome> {
    const { host, port, tls, service } = config.target;
    const [address] = await this.targets.resolvePublicHost(host);
    const authorityHost = host.includes(":") ? `[${host}]` : host;
    const connection: { secureSocket?: TLSSocket } = {};
    const started = performance.now();
    const session = connectHttp2(`${tls ? "https" : "http"}://${authorityHost}:${port}`, {
      createConnection: () => {
        if (!tls) return connectTcp({ host: address!, port });
        connection.secureSocket = connectTls({
          host: address!,
          port,
          servername: tlsServerName(host),
          ALPNProtocols: ["h2"],
          rejectUnauthorized: false,
        });
        return connection.secureSocket;
      },
    });
    const timer = setTimeout(() => session.destroy(new Error("timeout")), timeoutMs);
    try {
      const reply = await healthCheck(session, service ?? "");
      const latencyMs = elapsedMs(started);
      const certificate = connection.secureSocket
        ? evaluateCertificate(connection.secureSocket, config.validateTls, undefined)
        : null;
      const serving = reply.grpcStatus === 0 ? decodeServingStatus(reply.body) : null;
      const metrics: CheckMetrics = {
        grpcStatus: reply.grpcStatus,
        servingStatus: serving === null ? null : (servingStatuses[serving] ?? String(serving)),
        ...certificate?.metrics,
      };
      if (reply.httpStatus !== 200) {
        return failedOutcome(
          "gRPC endpoint returned an HTTP error",
          latencyMs,
          metrics,
          reply.httpStatus
        );
      }
      if (reply.grpcStatus === 12) {
        return failedOutcome(
          "Server doesn't implement the gRPC health service",
          latencyMs,
          metrics
        );
      }
      if (reply.grpcStatus === 5 || serving === 3) {
        return failedOutcome("gRPC service is unknown", latencyMs, metrics);
      }
      if (reply.grpcStatus !== 0)
        return failedOutcome("gRPC health check failed", latencyMs, metrics);
      if (serving !== 1) return failedOutcome("gRPC service is not serving", latencyMs, metrics);
      if (certificate && certificate.status !== "up") {
        return { ...certificate, metrics, latencyMs, statusCode: null };
      }
      const slow = latencyMs >= timeoutMs * 0.75;
      return {
        status: slow ? "degraded" : "up",
        latencyMs,
        statusCode: null,
        message: slow ? "gRPC response is near the timeout" : null,
        metrics,
      };
    } finally {
      clearTimeout(timer);
      session.destroy();
    }
  }
}

function healthCheck(session: ClientHttp2Session, service: string): Promise<HealthReply> {
  return new Promise((resolve, reject) => {
    session.on("error", reject);
    const request = session.request({
      ":method": "POST",
      ":path": "/grpc.health.v1.Health/Check",
      "content-type": "application/grpc",
      te: "trailers",
    });
    let httpStatus = 0;
    let grpcStatus: number | null = null;
    const chunks: Buffer[] = [];
    let bytes = 0;
    request.on("response", (headers) => {
      httpStatus = Number(headers[":status"]);
      if (headers["grpc-status"] !== undefined) grpcStatus = Number(headers["grpc-status"]);
    });
    request.on("trailers", (trailers) => {
      if (trailers["grpc-status"] !== undefined) grpcStatus = Number(trailers["grpc-status"]);
    });
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maximumReplyBytes) request.destroy(new CheckFailure("gRPC reply is too large"));
      else chunks.push(chunk);
    });
    request.on("end", () => resolve({ httpStatus, grpcStatus, body: Buffer.concat(chunks) }));
    request.on("error", reject);
    request.end(encodeHealthRequest(service));
  });
}

export function encodeHealthRequest(service: string): Buffer {
  const name = Buffer.from(service, "utf8");
  const message = name.length
    ? Buffer.concat([Buffer.from([0x0a]), varint(name.length), name])
    : Buffer.alloc(0);
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(message.length, 1);
  return Buffer.concat([prefix, message]);
}

export function decodeServingStatus(body: Buffer): number | null {
  if (body.length < 5 || body[0] !== 0) return null;
  const message = body.subarray(5, 5 + body.readUInt32BE(1));
  if (message.length === 0) return 0;
  return message[0] === 0x08 && message.length >= 2 ? message[1]! : null;
}

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}
