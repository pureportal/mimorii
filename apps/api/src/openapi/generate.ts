import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createApplication } from "../bootstrap.js";
import { createOpenApiDocument } from "./swagger.js";

process.env.MIMORII_SCHEDULER_ENABLED = "false";

const outputArgument = process.argv.indexOf("--output");
const outputPath = resolve(
  outputArgument >= 0 && process.argv[outputArgument + 1]
    ? process.argv[outputArgument + 1]!
    : "openapi/mimorii.openapi.json"
);
const app = await createApplication();
const document = createOpenApiDocument(app);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
await app.close();
console.log(outputPath);
