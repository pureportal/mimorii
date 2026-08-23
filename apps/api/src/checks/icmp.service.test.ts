import { describe, expect, it } from "vitest";
import { parsePingOutput } from "./icmp.service.js";

describe("ICMP output parsing", () => {
  it("parses Unix packet and latency output", () => {
    expect(
      parsePingOutput(
        "64 bytes from 1.1.1.1: time=12.4 ms\n64 bytes from 1.1.1.1: time=15.6 ms\n2 packets transmitted, 2 received, 0% packet loss",
        2
      )
    ).toEqual({
      sent: 2,
      received: 2,
      lossPercent: 0,
      minimumLatencyMs: 12.4,
      averageLatencyMs: 14,
      maximumLatencyMs: 15.6,
    });
  });

  it("parses localized Windows summaries and time below one millisecond", () => {
    expect(
      parsePingOutput(
        "Antwort von 1.1.1.1: Zeit<1ms\nPakete: Gesendet = 2, Empfangen = 1, Verloren = 1",
        2
      )
    ).toMatchObject({ received: 1, lossPercent: 50, averageLatencyMs: 1 });
  });

  it("reports total loss without inventing latency", () => {
    expect(parsePingOutput("3 packets transmitted, 0 received, 100% packet loss", 3)).toEqual({
      sent: 3,
      received: 0,
      lossPercent: 100,
      minimumLatencyMs: null,
      averageLatencyMs: null,
      maximumLatencyMs: null,
    });
  });
});
