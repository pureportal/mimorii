import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

export type StateIllustration = "analysis" | "empty";

const illustrations: Record<StateIllustration, string> = {
  analysis: "/art/state-analysis.webp",
  empty: "/art/state-empty.webp",
};

export function StateArtwork({
  illustration,
  className = "h-24 w-28",
}: {
  illustration: StateIllustration;
  className?: string;
}) {
  return (
    <img
      src={illustrations[illustration]}
      alt=""
      className={`${className} shrink-0 object-contain`}
    />
  );
}

export function LoadingState() {
  return (
    <div role="status" className="grid min-h-48 place-items-center">
      <div className="size-8 animate-spin rounded-full border-3 border-lavender-soft border-t-lavender" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return (
    <div role="alert" className="grid min-h-48 place-items-center text-center">
      <div>
        <AlertTriangle className="mx-auto mb-3 size-6 text-danger" />
        <p className="font-medium text-ink">Couldn&apos;t load this view</p>
        {retry ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  action,
  illustration,
}: {
  title: string;
  action?: ReactNode;
  illustration?: StateIllustration;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-line bg-surface/65 text-center">
      <div className="flex flex-col items-center px-5 py-4">
        {illustration ? (
          <StateArtwork illustration={illustration} />
        ) : (
          <Inbox className="mb-3 size-6 text-muted" />
        )}
        <p className="font-medium text-ink">{title}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
