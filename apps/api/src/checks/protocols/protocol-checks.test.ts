import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { once } from "node:events";
import { createServer as createHttp2Server, type Http2Server } from "node:http2";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PinnedRequestOptions, PinnedResponse } from "../../common/pinned-request.js";
import { TargetSafetyService } from "../../common/target-safety.service.js";
import { evaluateCertificate, type CertificateSocket } from "./certificate-evaluation.js";
import { DomainCheckService, domainRegistration, registryServers } from "./domain-check.service.js";
import {
  GrpcCheckService,
  decodeServingStatus,
  encodeHealthRequest,
} from "./grpc-check.service.js";
import { NtpCheckService } from "./ntp-check.service.js";
import { SmtpCheckService } from "./smtp-check.service.js";

const { pinnedRequestMock } = vi.hoisted(() => ({
  pinnedRequestMock:
    vi.fn<(url: URL, address: string, options: PinnedRequestOptions) => Promise<PinnedResponse>>(),
}));

vi.mock("../../common/pinned-request.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../common/pinned-request.js")>()),
  pinnedRequest: pinnedRequestMock,
}));

const targets = new TargetSafetyService();
vi.spyOn(targets, "resolvePublicHost").mockResolvedValue(["127.0.0.1"]);
vi.spyOn(targets, "resolveStrictPublicHost").mockResolvedValue([
  { address: "203.0.113.10", family: 4 },
]);

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function smtpServer(script: (command: string) => string | null, greeting: string) {
  const server: Server = createTcpServer((socket) => {
    socket.write(greeting);
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let end = buffer.indexOf("\r\n");
      while (end >= 0) {
        const reply = script(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (reply === null) socket.end("221 Bye\r\n");
        else socket.write(reply);
        end = buffer.indexOf("\r\n");
      }
    });
    socket.on("error", () => undefined);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

async function ntpServer(answer: (request: Buffer) => Buffer) {
  const server: UdpSocket = createSocket("udp4");
  server.on("message", (message, remote) =>
    server.send(answer(message), remote.port, remote.address)
  );
  server.bind(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return server.address().port;
}

function ntpAnswer(request: Buffer, stratum: number, leapIndicator = 0): Buffer {
  const response = Buffer.alloc(48);
  response[0] = (leapIndicator << 6) | (4 << 3) | 4;
  response[1] = stratum;
  response.write("GPS\0", 12, "latin1");
  request.copy(response, 24, 40, 48);
  request.copy(response, 32, 40, 48);
  request.copy(response, 40, 40, 48);
  return response;
}

async function grpcServer(reply: "serving" | "not-serving" | "unknown") {
  const server: Http2Server = createHttp2Server();
  server.on("stream", (stream, headers) => {
    expect(headers[":path"]).toBe("/grpc.health.v1.Health/Check");
    stream.on("data", () => undefined);
    stream.on("end", () => {
      if (reply === "unknown") {
        stream.respond(
          { ":status": 200, "content-type": "application/grpc", "grpc-status": "5" },
          { endStream: true }
        );
        return;
      }
      stream.respond(
        { ":status": 200, "content-type": "application/grpc" },
        { waitForTrailers: true }
      );
      stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": "0" }));
      stream.end(Buffer.from([0, 0, 0, 0, 2, 0x08, reply === "serving" ? 1 : 2]));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

function certificateSocket(
  validTo: Date,
  authorized: boolean,
  authorizationError: string | null = null
): CertificateSocket {
  return {
    authorized,
    authorizationError: authorizationError as unknown as Error,
    getPeerCertificate: () =>
      ({
        valid_from: new Date(Date.now() - 86_400_000).toUTCString(),
        valid_to: validTo.toUTCString(),
        issuer: { O: "Example CA" },
        subject: { CN: "mail.example.com" },
      }) as never,
    getProtocol: () => "TLSv1.3",
    getCipher: () => ({ name: "TLS_AES_256_GCM_SHA384" }) as never,
  };
}

describe("SMTP checks", () => {
  const extensions = "250-mail.test\r\n250-SIZE 1000\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n";

  it("reads the greeting and advertised extensions", async () => {
    const port = await smtpServer(
      (command) =>
        command.startsWith("EHLO") ? extensions : command === "QUIT" ? null : "500 No\r\n",
      "220 mail.test ESMTP\r\n"
    );
    const result = await new SmtpCheckService(targets).run(
      { target: { host: "mail.test", port, security: "none" }, validateTls: true },
      2_000
    );
    expect(result).toMatchObject({
      status: "up",
      statusCode: 250,
      metrics: { startTls: true, authMechanisms: "PLAIN LOGIN", maximumMessageBytes: 1000 },
    });
  });

  it("fails when STARTTLS is required but missing or the greeting is rejected", async () => {
    const plain = await smtpServer(
      (command) => (command.startsWith("EHLO") ? "250-mail.test\r\n250 SIZE 1000\r\n" : null),
      "220 mail.test ESMTP\r\n"
    );
    const missing = await new SmtpCheckService(targets).run(
      { target: { host: "mail.test", port: plain, security: "starttls" }, validateTls: true },
      2_000
    );
    expect(missing).toMatchObject({
      status: "down",
      message: "SMTP server doesn't offer STARTTLS",
    });

    const busy = await smtpServer(() => null, "554 Service unavailable\r\n");
    const rejected = await new SmtpCheckService(targets).run(
      { target: { host: "mail.test", port: busy, security: "none" }, validateTls: true },
      2_000
    );
    expect(rejected).toMatchObject({
      status: "down",
      statusCode: 554,
      message: "SMTP server rejected the connection",
    });
  });
});

describe("NTP checks", () => {
  it("measures the clock offset of a synchronized server", async () => {
    const port = await ntpServer((request) => ntpAnswer(request, 1));
    const result = await new NtpCheckService(targets).run(
      { target: { host: "time.test", port }, offsetWarningMs: 500 },
      2_000
    );
    expect(result.status).toBe("up");
    expect(result.metrics).toMatchObject({ stratum: 1, referenceId: "GPS" });
    expect(result.metrics.clockOffsetMs).toBeLessThan(500);
  });

  it("rejects unsynchronized servers and mismatched replies", async () => {
    const unsynchronized = await ntpServer((request) => ntpAnswer(request, 16));
    const result = await new NtpCheckService(targets).run(
      { target: { host: "time.test", port: unsynchronized }, offsetWarningMs: 500 },
      2_000
    );
    expect(result).toMatchObject({ status: "down", message: "NTP server is not synchronized" });

    const spoofed = await ntpServer((request) => {
      const answer = ntpAnswer(request, 2);
      answer.fill(0, 24, 32);
      return answer;
    });
    const invalid = await new NtpCheckService(targets).run(
      { target: { host: "time.test", port: spoofed }, offsetWarningMs: 500 },
      2_000
    );
    expect(invalid).toMatchObject({ status: "down", message: "NTP response is invalid" });
  });
});

describe("gRPC checks", () => {
  it("encodes health requests and decodes serving states", () => {
    expect([...encodeHealthRequest("")]).toEqual([0, 0, 0, 0, 0]);
    expect([...encodeHealthRequest("api")]).toEqual([0, 0, 0, 0, 5, 0x0a, 3, 97, 112, 105]);
    expect(decodeServingStatus(Buffer.from([0, 0, 0, 0, 2, 0x08, 1]))).toBe(1);
    expect(decodeServingStatus(Buffer.from([0, 0, 0, 0, 0]))).toBe(0);
  });

  it.each([
    ["serving", "up", null],
    ["not-serving", "down", "gRPC service is not serving"],
    ["unknown", "down", "gRPC service is unknown"],
  ] as const)("reports %s health responses", async (reply, status, message) => {
    const port = await grpcServer(reply);
    const result = await new GrpcCheckService(targets).run(
      { target: { host: "grpc.test", port, tls: false, service: "api" }, validateTls: true },
      2_000
    );
    expect(result).toMatchObject({ status, message });
  });
});

describe("certificate evaluation", () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 + 3_600_000);

  it("classifies expiry and trust", () => {
    expect(evaluateCertificate(certificateSocket(inDays(90), true), true, 21)).toMatchObject({
      status: "up",
      metrics: { certificateDaysRemaining: 90, certificateIssuer: "Example CA" },
    });
    expect(evaluateCertificate(certificateSocket(inDays(10), true), true, 21)).toMatchObject({
      status: "degraded",
      message: "TLS certificate is nearing expiration",
    });
    expect(evaluateCertificate(certificateSocket(inDays(-2), false), false, 21)).toMatchObject({
      status: "down",
      message: "TLS certificate has expired",
    });
    const selfSigned = certificateSocket(inDays(90), false, "DEPTH_ZERO_SELF_SIGNED_CERT");
    expect(evaluateCertificate(selfSigned, true, 21)).toMatchObject({
      status: "down",
      message: "TLS certificate is self-signed",
    });
    expect(evaluateCertificate(selfSigned, false, 21).status).toBe("up");
  });
});

describe("domain checks", () => {
  const bootstrap = {
    services: [[["com", "net"], ["https://rdap.registry.test/v1"]]],
  };

  function registration(expiresAt: Date, status: string[] = ["client transfer prohibited"]) {
    return {
      status,
      events: [
        { eventAction: "registration", eventDate: "2001-01-01T00:00:00Z" },
        { eventAction: "expiration", eventDate: expiresAt.toISOString() },
      ],
      entities: [
        {
          roles: ["registrar"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "Example Registrar"],
            ],
          ],
        },
      ],
    };
  }

  it("parses registry directories and registration records", () => {
    expect(registryServers(bootstrap).get("net")).toBe("https://rdap.registry.test/v1/");
    const parsed = domainRegistration(
      registration(new Date("2030-05-01T00:00:00Z"), ["pending delete"])
    );
    expect(parsed).toEqual({
      expiresAt: new Date("2030-05-01T00:00:00Z"),
      registrar: "Example Registrar",
      pendingDeletion: true,
    });
  });

  it("reports registration expiry from RDAP", async () => {
    const requested: string[] = [];
    const record = registration(new Date(Date.now() + 10 * 86_400_000 + 3_600_000));
    pinnedRequestMock.mockImplementation(async (url, address) => {
      requested.push(`${url.toString()} via ${address}`);
      const body = url.hostname === "data.iana.org" ? bootstrap : record;
      return { status: 200, headers: {}, body: Buffer.from(JSON.stringify(body)) };
    });
    const service = new DomainCheckService(targets);
    const result = await service.run(
      { target: { domain: "example.com" }, expiryWarningDays: 30 },
      2_000
    );
    expect(result).toMatchObject({
      status: "degraded",
      message: "Domain registration is nearing expiration",
      metrics: { registrar: "Example Registrar", domainDaysRemaining: 10 },
    });
    const unsupported = await service.run(
      { target: { domain: "example.de" }, expiryWarningDays: 30 },
      2_000
    );
    expect(unsupported).toMatchObject({
      status: "down",
      message: "Registration data isn't published for .de domains",
    });
    expect(requested).toEqual([
      "https://data.iana.org/rdap/dns.json via 203.0.113.10",
      "https://rdap.registry.test/v1/domain/example.com via 203.0.113.10",
    ]);
  });
});
