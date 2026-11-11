import { logSavedSearchLimits, type LogSavedSearch } from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, BookmarkPlus, LoaderCircle, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, jsonBody } from "../../lib/api";
import { Button } from "../ui/button";
import { ConfirmationDialog } from "../ui/confirmation-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/dialog";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

const itemClass =
  "cursor-default rounded-lg outline-none data-[highlighted]:bg-ink/5 data-[disabled]:opacity-45";

export function LogSavedSearchesMenu({
  teamId,
  query,
  canManage,
  onSelect,
}: {
  teamId: string;
  query: string;
  canManage: boolean;
  onSelect: (query: string) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["logs", teamId, "saved-searches"];
  const searches = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<LogSavedSearch[]>(`/teams/${teamId}/logs/searches`, { signal }),
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<LogSavedSearch | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const saved = searches.data ?? [];
  const current = saved.find((search) => search.query === query.trim());
  const full = saved.length >= logSavedSearchLimits.perTeam;

  async function remove(search: LogSavedSearch) {
    setPendingRemoval(true);
    try {
      await api<void>(`/teams/${teamId}/logs/searches/${search.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Saved search deleted");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The search could not be deleted");
    } finally {
      setPendingRemoval(false);
      setRemoving(null);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Saved searches"
            title="Saved searches"
            className={current ? "text-violet-strong" : undefined}
          >
            {current ? <BookmarkCheck /> : <Bookmark />}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-[60] max-h-[60vh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl"
          >
            {saved.map((search) => (
              <div key={search.id} className="flex items-stretch gap-1">
                <DropdownMenu.Item
                  onSelect={() => onSelect(search.query)}
                  className={`${itemClass} min-w-0 flex-1 px-2.5 py-2`}
                >
                  <span className="block truncate text-sm font-semibold text-ink">
                    {search.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted">
                    {search.query || "{}"}
                  </span>
                </DropdownMenu.Item>
                {canManage ? (
                  <DropdownMenu.Item
                    aria-label={`Delete ${search.name}`}
                    onSelect={() => setRemoving(search)}
                    className={`${itemClass} grid w-9 shrink-0 place-items-center text-muted data-[highlighted]:text-danger`}
                  >
                    <Trash2 className="size-4" />
                  </DropdownMenu.Item>
                ) : null}
              </div>
            ))}
            {canManage ? (
              <>
                {saved.length ? <DropdownMenu.Separator className="my-1 h-px bg-line" /> : null}
                <DropdownMenu.Item
                  disabled={Boolean(current) || full}
                  onSelect={() => setSaving(true)}
                  className={`${itemClass} flex items-center gap-2 px-2.5 py-2 text-sm`}
                >
                  <BookmarkPlus className="size-4 text-muted" />
                  Save current search
                </DropdownMenu.Item>
              </>
            ) : saved.length ? null : (
              <p className="px-2.5 py-2 text-sm text-muted">No saved searches</p>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {saving ? (
        <SaveSearchDialog
          teamId={teamId}
          query={query}
          onSaved={() => void queryClient.invalidateQueries({ queryKey })}
          onClose={() => setSaving(false)}
        />
      ) : null}
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Delete ${removing?.name ?? "saved search"}?`}
        description="It is removed for everyone in the team."
        confirmLabel="Delete"
        pending={pendingRemoval}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
      />
    </>
  );
}

function SaveSearchDialog({
  teamId,
  query,
  onSaved,
  onClose,
}: {
  teamId: string;
  query: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api<LogSavedSearch>(`/teams/${teamId}/logs/searches`, {
        method: "POST",
        ...jsonBody({ name: name.trim(), query }),
      });
      onSaved();
      toast.success("Search saved");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The search could not be saved");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader title="Save search" />
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="saved-search-name">Name</FieldLabel>
            <Input
              id="saved-search-name"
              value={name}
              autoFocus
              maxLength={logSavedSearchLimits.name}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <pre className="overflow-x-auto rounded-xl border border-line bg-canvas/70 p-3 font-mono text-xs text-muted [scrollbar-width:thin]">
            {query || "{}"}
          </pre>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="coral" disabled={pending || !name.trim()}>
              {pending ? <LoaderCircle className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
