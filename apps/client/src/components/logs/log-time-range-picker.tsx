import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, ZoomOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  absoluteLogTimeRange,
  describeLogTimeRange,
  isRelativeLogTimeRange,
  quickLogTimeRanges,
  resolveLogTimeRange,
  shiftLogTimeRange,
  toDateTimeLocal,
  zoomOutLogTimeRange,
  type LogTimeRange,
} from "../../lib/log-time-range";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

export function LogTimeRangePicker({
  range,
  onChange,
}: {
  range: LogTimeRange;
  onChange: (range: LogTimeRange) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const relative = isRelativeLogTimeRange(range);

  return (
    <div className="flex h-10 min-w-0 items-center rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-label="Earlier"
        title="Earlier"
        onClick={() => onChange(shiftLogTimeRange(range, -1))}
        className="grid h-full w-9 shrink-0 place-items-center rounded-l-xl text-muted transition hover:bg-ink/5 hover:text-ink"
      >
        <ChevronLeft className="size-4" />
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-full min-w-0 items-center gap-2 border-x border-line px-3 text-sm font-semibold outline-none transition hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-coral-strong"
          >
            <Clock3 className="size-4 shrink-0 text-muted" />
            <span className="truncate">{describeLogTimeRange(range)}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[60] max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl"
          >
            {quickLogTimeRanges.map((quick) => {
              const selected = relative && range.from === quick.from;
              return (
                <DropdownMenu.Item
                  key={quick.from}
                  onSelect={() => onChange({ from: quick.from, to: "now" })}
                  className="flex cursor-default items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-ink/5"
                >
                  {quick.label}
                  {selected ? <Check className="size-4 text-violet-strong" /> : null}
                </DropdownMenu.Item>
              );
            })}
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item
              onSelect={() => setCustomOpen(true)}
              className="flex cursor-default items-center rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-ink/5"
            >
              Custom range
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button
        type="button"
        aria-label="Later"
        title="Later"
        disabled={relative}
        onClick={() => onChange(shiftLogTimeRange(range, 1))}
        className="grid h-full w-9 shrink-0 place-items-center text-muted transition hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-35"
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => onChange(zoomOutLogTimeRange(range))}
        className="grid h-full w-9 shrink-0 place-items-center rounded-r-xl border-l border-line text-muted transition hover:bg-ink/5 hover:text-ink"
      >
        <ZoomOut className="size-4" />
      </button>
      {customOpen ? (
        <CustomRangeDialog
          range={range}
          onOpenChange={setCustomOpen}
          onApply={(next) => {
            onChange(next);
            setCustomOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomRangeDialog({
  range,
  onOpenChange,
  onApply,
}: {
  range: LogTimeRange;
  onOpenChange: (open: boolean) => void;
  onApply: (range: LogTimeRange) => void;
}) {
  const resolved = resolveLogTimeRange(range);
  const [from, setFrom] = useState(toDateTimeLocal(resolved.from));
  const [to, setTo] = useState(toDateTimeLocal(resolved.to));
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const start = new Date(from);
    const end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setError("Enter a start and an end");
      return;
    }
    if (start >= end) {
      setError("The start must be before the end");
      return;
    }
    if (end.getTime() - start.getTime() > 90 * 86_400_000) {
      setError("Choose up to 90 days");
      return;
    }
    onApply(absoluteLogTimeRange(start, end));
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader title="Custom range" />
        <form className="grid gap-4" onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="log-range-from">From</FieldLabel>
            <Input
              id="log-range-from"
              type="datetime-local"
              step={1}
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-range-to">To</FieldLabel>
            <Input
              id="log-range-to"
              type="datetime-local"
              step={1}
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="coral">
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
