import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { teamOverviewAppHtml } from "./mcp-app.js";

describe("MCP team health app", () => {
  it("only offers refresh when the host can proxy server tools", async () => {
    const withoutTools = createRuntime(false);
    withoutTools.initialize({});
    await settle();
    withoutTools.receive(toolInput());
    withoutTools.refresh.click();

    expect(withoutTools.refresh.hidden).toBe(true);
    expect(withoutTools.refresh.disabled).toBe(true);
    expect(withoutTools.messages.some((message) => message.method === "tools/call")).toBe(false);
    expect(withoutTools.messages).toContainEqual(
      expect.objectContaining({ method: "ui/notifications/size-changed" })
    );

    const withTools = createRuntime();
    withTools.initialize({ serverTools: {} });
    await settle();
    withTools.receive(toolInput());

    expect(withTools.refresh.hidden).toBe(false);
    expect(withTools.refresh.disabled).toBe(false);

    withTools.refresh.click();
    expect(withTools.messages).toContainEqual(
      expect.objectContaining({
        method: "tools/call",
        params: {
          name: "get_team_overview",
          arguments: { teamId: "11111111-1111-4111-8111-111111111111" },
        },
      })
    );
    withTools.receive({ jsonrpc: "2.0", id: "close", method: "ui/resource-teardown" });
    await settle();
  });

  it("settles pending requests and detaches listeners during teardown", async () => {
    const runtime = createRuntime();
    runtime.initialize({ serverTools: {} });
    await settle();
    runtime.receive(toolInput());
    runtime.refresh.click();

    runtime.receive({ jsonrpc: "2.0", id: "close", method: "ui/resource-teardown" });
    await settle();

    expect(runtime.messages).toContainEqual({ jsonrpc: "2.0", id: "close", result: {} });
    expect(runtime.observer.disconnect).toHaveBeenCalledOnce();
    expect(runtime.window.listenerCount("message")).toBe(0);
    expect(runtime.refresh.listenerCount("click")).toBe(0);

    const messageCount = runtime.messages.length;
    runtime.receive(toolInput());
    runtime.refresh.click();
    expect(runtime.messages).toHaveLength(messageCount);
  });

  it("recovers when the host leaves a refresh request unanswered", async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntime();
      runtime.initialize({ serverTools: {} });
      await settle();
      runtime.receive(toolInput());
      runtime.refresh.click();

      expect(runtime.refresh.disabled).toBe(true);
      expect(runtime.refresh.textContent).toBe("Refreshing…");

      await vi.advanceTimersByTimeAsync(60_000);

      expect(runtime.refresh.disabled).toBe(false);
      expect(runtime.refresh.textContent).toBe("Refresh");
      expect(runtime.error.textContent).toBe("Couldn’t refresh team health. Try again.");
      expect(runtime.error.hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

interface AppMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

class TestElement {
  className = "";
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  scrollHeight = 0;
  scrollWidth = 0;
  textContent = "";
  readonly style = {
    colorScheme: "",
    setProperty: vi.fn(),
  };
  private children: TestElement[] = [];
  private readonly listeners = new Map<string, Set<() => void>>();

  get childElementCount(): number {
    return this.children.length;
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children = children;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
}

class TestWindow {
  readonly messages: AppMessage[] = [];
  readonly parent = {
    postMessage: (message: AppMessage) => this.messages.push(message),
  };
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  receive(message: AppMessage): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: message, source: this.parent });
    }
  }
}

function createRuntime(withResizeObserver = true) {
  const elements = new Map(
    [
      "state",
      "state-label",
      "refresh",
      "metrics",
      "breakdown",
      "incidents",
      "incident-list",
      "error",
    ].map((id) => [id, new TestElement()] as const)
  );
  const refresh = elements.get("refresh")!;
  const error = elements.get("error")!;
  refresh.hidden = true;
  refresh.disabled = true;
  error.hidden = true;
  const documentElement = new TestElement();
  documentElement.scrollHeight = 320;
  documentElement.scrollWidth = 480;
  const body = new TestElement();
  const document = {
    body,
    documentElement,
    createElement: () => new TestElement(),
    querySelector: (selector: string) => elements.get(selector.slice(1)),
  };
  const window = new TestWindow();
  const observer = {
    disconnect: vi.fn(),
    observe: vi.fn(),
  };
  class ResizeObserver {
    disconnect(): void {
      observer.disconnect();
    }

    observe(): void {
      observer.observe();
    }
  }
  const script = new Script(appModuleSource());
  script.runInNewContext({
    clearTimeout,
    document,
    setTimeout,
    window,
    ...(withResizeObserver ? { ResizeObserver } : {}),
  });

  return {
    messages: window.messages,
    observer,
    error,
    refresh,
    window,
    initialize(hostCapabilities: Record<string, unknown>) {
      const request = window.messages.find((message) => message.method === "ui/initialize");
      if (request?.id === undefined) throw new Error("App did not initialize");
      window.receive({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2026-01-26",
          hostInfo: { name: "test-host", version: "1.0.0" },
          hostCapabilities,
          hostContext: {},
        },
      });
    },
    receive: (message: AppMessage) => window.receive(message),
  };
}

function appModuleSource(): string {
  const source = teamOverviewAppHtml.match(/<script type="module">([\s\S]+)<\/script>/)?.[1];
  if (!source) throw new Error("MCP App module script is missing");
  return source;
}

function toolInput(): AppMessage {
  return {
    jsonrpc: "2.0",
    method: "ui/notifications/tool-input",
    params: { arguments: { teamId: "11111111-1111-4111-8111-111111111111" } },
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
