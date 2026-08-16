import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAndroidBackHandler } from "./android-back";

const nativeBack = vi.hoisted(() => ({
  handler: null as null | ((payload: { canGoBack: boolean }) => void),
  register: vi.fn(),
  unregister: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  onBackButtonPress: vi.fn(async (handler: typeof nativeBack.handler) => {
    nativeBack.register();
    nativeBack.handler = handler;
    return {
      unregister: async () => {
        nativeBack.handler = null;
        await nativeBack.unregister();
      },
    };
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

describe("useAndroidBackHandler", () => {
  beforeEach(() => setUserAgent("Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36"));

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("routes Back to the top overlay and restores native navigation after cleanup", async () => {
    const calls: string[] = [];
    const view = render(
      <>
        <Harness key="first" name="first" onRun={(name) => calls.push(name)} />
        <Harness key="second" name="second" onRun={(name) => calls.push(name)} />
      </>
    );
    await waitFor(() => expect(nativeBack.handler).not.toBeNull());

    act(() => nativeBack.handler?.({ canGoBack: false }));
    expect(calls).toEqual(["second"]);

    view.rerender(<Harness key="first" name="first" onRun={(name) => calls.push(name)} />);
    act(() => nativeBack.handler?.({ canGoBack: false }));
    expect(calls).toEqual(["second", "first"]);

    view.unmount();
    await waitFor(() => expect(nativeBack.unregister).toHaveBeenCalledOnce());
    expect(nativeBack.handler).toBeNull();
  });

  it("leaves Back handling untouched in desktop Tauri clients", async () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    render(<Harness name="desktop" onRun={vi.fn()} />);
    await act(async () => undefined);

    expect(nativeBack.register).not.toHaveBeenCalled();
  });
});

function Harness({ name, onRun }: { name: string; onRun: (name: string) => void }) {
  useAndroidBackHandler(() => onRun(name));
  return null;
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value });
}
