import { Injectable } from "@nestjs/common";
import type { SmtpCheckConfig } from "@mimorii/contracts";
import { once } from "node:events";
import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { publicBaseUrl } from "../../common/public-url.js";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { evaluateCertificate, tlsServerName } from "./certificate-evaluation.js";
import {
  CheckFailure,
  elapsedMs,
  failedOutcome,
  type CheckMetrics,
  type CheckOutcome,
} from "../check-outcome.js";

interface SmtpReply {
  code: number;
  lines: string[];
}

const maximumReplyLength = 64 * 1024;

@Injectable()
export class SmtpCheckService {
  constructor(private readonly targets: TargetSafetyService) {}

  async run(config: SmtpCheckConfig, timeoutMs: number): Promise<CheckOutcome> {
    const { host, port, security } = config.target;
    const [address] = await this.targets.resolvePublicHost(host);
    const started = performance.now();
    const session = await SmtpSession.open(
      { host: address!, port, servername: tlsServerName(host), implicitTls: security === "tls" },
      timeoutMs
    );
    try {
      const outcome = await this.converse(session, config, started, timeoutMs);
      session.quit();
      return outcome;
    } catch (error) {
      session.destroy();
      throw error;
    }
  }

  private async converse(
    session: SmtpSession,
    config: SmtpCheckConfig,
    started: number,
    timeoutMs: number
  ): Promise<CheckOutcome> {
    const greeting = await session.reply();
    if (greeting.code !== 220) {
      return failedOutcome(
        "SMTP server rejected the connection",
        elapsedMs(started),
        {},
        greeting.code
      );
    }
    const heloName = new URL(publicBaseUrl()).hostname;
    let hello = await session.command(`EHLO ${heloName}`);
    if (hello.code !== 250) {
      return failedOutcome("SMTP server rejected EHLO", elapsedMs(started), {}, hello.code);
    }
    const startTls = smtpExtension(hello, "STARTTLS") !== null;
    if (config.target.security === "starttls") {
      if (!startTls) {
        return failedOutcome("SMTP server doesn't offer STARTTLS", elapsedMs(started), {
          startTls,
        });
      }
      const ready = await session.command("STARTTLS");
      if (ready.code !== 220) {
        return failedOutcome(
          "SMTP server refused STARTTLS",
          elapsedMs(started),
          { startTls },
          ready.code
        );
      }
      await session.upgrade(tlsServerName(config.target.host));
      hello = await session.command(`EHLO ${heloName}`);
      if (hello.code !== 250) {
        return failedOutcome(
          "SMTP server rejected EHLO",
          elapsedMs(started),
          { startTls },
          hello.code
        );
      }
    }
    const latencyMs = elapsedMs(started);
    const certificate = session.secureSocket
      ? evaluateCertificate(session.secureSocket, config.validateTls, config.certificateWarningDays)
      : null;
    const metrics: CheckMetrics = {
      startTls,
      authMechanisms: smtpExtension(hello, "AUTH") || null,
      maximumMessageBytes: Number(smtpExtension(hello, "SIZE")) || null,
      ...certificate?.metrics,
    };
    if (certificate && certificate.status !== "up") {
      return { ...certificate, metrics, latencyMs, statusCode: hello.code };
    }
    const slow = latencyMs >= timeoutMs * 0.75;
    return {
      status: slow ? "degraded" : "up",
      latencyMs,
      statusCode: hello.code,
      message: slow ? "SMTP response is near the timeout" : null,
      metrics,
    };
  }
}

function smtpExtension(reply: SmtpReply, keyword: string): string | null {
  for (const line of reply.lines.slice(1)) {
    const [name, ...parameters] = line.trim().split(/[\s=]+/);
    if (name?.toUpperCase() === keyword) return parameters.join(" ");
  }
  return null;
}

class SmtpSession {
  secureSocket: TLSSocket | null;
  private buffer = "";
  private failure: Error | null = null;
  private wake: (() => void) | null = null;
  private readonly timer: NodeJS.Timeout;

  private constructor(
    private socket: Socket,
    secure: boolean,
    timeoutMs: number
  ) {
    this.secureSocket = secure ? (socket as TLSSocket) : null;
    this.timer = setTimeout(() => this.socket.destroy(new Error("timeout")), timeoutMs);
    this.listen(socket);
  }

  static async open(
    target: { host: string; port: number; servername: string | undefined; implicitTls: boolean },
    timeoutMs: number
  ): Promise<SmtpSession> {
    const socket = target.implicitTls
      ? connectTls({
          host: target.host,
          port: target.port,
          servername: target.servername,
          rejectUnauthorized: false,
        })
      : connectTcp({ host: target.host, port: target.port });
    const session = new SmtpSession(socket, target.implicitTls, timeoutMs);
    await once(socket, target.implicitTls ? "secureConnect" : "connect");
    return session;
  }

  async reply(): Promise<SmtpReply> {
    for (;;) {
      const reply = this.takeReply();
      if (reply) return reply;
      if (this.failure) throw this.failure;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  command(line: string): Promise<SmtpReply> {
    this.socket.write(`${line}\r\n`);
    return this.reply();
  }

  async upgrade(servername: string | undefined): Promise<void> {
    this.socket.off("data", this.receive);
    const secure = connectTls({ socket: this.socket, servername, rejectUnauthorized: false });
    this.socket = secure;
    this.secureSocket = secure;
    this.listen(secure);
    await once(secure, "secureConnect");
  }

  quit(): void {
    this.socket.end("QUIT\r\n");
  }

  destroy(): void {
    this.socket.destroy();
  }

  private listen(socket: Socket): void {
    socket.on("data", this.receive);
    socket.on("error", (error: Error) => this.fail(error));
    socket.once("close", () => {
      clearTimeout(this.timer);
      this.fail(new CheckFailure("SMTP server closed the connection"));
    });
  }

  private readonly receive = (chunk: Buffer): void => {
    this.buffer += chunk.toString("latin1");
    if (this.buffer.length > maximumReplyLength)
      this.fail(new CheckFailure("SMTP reply is too large"));
    this.notify();
  };

  private fail(error: Error): void {
    this.failure ??= error;
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private takeReply(): SmtpReply | null {
    const lines: string[] = [];
    let offset = 0;
    for (;;) {
      const end = this.buffer.indexOf("\n", offset);
      if (end < 0) return null;
      const match = /^(\d{3})([ -]?)(.*)$/.exec(this.buffer.slice(offset, end).replace(/\r$/, ""));
      if (!match) throw new CheckFailure("SMTP reply is invalid");
      offset = end + 1;
      lines.push(match[3]!);
      if (match[2] !== "-") {
        this.buffer = this.buffer.slice(offset);
        return { code: Number(match[1]), lines };
      }
    }
  }
}
