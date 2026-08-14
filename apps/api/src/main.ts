import "reflect-metadata";
import { createApplication } from "./bootstrap.js";

const app = await createApplication();
const port = Number(process.env.MIMORII_API_PORT ?? 4310);
await app.listen(port, "0.0.0.0");
