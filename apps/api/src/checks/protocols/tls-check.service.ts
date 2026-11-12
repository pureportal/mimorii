import { Injectable } from "@nestjs/common";
import type { TlsCheckConfig } from "@mimorii/contracts";
import { once } from "node:events";
import { connect } from "node:tls";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { evaluateCertificate, tlsServerName } from "./certificate-evaluation.js";
import { elapsedMs, type CheckOutcome } from "../check-outcome.js";

@Injectable()
export class TlsCheckService {
  constructor(private readonly targets: TargetSafetyService) {}

  async run(config: TlsCheckConfig, timeoutMs: number): Promise<CheckOutcome> {
    const [address] = await this.targets.resolvePublicHost(config.target.host);
    const started = performance.now();
    const socket = connect({
      host: address!,
      port: config.target.port,
      servername: config.target.serverName ?? tlsServerName(config.target.host),
      rejectUnauthorized: false,
    });
    const timer = setTimeout(() => socket.destroy(new Error("timeout")), timeoutMs);
    try {
      await once(socket, "secureConnect");
      const latencyMs = elapsedMs(started);
      const certificate = evaluateCertificate(
        socket,
        config.validateTls,
        config.certificateWarningDays
      );
      return { ...certificate, latencyMs, statusCode: null };
    } finally {
      clearTimeout(timer);
      socket.destroy();
    }
  }
}
