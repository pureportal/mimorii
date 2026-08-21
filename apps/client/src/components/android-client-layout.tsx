import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Brand } from "./brand";
import { LoadingState } from "./page-state";

export function AndroidClientLayout() {
  return (
    <div
      className="safe-page safe-page-footer flex min-h-dvh flex-col bg-canvas text-ink"
      data-theme="light"
    >
      <header className="border-b border-line bg-surface/94 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <Brand />
        </div>
      </header>
      <div className="flex flex-1 flex-col [&>*]:flex-1">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
