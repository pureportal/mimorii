import {
  appRoutes,
  type CheckSummary,
  type IncidentSummary,
  type ResourceSummary,
} from "@mimorii/contracts";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Activity, CornerDownLeft, Plus, Search, Server, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { NavigationGroup } from "../lib/app-navigation";
import { checkTypeLabels } from "../lib/check-types";
import { cn } from "../lib/cn";
import { StatusBadge } from "./ui/badge";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  detail?: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  status?: Parameters<typeof StatusBadge>[0]["status"];
}

const groupLimit = 6;

export function CommandPalette({
  open,
  onOpenChange,
  teamId,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  groups: readonly NavigationGroup[];
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-night/70 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <PaletteBody teamId={teamId} groups={groups} onClose={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({
  teamId,
  groups,
  onClose,
}: {
  teamId: string;
  groups: readonly NavigationGroup[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const resources = useQuery({
    queryKey: ["resources", teamId],
    queryFn: () => api<ResourceSummary[]>(`/teams/${teamId}/resources`),
  });
  const checks = useQuery({
    queryKey: ["checks", teamId],
    queryFn: () => api<CheckSummary[]>(`/teams/${teamId}/checks`),
  });
  const incidents = useQuery({
    queryKey: ["incidents", teamId],
    queryFn: () => api<IncidentSummary[]>(`/teams/${teamId}/incidents?limit=500`),
  });

  const items = useMemo(() => {
    const pageEntries: PaletteItem[] = groups.flatMap((group) =>
      group.items.flatMap((item) => [
        {
          id: `page:${item.to}`,
          group: "Pages",
          label: item.label,
          detail: group.label,
          to: item.to,
          icon: CornerDownLeft,
        },
        ...(item.children ?? []).map((child) => ({
          id: `page:${child.to}`,
          group: "Pages",
          label: child.label,
          detail: item.label,
          to: child.to,
          icon: CornerDownLeft,
        })),
      ])
    );
    const pages = pageEntries.filter(
      (item, index) => pageEntries.findIndex((other) => other.id === item.id) === index
    );
    const actions: PaletteItem[] = [
      {
        id: "action:resource",
        group: "Actions",
        label: "Add resource",
        to: appRoutes.newResource,
        icon: Plus,
      },
    ];
    const resourceNames = new Map(resources.data?.map((resource) => [resource.id, resource.name]));
    const records: PaletteItem[] = [
      ...(resources.data ?? []).map((resource) => ({
        id: `resource:${resource.id}`,
        group: "Resources",
        label: resource.name,
        detail: resource.tags.join(", ") || undefined,
        to: appRoutes.resource(resource.id),
        icon: Server,
        status: resource.status,
      })),
      ...(checks.data ?? []).map((check) => ({
        id: `check:${check.id}`,
        group: "Checks",
        label: check.name,
        detail: [resourceNames.get(check.resourceId), checkTypeLabels[check.type]]
          .filter(Boolean)
          .join(" · "),
        to: appRoutes.check(check.id),
        icon: Activity,
        status: check.status,
      })),
      ...(incidents.data ?? [])
        .filter((incident) => incident.status !== "resolved")
        .map((incident) => ({
          id: `incident:${incident.id}`,
          group: "Incidents",
          label: incident.title,
          detail: incident.resources.map((resource) => resource.name).join(", ") || undefined,
          to: appRoutes.incidents,
          icon: TriangleAlert,
          status: incident.status,
        })),
    ];
    const text = query.trim().toLowerCase();
    const matches = (item: PaletteItem) =>
      `${item.label} ${item.detail ?? ""}`.toLowerCase().includes(text);
    const candidates = text
      ? [...actions, ...pages, ...records]
      : [...actions, ...pages.slice(0, 8)];
    const grouped = new Map<string, PaletteItem[]>();
    for (const item of candidates) {
      if (text && !matches(item)) continue;
      const list = grouped.get(item.group) ?? [];
      if (list.length < (text ? groupLimit : 8)) grouped.set(item.group, [...list, item]);
    }
    return [...grouped.values()].flat();
  }, [checks.data, groups, incidents.data, query, resources.data]);

  const selected = items[Math.min(activeIndex, items.length - 1)];

  function choose(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    void navigate(item.to);
  }

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-5">
        <Search className="size-5 shrink-0 text-muted" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${selected.id}` : undefined}
          aria-label="Search pages, resources, checks, and incidents"
          placeholder="Search pages, resources, checks, and incidents"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(selected);
            }
          }}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">
          Esc
        </kbd>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Results"
        className="max-h-[min(60vh,28rem)] overflow-y-auto p-2"
      >
        {items.length ? (
          items.map((item, index) => {
            const Icon = item.icon;
            const showGroup = index === 0 || items[index - 1]!.group !== item.group;
            return (
              <div key={item.id}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted first:pt-1">
                    {item.group}
                  </p>
                ) : null}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={item === selected}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5",
                    item === selected && "bg-lavender-soft"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    {item.detail ? (
                      <p className="truncate text-xs text-muted">{item.detail}</p>
                    ) : null}
                  </div>
                  {item.status ? <StatusBadge status={item.status} /> : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted">No results</p>
        )}
      </div>
    </div>
  );
}
