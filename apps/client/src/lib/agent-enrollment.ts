export interface AgentEnrollmentDetails {
  serverUrl: string;
  enrollmentKey: string;
}

export function createAgentEnrollmentCode(details: AgentEnrollmentDetails): string {
  validate(details);
  const code = new URL("mimorii-agent://enroll");
  code.searchParams.set("server", details.serverUrl.trim());
  code.searchParams.set("key", details.enrollmentKey.trim());
  return code.toString();
}

export function parseAgentEnrollmentCode(value: string): AgentEnrollmentDetails {
  let code: URL;
  try {
    code = new URL(value.trim());
  } catch {
    throw new Error("Enrollment code is invalid");
  }
  if (
    code.protocol !== "mimorii-agent:" ||
    code.hostname !== "enroll" ||
    code.pathname !== "" ||
    code.hash !== "" ||
    code.searchParams.size !== 2 ||
    code.searchParams.getAll("server").length !== 1 ||
    code.searchParams.getAll("key").length !== 1
  ) {
    throw new Error("Enrollment code is invalid");
  }
  const details = {
    serverUrl: code.searchParams.get("server") ?? "",
    enrollmentKey: code.searchParams.get("key") ?? "",
  };
  validate(details);
  return details;
}

function validate(details: AgentEnrollmentDetails): void {
  let server: URL;
  try {
    server = new URL(details.serverUrl.trim());
  } catch {
    throw new Error("Server URL is invalid");
  }
  if (
    !["https:", "http:"].includes(server.protocol) ||
    !server.hostname ||
    server.username !== "" ||
    server.password !== "" ||
    server.search !== "" ||
    server.hash !== ""
  ) {
    throw new Error("Server URL is invalid");
  }
  if (
    server.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(server.hostname)
  ) {
    throw new Error("Server must use HTTPS");
  }
  const key = details.enrollmentKey.trim();
  if (!key.startsWith("mim_agent_") || key.length < 40) {
    throw new Error("Enrollment key is invalid");
  }
}
