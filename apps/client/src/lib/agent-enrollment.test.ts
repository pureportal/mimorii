import { describe, expect, it } from "vitest";
import { createAgentEnrollmentCode, parseAgentEnrollmentCode } from "./agent-enrollment";

const details = {
  serverUrl: "https://monitor.example.com/api",
  enrollmentKey: `mim_agent_${"a".repeat(32)}`,
};

describe("Agent enrollment codes", () => {
  it("round-trips server and enrollment key without ambiguity", () => {
    expect(parseAgentEnrollmentCode(createAgentEnrollmentCode(details))).toEqual(details);
  });

  it.each([
    "",
    "https://monitor.example.com",
    "mimorii-agent://other?server=https%3A%2F%2Fmonitor.example.com&key=mim_agent_bad",
    `mimorii-agent://enroll?server=javascript%3Aalert(1)&key=${details.enrollmentKey}`,
    `mimorii-agent://enroll?server=http%3A%2F%2Fmonitor.example.com&key=${details.enrollmentKey}`,
    `${createAgentEnrollmentCode(details)}&unexpected=true`,
  ])("rejects invalid code %s", (code) => {
    expect(() => parseAgentEnrollmentCode(code)).toThrow();
  });
});
