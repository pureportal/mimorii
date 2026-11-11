import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { History, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";

export function LogHistoryMenu({
  history,
  onSelect,
  onClear,
}: {
  history: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Query history"
          title="Query history"
          disabled={!history.length}
        >
          <History />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[60] max-h-[60vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {history.map((query) => (
            <DropdownMenu.Item
              key={query}
              onSelect={() => onSelect(query)}
              className="cursor-default truncate rounded-lg px-2.5 py-2 font-mono text-xs outline-none data-[highlighted]:bg-ink/5"
            >
              {query}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={onClear}
            className="cursor-default rounded-lg px-2.5 py-2 text-sm text-muted outline-none data-[highlighted]:bg-ink/5"
          >
            Clear history
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copying is unavailable");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Copy link"
      title="Copy link"
      onClick={() => void copy()}
    >
      <Link2 />
    </Button>
  );
}
