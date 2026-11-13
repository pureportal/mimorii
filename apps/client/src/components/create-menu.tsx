import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  Bot,
  Globe2,
  LayoutDashboard,
  Network,
  Plus,
  RadioTower,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { CreateDestination } from "../lib/app-navigation";
import { Button } from "./ui/button";

const destinationIcons: Record<CreateDestination["id"], LucideIcon> = {
  resource: Network,
  check: Activity,
  heartbeat: RadioTower,
  agent: Bot,
  incident: Siren,
  "status-page": Globe2,
  dashboard: LayoutDashboard,
};

export function CreateMenu({ destinations }: { destinations: CreateDestination[] }) {
  if (!destinations.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Create">
          <Plus />
          <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[60] min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {destinations.map((destination) => {
            const Icon = destinationIcons[destination.id];
            return (
              <DropdownMenu.Item key={destination.id} asChild>
                <Link
                  to={destination.to}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-ink/5"
                >
                  <Icon className="size-4 text-violet-strong" />
                  {destination.label}
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
