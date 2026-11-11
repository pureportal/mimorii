import type { LogIngestionResult } from "@mimorii/contracts";
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { readBearerToken } from "../auth/bearer-token.js";
import { LogIngestionRateLimitError } from "./log-ingestion-limiter.js";
import {
  parseLokiLogPayload,
  parseNativeLogPayload,
  parseNdjsonLogPayload,
  parseOtlpLogPayload,
  type ParsedLogPayload,
} from "./log-ingestion-payloads.js";
import { LogIngestionService } from "./log-ingestion.service.js";
import { decodeLokiProtobuf, decodeOtlpProtobuf } from "./wire/log-protobuf.js";
import { WirePayloadError } from "./wire/protobuf-reader.js";

const logIngestionRateLimit = Math.min(
  Math.max(Number(process.env.MIMORII_LOG_INGESTION_RATE_LIMIT) || 1_200, 10),
  100_000
);

const ingestionThrottle = { default: { limit: logIngestionRateLimit, ttl: 60_000 } };
const protobufTypes = ["application/x-protobuf", "application/protobuf"];
const ndjsonTypes = ["application/x-ndjson", "application/jsonl", "application/x-jsonlines"];

const labelsSchema = { type: "object" as const, additionalProperties: { type: "string" } };

const nativeEntrySchema = {
  type: "object" as const,
  required: ["message"],
  properties: {
    message: { type: "string", maxLength: 65_536 },
    level: { type: "string", example: "error" },
    timestamp: { oneOf: [{ type: "string", format: "date-time" }, { type: "number" }] },
    labels: labelsSchema,
    attributes: {
      type: "object",
      additionalProperties: {
        oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
      },
    },
  },
};

const nativeBody = {
  schema: {
    oneOf: [
      {
        type: "object",
        required: ["entries"],
        properties: {
          labels: labelsSchema,
          entries: { type: "array", maxItems: 5_000, items: nativeEntrySchema },
        },
      },
      nativeEntrySchema,
      { type: "array", maxItems: 5_000, items: nativeEntrySchema },
      { type: "string" },
    ],
  },
};

@ApiTags("Log ingestion")
@ApiBearerAuth("log-source-token")
@Controller()
export class LogIngestionController {
  constructor(private readonly ingestion: LogIngestionService) {}

  @Post("logs/push")
  @HttpCode(202)
  @Throttle(ingestionThrottle)
  @ApiConsumes("application/json", "application/x-ndjson", "text/plain")
  @ApiBody(nativeBody)
  push(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.pushNative(sourceToken(request), request, response);
  }

  @Post("logs/push/:token")
  @HttpCode(202)
  @Throttle(ingestionThrottle)
  @ApiConsumes("application/json", "application/x-ndjson", "text/plain")
  @ApiBody(nativeBody)
  pushWithToken(
    @Param("token") token: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.pushNative(token, request, response);
  }

  @Post("loki/api/v1/push")
  @HttpCode(204)
  @Throttle(ingestionThrottle)
  @ApiConsumes("application/json", "application/x-protobuf")
  async lokiPush(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const result = await this.ingest(
      sourceToken(request),
      () =>
        request.is(protobufTypes)
          ? parseLokiLogPayload(decodeWire(() => decodeLokiProtobuf(bufferBody(request))))
          : parseLokiLogPayload(jsonBody(request)),
      request,
      response
    );
    if (result.rejected) throw new BadRequestException(resultMessage(result));
  }

  @Post("otlp/v1/logs")
  @HttpCode(200)
  @Throttle(ingestionThrottle)
  @ApiConsumes("application/json", "application/x-protobuf")
  async otlpLogs(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const protobuf = Boolean(request.is(protobufTypes));
    const result = await this.ingest(
      sourceToken(request),
      () =>
        protobuf
          ? parseOtlpLogPayload(decodeWire(() => decodeOtlpProtobuf(bufferBody(request))))
          : parseOtlpLogPayload(jsonBody(request)),
      request,
      response
    );
    if (result.rejected && !result.accepted && !result.duplicates) {
      throw new BadRequestException(resultMessage(result));
    }
    const partialSuccess = result.rejected
      ? { rejectedLogRecords: String(result.rejected), errorMessage: resultMessage(result) }
      : undefined;
    if (!protobuf) return partialSuccess ? { partialSuccess } : {};
    return new StreamableFile(otlpProtobufResponse(partialSuccess), {
      type: "application/x-protobuf",
    });
  }

  private async pushNative(token: string | undefined, request: Request, response: Response) {
    const result = await this.ingest(token, () => nativePayload(request), request, response);
    if (result.rejected && !result.accepted && !result.duplicates) {
      throw new BadRequestException({ message: resultMessage(result), ...result });
    }
    return result;
  }

  private async ingest(
    token: string | undefined,
    readPayload: () => ParsedLogPayload,
    request: Request,
    response: Response
  ): Promise<LogIngestionResult> {
    try {
      return await this.ingestion.ingest(
        token,
        readPayload,
        Number(request.headers["content-length"]) || 0
      );
    } catch (error) {
      if (!(error instanceof LogIngestionRateLimitError)) throw error;
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
      throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

function sourceToken(request: Request): string | undefined {
  const bearer = readBearerToken(request);
  if (bearer) return bearer;
  const basic = /^Basic[\t ]+([A-Za-z0-9+/=]+)$/i.exec(request.headers.authorization?.trim() ?? "");
  if (!basic?.[1]) return undefined;
  const credentials = Buffer.from(basic[1], "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  return separator < 0 ? undefined : credentials.slice(separator + 1);
}

function nativePayload(request: Request): ParsedLogPayload {
  if (request.is(ndjsonTypes)) return parseNdjsonLogPayload(textBody(request));
  if (request.is("text/plain")) return parseNativeLogPayload(textBody(request));
  if (request.is("application/json")) return parseNativeLogPayload(request.body);
  throw new UnsupportedMediaTypeException("Send JSON, NDJSON, or plain text");
}

function jsonBody(request: Request): unknown {
  if (!request.is("application/json")) {
    throw new UnsupportedMediaTypeException("Send JSON or protobuf");
  }
  return request.body;
}

function textBody(request: Request): string {
  return typeof request.body === "string" ? request.body : "";
}

function bufferBody(request: Request): Uint8Array {
  if (!Buffer.isBuffer(request.body)) throw new BadRequestException("The request body is empty");
  return request.body;
}

function decodeWire<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof WirePayloadError) {
      throw new BadRequestException(`The protobuf payload is invalid: ${error.message}`);
    }
    throw error;
  }
}

function resultMessage(result: LogIngestionResult): string {
  const total = result.accepted + result.duplicates + result.rejected;
  const reason = result.errors[0]?.reason ?? "The entries are invalid";
  return `${result.rejected} of ${total} entries rejected: ${reason}`;
}

function otlpProtobufResponse(
  partialSuccess: { rejectedLogRecords: string; errorMessage: string } | undefined
): Buffer {
  if (!partialSuccess) return Buffer.alloc(0);
  const message = Buffer.from(partialSuccess.errorMessage, "utf8");
  const inner = Buffer.concat([
    Buffer.from([0x08]),
    varint(BigInt(partialSuccess.rejectedLogRecords)),
    Buffer.from([0x12]),
    varint(BigInt(message.length)),
    message,
  ]);
  return Buffer.concat([Buffer.from([0x0a]), varint(BigInt(inner.length)), inner]);
}

function varint(value: bigint): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return Buffer.from(bytes);
}
