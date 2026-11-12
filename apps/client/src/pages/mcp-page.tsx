import { Activity, BarChart3, Check, Copy, PencilLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { getServerUrl } from "../lib/api";

const machdochPresetUrl = "https://mimorii.app/api/mcp";

const readCapabilities = [
  "Team health and resources",
  "Team health dashboard in supported clients",
  "Checks and heartbeat history",
  "Incidents and maintenance",
  "Availability and service objectives",
  "Log search, volume, patterns, and fields for teams with logs",
  "Log alert rules and rule tests",
];

const writeCapabilities = [
  "Update resource details",
  "Create incidents",
  "Publish incident updates",
  "Create log alert rules",
];

const promptExamples = [
  "Summarize the current health of my team.",
  "Show availability for the last 30 days.",
  "Which service objectives are at risk?",
  "What errors did the checkout service log in the last hour?",
  "Alert me when the web logs contain Error 404 - Failed to load.",
];

export function McpPage() {
  const mcpServerUrl = `${getServerUrl()}/mcp`;
  const [copied, setCopied] = useState(false);

  async function copyServerUrl() {
    try {
      await navigator.clipboard.writeText(mcpServerUrl);
      setCopied(true);
    } catch {
      toast.error("The server URL could not be copied");
    }
  }

  return (
    <main className="overflow-hidden">
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-12 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl font-black tracking-[-0.04em] sm:text-6xl">
            MCP integration
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            Model Context Protocol gives compatible AI clients a standard way to request Mimorii
            monitoring data and use approved actions.
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-surface/72">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[.72fr_1.28fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">Connect</h2>
            <p className="mt-4 leading-7 text-muted">
              You need a Mimorii account and an MCP-compatible client.
            </p>
          </div>
          <div>
            <div className="rounded-2xl border border-line bg-canvas/72 p-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-coral-strong">
                Server URL
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="block min-w-0 flex-1 overflow-x-auto rounded-xl bg-night px-4 py-3 text-sm text-white">
                  {mcpServerUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy server URL"
                  onClick={() => void copyServerUrl()}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
            <ol className="mt-8 grid gap-6">
              <li className="grid grid-cols-[2.5rem_1fr] gap-4">
                <span className="grid size-10 place-items-center rounded-xl bg-coral text-sm font-black text-night">
                  1
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">Add the server</h3>
                  <p className="mt-1 leading-7 text-muted">
                    In Machdoch, open Settings, then MCP servers, choose Add preset, and select
                    Mimorii.{" "}
                    {mcpServerUrl === machdochPresetUrl
                      ? ""
                      : "Replace its URL with the server URL. "}
                    Then select Start OAuth on its Auth tab. In other clients, enter the server URL
                    in the remote MCP connection settings.
                  </p>
                </div>
              </li>
              <li className="grid grid-cols-[2.5rem_1fr] gap-4">
                <span className="grid size-10 place-items-center rounded-xl bg-lavender-soft text-sm font-black text-violet-strong">
                  2
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">Approve access</h3>
                  <p className="mt-1 leading-7 text-muted">
                    Sign in to Mimorii, review the permissions requested by the client, and allow
                    the connection.
                  </p>
                </div>
              </li>
              <li className="grid grid-cols-[2.5rem_1fr] gap-4">
                <span className="grid size-10 place-items-center rounded-xl bg-mint/18 text-sm font-black text-success-strong">
                  3
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">Start a conversation</h3>
                  <p className="mt-1 leading-7 text-muted">
                    Ask about your monitoring data. The client calls the available Mimorii tools
                    when needed.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">Access</h2>
          <p className="mt-4 leading-7 text-muted">
            Every request uses your current Mimorii team permissions.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Card className="p-6 sm:p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-mint/18 text-success-strong">
              <Activity aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-display text-2xl font-bold">View monitoring</h3>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-muted">
              {readCapabilities.map((capability) => (
                <li key={capability} className="flex gap-3">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-success-strong"
                    aria-hidden="true"
                  />
                  {capability}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6 sm:p-7">
            <span className="grid size-11 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
              <PencilLine aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-display text-2xl font-bold">Make changes</h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              Write access is optional and your Mimorii role must allow the action.
            </p>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-muted">
              {writeCapabilities.map((capability) => (
                <li key={capability} className="flex gap-3">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-violet-strong"
                    aria-hidden="true"
                  />
                  {capability}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="border-y border-line bg-surface/72">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[.72fr_1.28fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <BarChart3 className="size-8 text-coral-strong" aria-hidden="true" />
            <h2 className="mt-5 font-display text-3xl font-black tracking-tight sm:text-4xl">
              Try asking
            </h2>
          </div>
          <ul className="grid gap-3">
            {promptExamples.map((example) => (
              <li
                key={example}
                className="rounded-2xl border border-line bg-canvas/72 px-5 py-4 font-medium"
              >
                &ldquo;{example}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
