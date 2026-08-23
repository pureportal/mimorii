import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";

export interface IcmpProbeResult {
  sent: number;
  received: number;
  lossPercent: number;
  minimumLatencyMs: number | null;
  averageLatencyMs: number | null;
  maximumLatencyMs: number | null;
}

@Injectable()
export class IcmpService {
  probe(address: string, packetCount: number, timeoutMs: number): Promise<IcmpProbeResult> {
    const args = pingArguments(address, packetCount, timeoutMs);
    return new Promise((resolve, reject) => {
      const child = spawn("ping", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      const timer = setTimeout(
        () => child.kill(),
        Math.max(timeoutMs * packetCount + 2_000, 5_000)
      );
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(
          Object.assign(new Error("ICMP executor is unavailable"), {
            code: (error as NodeJS.ErrnoException).code,
          })
        );
      });
      child.once("close", () => {
        clearTimeout(timer);
        resolve(parsePingOutput(Buffer.concat(chunks).toString("utf8"), packetCount));
      });
    });
  }
}

export function parsePingOutput(output: string, sent: number): IcmpProbeResult {
  const latencies = [...output.matchAll(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/gi)].map((match) =>
    Number(match[1]!.replace(",", "."))
  );
  const unixSummary = /(\d+)\s+packets transmitted,\s*(\d+)\s+(?:packets\s+)?received/i.exec(
    output
  );
  const windowsSummary =
    /(?:Sent|Gesendet)\s*=\s*(\d+).*?(?:Received|Empfangen)\s*=\s*(\d+)/is.exec(output);
  const received = Math.min(
    sent,
    unixSummary
      ? Number(unixSummary[2])
      : windowsSummary
        ? Number(windowsSummary[2])
        : latencies.length
  );
  return {
    sent,
    received,
    lossPercent: Math.round((1 - received / sent) * 1_000) / 10,
    minimumLatencyMs: latencies.length ? Math.min(...latencies) : null,
    averageLatencyMs: latencies.length
      ? Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 10) / 10
      : null,
    maximumLatencyMs: latencies.length ? Math.max(...latencies) : null,
  };
}

function pingArguments(address: string, packetCount: number, timeoutMs: number): string[] {
  if (process.platform === "win32") {
    return ["-n", String(packetCount), "-w", String(timeoutMs), address];
  }
  if (process.platform === "darwin") {
    return ["-n", "-c", String(packetCount), "-W", String(timeoutMs), address];
  }
  return [
    "-n",
    "-c",
    String(packetCount),
    "-W",
    String(Math.max(1, Math.ceil(timeoutMs / 1_000))),
    address,
  ];
}
