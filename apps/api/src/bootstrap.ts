import "./env.js";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import helmet from "helmet";
import {
  json,
  static as serveStatic,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { AppModule } from "./app.module.js";
import { allowedCorsMethods, configuredCorsOrigins } from "./cors.js";
import { setupSwagger } from "./openapi/swagger.js";

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use("/api/agent/heartbeat", json({ limit: "32mb" }));
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
    allowedHeaders: ["Authorization", "Content-Type", "X-Dashboard-Key"],
    maxAge: 86_400,
  });
  setupSwagger(app);
  configureClientApplication(app);
  return app;
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
  app.use(serveStatic(clientRoot, { index: false }));
  const expressApplication: Express = app.getHttpAdapter().getInstance();
  expressApplication.get("/{*path}", (request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith("/api") || request.path.startsWith("/docs")) {
      next();
      return;
    }
    response.sendFile(indexPath);
  });
}
