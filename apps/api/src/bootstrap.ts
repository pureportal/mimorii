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
  const configuredOrigins = (process.env.MIMORII_CORS_ORIGINS ?? "http://localhost:5180")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: configuredOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Dashboard-Key"],
    maxAge: 86_400,
  });
  setupSwagger(app);
  configureWebApplication(app);
  return app;
}

function configureWebApplication(app: INestApplication): void {
  const configuredPath = process.env.MIMORII_WEB_DIST;
  if (!configuredPath) return;

  const webRoot = resolve(configuredPath);
  const indexPath = join(webRoot, "index.html");
  if (!existsSync(indexPath)) throw new Error(`Web application not found at ${webRoot}`);

  app.use(serveStatic(webRoot, { index: false }));
  const expressApplication: Express = app.getHttpAdapter().getInstance();
  expressApplication.get("/{*path}", (request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith("/api") || request.path.startsWith("/docs")) {
      next();
      return;
    }
    response.sendFile(indexPath);
  });
}
