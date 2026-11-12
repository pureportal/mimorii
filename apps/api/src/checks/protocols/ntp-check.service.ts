import { Injectable } from "@nestjs/common";
import type { NtpCheckConfig } from "@mimorii/contracts";
import { createSocket } from "node:dgram";
import { isIPv6 } from "node:net";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { failedOutcome, type CheckOutcome } from "../check-outcome.js";

export interface NtpMeasurement {
  stratum: number;
  leapIndicator: number;
  referenceId: string | null;
  offsetMs: number;
  roundTripMs: number;
}

const ntpEpochOffsetSeconds = 2_208_988_800;
const packetLength = 48;

@Injectable()
export class NtpCheckService {
  constructor(private readonly targets: TargetSafetyService) {}

  async run(config: NtpCheckConfig, timeoutMs: number): Promise<CheckOutcome> {
    const [address] = await this.targets.resolvePublicHost(config.target.host);
    const request = Buffer.alloc(packetLength);
    request[0] = 0x23;
    const sentAt = Date.now();
    writeTimestamp(request, 40, sentAt);
    const started = performance.now();
    const response = await exchange(address!, config.target.port, request, timeoutMs);
    const measurement = ntpMeasurement(
      response,
      request,
      sentAt,
      sentAt + (performance.now() - started)
    );
    if (!measurement) return failedOutcome("NTP response is invalid");
    const latencyMs = Math.round(measurement.roundTripMs * 10) / 10;
    const clockOffsetMs = Math.round(Math.abs(measurement.offsetMs) * 10) / 10;
    const metrics = {
      clockOffsetMs,
      stratum: measurement.stratum,
      referenceId: measurement.referenceId,
    };
    if (measurement.stratum === 0) {
      return failedOutcome("NTP server refused the request", latencyMs, metrics);
    }
    if (measurement.leapIndicator === 3 || measurement.stratum >= 16) {
      return failedOutcome("NTP server is not synchronized", latencyMs, metrics);
    }
    const drifting = clockOffsetMs >= config.offsetWarningMs;
    return {
      status: drifting ? "degraded" : "up",
      latencyMs,
      statusCode: null,
      message: drifting ? "Clock offset exceeded the warning threshold" : null,
      metrics,
    };
  }
}

export function ntpMeasurement(
  response: Buffer,
  request: Buffer,
  sentAt: number,
  receivedAt: number
): NtpMeasurement | null {
  if (response.length < packetLength || (response[0]! & 0x07) !== 4) return null;
  if (!response.subarray(24, 32).equals(request.subarray(40, 48))) return null;
  const serverReceivedAt = readTimestamp(response, 32);
  const serverSentAt = readTimestamp(response, 40);
  const stratum = response[1]!;
  const referenceId =
    stratum <= 1
      ? response
          .subarray(12, 16)
          .toString("latin1")
          .replace(/[^\x20-\x7e]/g, "")
          .trim() || null
      : null;
  return {
    stratum,
    leapIndicator: response[0]! >> 6,
    referenceId,
    offsetMs: (serverReceivedAt - sentAt + (serverSentAt - receivedAt)) / 2,
    roundTripMs: Math.max(0, receivedAt - sentAt - (serverSentAt - serverReceivedAt)),
  };
}

function exchange(
  address: string,
  port: number,
  request: Buffer,
  timeoutMs: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(isIPv6(address) ? "udp6" : "udp4");
    const timer = setTimeout(() => finish(new Error("timeout")), timeoutMs);
    let settled = false;
    const finish = (error: Error | null, message?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(message!);
    };
    socket.on("error", (error) => finish(error));
    socket.once("message", (message) => finish(null, message));
    socket.send(request, port, address, (error) => {
      if (error) finish(error);
    });
  });
}

function writeTimestamp(buffer: Buffer, offset: number, milliseconds: number): void {
  const seconds = Math.floor(milliseconds / 1_000);
  const fraction = Math.min(0xffffffff, Math.round(((milliseconds % 1_000) / 1_000) * 2 ** 32));
  buffer.writeUInt32BE(seconds + ntpEpochOffsetSeconds, offset);
  buffer.writeUInt32BE(fraction, offset + 4);
}

function readTimestamp(buffer: Buffer, offset: number): number {
  const seconds = buffer.readUInt32BE(offset) - ntpEpochOffsetSeconds;
  return (seconds + buffer.readUInt32BE(offset + 4) / 2 ** 32) * 1_000;
}
