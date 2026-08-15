import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication) {
  const configuration = new DocumentBuilder()
    .setTitle("Mimorii API")
    .setDescription("Self-hosted uptime, server analytics, and relay-agent API.")
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "User access token" },
      "bearer"
    )
    .addBearerAuth(
      { type: "http", scheme: "bearer", description: "Unique agent enrollment key" },
      "agent-key"
    )
    .addTag("Authentication")
    .addTag("Teams")
    .addTag("Resources")
    .addTag("Checks")
    .addTag("Agents")
    .addTag("Analytics")
    .addTag("Sponsors")
    .addTag("Global administration")
    .build();
  return SwaggerModule.createDocument(app, configuration, {
    operationIdFactory: (_controller, method) => method,
  });
}

export function setupSwagger(app: INestApplication): void {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "docs-json",
    customSiteTitle: "Mimorii API",
  });
}
