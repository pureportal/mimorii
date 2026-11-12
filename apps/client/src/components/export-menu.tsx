import type { ExportFormatId } from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiBlob } from "../lib/api";
import { useAuth } from "../lib/auth";
import { saveBlob } from "../lib/download";
import { Button } from "./ui/button";

const formats: Array<{ id: ExportFormatId; label: string }> = [
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
  { id: "ndjson", label: "NDJSON" },
];

export interface ExportChoice {
  dataset: string;
  label: string;
}

export function ExportMenu({
  choices,
  parameters = {},
}: {
  choices: ExportChoice[];
  parameters?: Record<string, string | null | undefined>;
}) {
  const { activeTeam } = useAuth();
  const [busy, setBusy] = useState(false);

  async function download(dataset: string, format: ExportFormatId) {
    if (!activeTeam) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({ format });
      for (const [key, value] of Object.entries(parameters)) if (value) query.set(key, value);
      const blob = await apiBlob(`/teams/${activeTeam.id}/exports/${dataset}?${query}`);
      saveBlob(blob, `mimorii-${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
          Export
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[60] min-w-36 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {choices.map((choice, index) => (
            <DropdownMenu.Group key={choice.dataset}>
              {index ? <DropdownMenu.Separator className="my-1 h-px bg-line" /> : null}
              {choices.length > 1 ? (
                <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-muted">
                  {choice.label}
                </DropdownMenu.Label>
              ) : null}
              {formats.map((format) => (
                <DropdownMenu.Item
                  key={format.id}
                  aria-label={`${choice.label} as ${format.label}`}
                  onSelect={() => void download(choice.dataset, format.id)}
                  className="cursor-default rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-ink/5"
                >
                  {format.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
