import type { StatusPageSummary } from "@mimorii/contracts";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getServerUrl } from "../lib/api";
import { statusPagePath } from "../lib/status-page-links";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function StatusBadgeDialog({
  page,
  onOpenChange,
}: {
  page: StatusPageSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(page)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Embed badge" />
        {page ? <BadgeSnippets page={page} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BadgeSnippets({ page }: { page: StatusPageSummary }) {
  const badgeUrl = `${getServerUrl()}/public/status-pages/${encodeURIComponent(page.id)}/${encodeURIComponent(page.slug)}/badge.svg`;
  const pageUrl = new URL(statusPagePath(page.id, page.slug), window.location.origin).href;
  const snippets = [
    { id: "markdown", label: "Markdown", value: `[![${page.name}](${badgeUrl})](${pageUrl})` },
    {
      id: "html",
      label: "HTML",
      value: `<a href="${pageUrl}"><img src="${badgeUrl}" alt="${page.name.replaceAll('"', "&quot;")}"></a>`,
    },
    { id: "image", label: "Image URL", value: badgeUrl },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid place-items-center rounded-2xl border border-line bg-canvas p-6">
        <img src={badgeUrl} alt={`${page.name} status`} height={20} />
      </div>
      {snippets.map((snippet) => (
        <CopyField
          key={snippet.id}
          id={`badge-${snippet.id}`}
          label={snippet.label}
          value={snippet.value}
        />
      ))}
    </div>
  );
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} value={value} readOnly className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              toast.error(`${label} could not be copied`);
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </Field>
  );
}
