import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export const createIntentParameter = "new";

export function createIntentPath(path: string): string {
  return `${path}?${createIntentParameter}=1`;
}

export function useCreateIntent(ready: boolean, openCreation: () => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(createIntentParameter) === "1";

  useEffect(() => {
    if (!requested || !ready) return;
    openCreation();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(createIntentParameter);
        return next;
      },
      { replace: true }
    );
  }, [openCreation, ready, requested, setSearchParams]);
}
