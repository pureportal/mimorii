import { onBackButtonPress } from "@tauri-apps/api/app";
import { isTauri, type PluginListener } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

interface BackHandler {
  token: symbol;
  run: () => void;
}

const handlers: BackHandler[] = [];
let listener: PluginListener | null = null;
let synchronization = Promise.resolve();

export function useAndroidBackHandler(run: () => void, enabled = true) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled || !isAndroidTauri()) return undefined;
    const entry = { token: Symbol(), run: () => runRef.current() };
    handlers.push(entry);
    synchronizeListener();

    return () => {
      const index = handlers.findIndex(({ token }) => token === entry.token);
      if (index >= 0) handlers.splice(index, 1);
      synchronizeListener();
    };
  }, [enabled]);
}

function isAndroidTauri() {
  return isTauri() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function synchronizeListener() {
  synchronization = synchronization
    .then(async () => {
      if (handlers.length > 0 && listener === null) {
        listener = await onBackButtonPress(() => handlers[handlers.length - 1]?.run());
      } else if (handlers.length === 0 && listener !== null) {
        const registeredListener = listener;
        listener = null;
        await registeredListener.unregister();
      }
    })
    .catch((error: unknown) => {
      listener = null;
      console.error("Android Back handling could not be synchronized", error);
    });
}
