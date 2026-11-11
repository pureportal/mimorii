import type { LogIngestionEndpoints } from "@mimorii/contracts";

export interface LogIntegration {
  id: string;
  label: string;
  group: "Send directly" | "Collectors" | "Platforms";
  snippet: (context: SnippetContext) => string;
}

export interface SnippetContext {
  endpoints: LogIngestionEndpoints;
  token: string;
}

export const logIntegrations: LogIntegration[] = [
  {
    id: "http",
    label: "HTTP JSON",
    group: "Send directly",
    snippet: ({ endpoints, token }) => `curl -X POST "${endpoints.native}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"level":"error","message":"Error 404 - Failed to load","attributes":{"status":404}}'`,
  },
  {
    id: "text",
    label: "Plain text file",
    group: "Send directly",
    snippet: ({
      endpoints,
      token,
    }) => `tail -n 1000 /var/log/application.log | curl -X POST "${endpoints.native}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: text/plain" \\
  --data-binary @-`,
  },
  {
    id: "ndjson",
    label: "JSON lines",
    group: "Send directly",
    snippet: ({ endpoints, token }) => `curl -X POST "${endpoints.native}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/x-ndjson" \\
  --data-binary @events.ndjson`,
  },
  {
    id: "webhook",
    label: "Webhook address",
    group: "Send directly",
    snippet: ({ endpoints, token }) => `${endpoints.native}/${token}`,
  },
  {
    id: "node",
    label: "Node.js",
    group: "Send directly",
    snippet: ({ endpoints, token }) => `await fetch("${endpoints.native}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    labels: { service: "checkout" },
    entries: [
      { level: "error", message: "Payment failed", attributes: { orderId: "A-1001" } },
    ],
  }),
});`,
  },
  {
    id: "python",
    label: "Python logging",
    group: "Send directly",
    snippet: ({ endpoints, token }) => `import logging
import requests


class MimoriiHandler(logging.Handler):
    def emit(self, record):
        requests.post(
            "${endpoints.native}",
            headers={"Authorization": "Bearer ${token}"},
            json={"level": record.levelname, "message": self.format(record)},
            timeout=5,
        )


logging.getLogger().addHandler(MimoriiHandler())`,
  },
  {
    id: "alloy",
    label: "Grafana Alloy",
    group: "Collectors",
    snippet: ({ endpoints, token }) => `loki.write "mimorii" {
  endpoint {
    url          = "${endpoints.loki}"
    bearer_token = "${token}"
  }
}

local.file_match "files" {
  path_targets = [{"__path__" = "/var/log/*.log", "job" = "files"}]
}

loki.source.file "files" {
  targets    = local.file_match.files.targets
  forward_to = [loki.write.mimorii.receiver]
}`,
  },
  {
    id: "promtail",
    label: "Promtail",
    group: "Collectors",
    snippet: ({ endpoints, token }) => `clients:
  - url: ${endpoints.loki}
    bearer_token: ${token}

scrape_configs:
  - job_name: files
    static_configs:
      - targets: [localhost]
        labels:
          job: files
          __path__: /var/log/*.log`,
  },
  {
    id: "fluentBit",
    label: "Fluent Bit",
    group: "Collectors",
    snippet: ({ endpoints, token }) => {
      const url = new URL(endpoints.loki);
      const tls = url.protocol === "https:";
      return `[OUTPUT]
    Name        loki
    Match       *
    Host        ${url.hostname}
    Port        ${url.port || (tls ? "443" : "80")}
    Uri         ${url.pathname}
    tls         ${tls ? "On" : "Off"}
    http_user   mimorii
    http_passwd ${token}
    labels      job=fluent-bit`;
    },
  },
  {
    id: "vector",
    label: "Vector",
    group: "Collectors",
    snippet: ({ endpoints, token }) => `sources:
  files:
    type: file
    include: ["/var/log/*.log"]

sinks:
  mimorii:
    type: loki
    inputs: ["files"]
    endpoint: "${lokiBase(endpoints)}"
    encoding:
      codec: text
    labels:
      job: vector
    auth:
      strategy: bearer
      token: "${token}"`,
  },
  {
    id: "otel",
    label: "OpenTelemetry Collector",
    group: "Collectors",
    snippet: ({ endpoints, token }) => `exporters:
  otlphttp/mimorii:
    logs_endpoint: ${endpoints.otlp}
    headers:
      Authorization: Bearer ${token}

service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [otlphttp/mimorii]`,
  },
  {
    id: "docker",
    label: "Docker",
    group: "Platforms",
    snippet: ({
      endpoints,
      token,
    }) => `docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions

docker run --log-driver=loki \\
  --log-opt loki-url="${withCredentials(endpoints.loki, token)}" \\
  --log-opt loki-external-labels="job=docker,container_name={{.Name}}" \\
  your-image`,
  },
  {
    id: "journal",
    label: "systemd journal",
    group: "Platforms",
    snippet: ({ endpoints, token }) => `loki.write "mimorii" {
  endpoint {
    url          = "${endpoints.loki}"
    bearer_token = "${token}"
  }
}

loki.source.journal "journal" {
  forward_to = [loki.write.mimorii.receiver]
  labels     = {job = "systemd-journal"}
}`,
  },
  {
    id: "windows",
    label: "Windows events",
    group: "Platforms",
    snippet: ({ endpoints, token }) => `loki.write "mimorii" {
  endpoint {
    url          = "${endpoints.loki}"
    bearer_token = "${token}"
  }
}

loki.source.windowsevent "application" {
  eventlog_name = "Application"
  forward_to    = [loki.write.mimorii.receiver]
}

loki.source.windowsevent "system" {
  eventlog_name = "System"
  forward_to    = [loki.write.mimorii.receiver]
}`,
  },
];

function lokiBase(endpoints: LogIngestionEndpoints): string {
  return endpoints.loki.replace(/\/loki\/api\/v1\/push$/, "");
}

function withCredentials(address: string, token: string): string {
  const url = new URL(address);
  url.username = "mimorii";
  url.password = token;
  return url.toString();
}
