import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
const scripts = ["dev:api", "dev:web", "dev:agent"];
const children = scripts.map((script) =>
  spawn(command, isWindows ? ["/d", "/s", "/c", "pnpm.cmd", "run", script] : ["run", script], {
    stdio: "inherit",
  })
);

let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
  child.on("error", () => stop(1));
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
