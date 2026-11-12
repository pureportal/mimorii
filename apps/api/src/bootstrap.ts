import "./env.js";
import { RequestMethod, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import compression from "compression";
import helmet from "helmet";
import {
  json,
  raw,
  static as serveStatic,
  text,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { AppModule } from "./app.module.js";
import { publicOrigin } from "./auth/oauth-config.js";
import { allowedCorsMethods, configuredCorsOrigins } from "./cors.js";
import { setupSwagger } from "./openapi/swagger.js";

const clientContentSecurityPolicy = [
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export async function createApplication(): Promise<INestApplication> {
  publicOrigin();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureTrustedProxies(app);
  app.setGlobalPrefix("api", {
    exclude: [
      { path: ".well-known/oauth-protected-resource/api/mcp", method: RequestMethod.GET },
      { path: ".well-known/oauth-authorization-server", method: RequestMethod.GET },
    ],
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use("/api/teams/:teamId/logs", compression({ threshold: 2_048 }));
  app.use("/api/agent/heartbeat", json({ limit: "32mb" }));
  configureLogIngestionParsers(app);
  app.use(json({ limit: "256kb" }));
  app.use(urlencoded({ extended: false, limit: "32kb" }));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      validationError: { target: false, value: false },
    })
  );
  configureSponsorshipCors(app);
  app.enableCors({
    origin: configuredCorsOrigins(),
    methods: allowedCorsMethods,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "MCP-Protocol-Version",
      "Mcp-Method",
      "Mcp-Name",
      "X-Dashboard-Key",
    ],
    exposedHeaders: ["WWW-Authenticate"],
    maxAge: 86_400,
  });
  setupSwagger(app);
  configureClientApplication(app);
  return app;
}

function configureTrustedProxies(app: INestApplication): void {
  const configured = process.env.MIMORII_TRUST_PROXY?.trim();
  if (!configured) return;
  const expressApplication: Express = app.getHttpAdapter().getInstance();
  expressApplication.set("trust proxy", /^\d+$/.test(configured) ? Number(configured) : configured);
}

function configureLogIngestionParsers(app: INestApplication): void {
  const limit = "8mb";
  app.use(["/api/logs/push", "/api/loki/api/v1/push", "/api/otlp/v1/logs"], json({ limit }));
  app.use(
    "/api/logs/push",
    text({
      type: ["text/plain", "application/x-ndjson", "application/jsonl", "application/x-jsonlines"],
      limit,
    })
  );
  app.use(
    ["/api/loki/api/v1/push", "/api/otlp/v1/logs"],
    raw({ type: ["application/x-protobuf", "application/protobuf"], limit })
  );
}

function configureSponsorshipCors(app: INestApplication): void {
  app.use("/api/sponsors", (request: Request, response: Response, next: NextFunction) => {
    response.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  });
}

function configureClientApplication(app: INestApplication): void {
  const configuredPath = process.env.MIMORII_CLIENT_DIST;
  if (!configuredPath) return;

  const clientRoot = resolve(configuredPath);
  const indexPath = join(clientRoot, "index.html");
  if (!existsSync(indexPath)) throw new Error(`Client application not found at ${clientRoot}`);

  app.use(
    "/.well-known",
    serveStatic(join(clientRoot, ".well-known"), { dotfiles: "allow", index: false })
  );
  app.use(
    serveStatic(clientRoot, {
      index: false,
      setHeaders: (response, filePath) => {
        if (filePath.endsWith(".html")) {
          response.setHeader("Content-Security-Policy", clientContentSecurityPolicy);
        }
      },
    })
  );
  const expressApplication: Express = app.getHttpAdapter().getInstance();
  expressApplication.get("/{*path}", (request: Request, response: Response, next: NextFunction) => {
    if (
      request.path.startsWith("/api") ||
      request.path.startsWith("/docs") ||
      request.path.startsWith("/.well-known/oauth-")
    ) {
      next();
      return;
    }
    response.set("Content-Security-Policy", clientContentSecurityPolicy);
    response.sendFile(indexPath);
  });
}
