import type { LogEntry } from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Download, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatLogTimestamp,
  logDedupModes,
  type LogDedupMode,
  type LogDisplayOptions,
} from "../../lib/log-display";
import { Button } from "../ui/button";
import { saveBlob } from "../../lib/download";

const dedupLabels: Record<LogDedupMode, string> = {
  none: "None",
  exact: "Exact",
  numbers: "Ignore numbers",
  signature: "Signature",
};

const menuClass =
  "z-[60] w-56 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-xl outline-none";
const itemClass =
  "flex cursor-default items-center gap-2 rounded-lg py-2 pl-8 pr-2.5 outline-none data-[highlighted]:bg-ink/5 relative";

export function LogDisplayMenu({
  options,
  onChange,
}: {
  options: LogDisplayOptions;
  onChange: (change: Partial<LogDisplayOptions>) => void;
}) {
  const toggles: Array<[keyof LogDisplayOptions, string]> = [
    ["showTime", "Time"],
    ["showLabels", "Unique labels"],
    ["wrapLines", "Wrap lines"],
    ["prettifyJson", "Prettify JSON"],
  ];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal /> Display
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuClass}>
          {toggles.map(([key, label]) => (
            <DropdownMenu.CheckboxItem
              key={key}
              checked={Boolean(options[key])}
              onCheckedChange={(checked) => onChange({ [key]: checked })}
              onSelect={(event) => event.preventDefault()}
              className={itemClass}
            >
              <Indicator />
              {label}
            </DropdownMenu.CheckboxItem>
          ))}
          <MenuLabel>Order</MenuLabel>
          <DropdownMenu.RadioGroup
            value={options.order}
            onValueChange={(order) => onChange({ order: order === "oldest" ? "oldest" : "newest" })}
          >
            <RadioItem value="newest">Newest first</RadioItem>
            <RadioItem value="oldest">Oldest first</RadioItem>
          </DropdownMenu.RadioGroup>
          <MenuLabel>Deduplication</MenuLabel>
          <DropdownMenu.RadioGroup
            value={options.dedup}
            onValueChange={(dedup) => onChange({ dedup: dedup as LogDedupMode })}
          >
            {logDedupModes.map((mode) => (
              <RadioItem key={mode} value={mode}>
                {dedupLabels[mode]}
              </RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function LogDownloadMenu({ entries }: { entries: LogEntry[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download"
          title="Download"
          disabled={!entries.length}
        >
          <Download />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={menuClass}>
          <DropdownMenu.Item
            className="flex cursor-default rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-ink/5"
            onSelect={() =>
              download(
                entries
                  .map(
                    (entry) =>
                      `${formatLogTimestamp(entry.timestamp)} ${entry.level.toUpperCase()} ${entry.message}`
                  )
                  .join("\n"),
                "text/plain",
                "txt"
              )
            }
          >
            Text
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-default rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-ink/5"
            onSelect={() => download(JSON.stringify(entries, null, 2), "application/json", "json")}
          >
            JSON
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="mt-1.5 border-t border-line px-2.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
      {children}
    </DropdownMenu.Label>
  );
}

function RadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <DropdownMenu.RadioItem
      value={value}
      onSelect={(event) => event.preventDefault()}
      className={itemClass}
    >
      <Indicator />
      {children}
    </DropdownMenu.RadioItem>
  );
}

function Indicator() {
  return (
    <DropdownMenu.ItemIndicator className="absolute left-2.5">
      <Check className="size-4 text-violet-strong" />
    </DropdownMenu.ItemIndicator>
  );
}

function download(content: string, type: string, extension: string) {
  saveBlob(
    new Blob([content], { type }),
    `mimorii-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`
  );
}
