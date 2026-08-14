import type { ManagedSponsor, SponsorshipTier } from "@mimorii/contracts";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ExternalLink, Gem, GripVertical, Medal, Pencil, Shield, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";

interface SponsorTierListProps {
  tier: SponsorshipTier;
  sponsors: ManagedSponsor[];
  disabled: boolean;
  onDelete: (sponsor: ManagedSponsor) => void;
  onEdit: (sponsor: ManagedSponsor) => void;
  onReorder: (tier: SponsorshipTier, sponsorIds: string[]) => void;
}

interface TierAppearance {
  label: string;
  icon: LucideIcon;
  section: string;
  iconSurface: string;
}

const tierAppearance: Record<SponsorshipTier, TierAppearance> = {
  platinum: {
    label: "Platinum",
    icon: Gem,
    section: "border-platinum-border bg-gradient-to-br from-surface to-platinum-surface",
    iconSurface: "border-platinum-border bg-surface/80 text-platinum-strong",
  },
  gold: {
    label: "Gold",
    icon: Medal,
    section: "border-gold-border bg-gradient-to-br from-surface to-gold-surface",
    iconSurface: "border-gold-border bg-surface/80 text-gold-strong",
  },
  silver: {
    label: "Silver",
    icon: Shield,
    section: "border-silver-border bg-gradient-to-br from-surface to-silver-surface",
    iconSurface: "border-silver-border bg-surface/80 text-silver-strong",
  },
};

export function SponsorTierList({
  tier,
  sponsors,
  disabled,
  onDelete,
  onEdit,
  onReorder,
}: SponsorTierListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const appearance = tierAppearance[tier];
  const titleId = `admin-${tier}-sponsors`;
  const sortingDisabled = disabled || sponsors.length < 2;

  function finishDrag(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const currentIndex = sponsors.findIndex((sponsor) => sponsor.id === event.active.id);
    const nextIndex = sponsors.findIndex((sponsor) => sponsor.id === event.over!.id);
    if (currentIndex < 0 || nextIndex < 0) return;
    onReorder(
      tier,
      arrayMove(sponsors, currentIndex, nextIndex).map((sponsor) => sponsor.id)
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-2xl border p-2 sm:p-3", appearance.section)}
    >
      <div className="flex items-center gap-2.5 px-2 py-2 sm:px-3">
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg border shadow-sm",
            appearance.iconSurface
          )}
        >
          <appearance.icon aria-hidden="true" className="size-4" />
        </span>
        <h4 id={titleId} className="font-display text-sm font-bold">
          {appearance.label}
        </h4>
      </div>
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={finishDrag}>
        <SortableContext
          items={sponsors.map((sponsor) => sponsor.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="grid gap-2">
            {sponsors.map((sponsor) => (
              <SortableSponsor
                key={sponsor.id}
                sponsor={sponsor}
                disabled={disabled}
                sortingDisabled={sortingDisabled}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableSponsor({
  sponsor,
  disabled,
  sortingDisabled,
  onDelete,
  onEdit,
}: {
  sponsor: ManagedSponsor;
  disabled: boolean;
  sortingDisabled: boolean;
  onDelete: (sponsor: ManagedSponsor) => void;
  onEdit: (sponsor: ManagedSponsor) => void;
}) {
  const {
    active,
    attributes,
    isDragging,
    listeners,
    over,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: sponsor.id, disabled: sortingDisabled });
  const isDropTarget = over?.id === sponsor.id && active?.id !== sponsor.id;

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border border-line/90 bg-surface/95 px-2 py-2 shadow-sm transition-[border-color,box-shadow,opacity] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-3 sm:px-3",
        isDropTarget && "border-coral-strong ring-2 ring-coral/20",
        isDragging && "z-10 border-lavender opacity-55 shadow-xl"
      )}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${sponsor.name}`}
        className="grid size-10 touch-none cursor-grab place-items-center rounded-lg text-muted outline-none hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong active:cursor-grabbing disabled:pointer-events-none disabled:opacity-40"
        disabled={sortingDisabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
      <div className="min-w-0 py-1">
        <p className="truncate text-sm font-semibold text-ink">{sponsor.name}</p>
        {sponsor.websiteUrl ? (
          <a
            href={sponsor.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-violet-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-coral/45"
          >
            <span className="truncate">{sponsor.websiteUrl}</span>
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          </a>
        ) : null}
      </div>
      <span className="col-start-2 row-start-2 mt-1 justify-self-start sm:col-start-3 sm:row-start-1 sm:mt-0">
        <StatusBadge status={sponsor.published ? "operational" : "paused"}>
          {sponsor.published ? "Published" : "Draft"}
        </StatusBadge>
      </span>
      <div className="col-start-3 row-start-1 flex items-center justify-end gap-1 sm:col-start-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${sponsor.name}`}
          disabled={disabled}
          onClick={() => onEdit(sponsor)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-danger"
          aria-label={`Delete ${sponsor.name}`}
          disabled={disabled}
          onClick={() => onDelete(sponsor)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
