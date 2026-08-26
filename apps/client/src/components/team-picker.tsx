import type { TeamSummary } from "@mimorii/contracts";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";
import { TeamLogo } from "./team-logo";

export function TeamPicker({
  activeTeamId,
  teams,
  onTeamChange,
  className,
}: {
  activeTeamId: string;
  teams: TeamSummary[];
  onTeamChange: (id: string) => void;
  className?: string;
}) {
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  if (!activeTeam) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Workspace"
          value={activeTeam.id}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-left text-sm font-semibold text-ink outline-none transition focus:border-lavender focus:ring-3 focus:ring-lavender/15",
            className
          )}
        >
          <TeamLogo team={activeTeam} className="size-6" />
          <span className="min-w-0 flex-1 truncate">{activeTeam.name}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-[60] max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          <DropdownMenu.RadioGroup value={activeTeam.id} onValueChange={onTeamChange}>
            {teams.map((team) => (
              <DropdownMenu.RadioItem
                key={team.id}
                value={team.id}
                className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-ink/5"
              >
                <TeamLogo team={team} className="size-7" />
                <span className="min-w-0 flex-1 truncate">{team.name}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-4 text-violet-strong" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
