import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Brand } from "./brand";
import { LoadingState } from "./page-state";

export function AndroidClientLayout() {
  return (
    <div className="safe-page-footer flex min-h-dvh flex-col bg-canvas text-ink" data-theme="light">
      <header className="flex h-[calc(4rem+var(--safe-area-top))] items-center border-b border-line bg-surface px-5 pt-[var(--safe-area-top)]">
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
