import type { Response } from "express";

export function responseAbortSignal(response: Response): AbortSignal {
  const controller = new AbortController();
  response.once("close", () => {
    if (!response.writableFinished) controller.abort();
  });
  return controller.signal;
}
