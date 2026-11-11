import { useCallback, useState } from "react";

const historyLimit = 15;

export function useLogQueryHistory(teamId: string): {
  history: string[];
  remember: (query: string) => void;
  clear: () => void;
} {
  const key = `mimorii.logs.history.${teamId}`;
  const [history, setHistory] = useState<string[]>(() => readHistory(key));

  const remember = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setHistory((current) => {
        const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(
          0,
          historyLimit
        );
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setHistory([]);
  }, [key]);

  return { history, remember, clear };
}

function readHistory(key: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === "string").slice(0, historyLimit)
      : [];
  } catch {
    return [];
  }
}
