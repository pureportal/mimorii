import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  ListTree,
  Map,
  Network,
  PlayCircle,
  Siren,
} from "lucide-react";
import type { GuideTopic, GuideWorkflow } from "./guide-content";
import { GuideArtwork } from "./guide-artwork";
import { GuideTopicIcon } from "./guide-icons";

export function GuideHome({
  currentTopic,
  workflows,
  onOpenTopic,
  onOpenMenus,
  onOpenWorkflows,
  onOpenWorkflow,
  onStartTour,
}: {
  currentTopic?: GuideTopic;
  workflows: readonly GuideWorkflow[];
  onOpenTopic: (topic: GuideTopic) => void;
  onOpenMenus: () => void;
  onOpenWorkflows: () => void;
  onOpenWorkflow: (workflow: GuideWorkflow) => void;
  onStartTour: () => void;
}) {
  return (
    <div className="space-y-7">
      <section className="relative min-h-52 overflow-hidden rounded-3xl border border-lavender/35 bg-surface sm:min-h-60">
        <GuideArtwork
          variant="map"
          className="absolute inset-0 h-full w-full object-cover object-[63%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/92 to-transparent sm:via-surface/64" />
        <div className="relative flex min-h-52 max-w-md flex-col justify-end p-5 sm:min-h-60 sm:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-strong">
            Mimo Guide
          </p>
          <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-ink sm:text-3xl">
            What would you like to find?
          </h2>
          {currentTopic ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              You are viewing {currentTopic.title}.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-label="Guide shortcuts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {currentTopic ? (
          <Shortcut
            icon={BookOpen}
            label="Explain this page"
            onClick={() => onOpenTopic(currentTopic)}
          />
        ) : null}
        <Shortcut icon={ListTree} label="Browse every menu" onClick={onOpenMenus} />
        <Shortcut icon={Map} label="Choose a workflow" onClick={onOpenWorkflows} />
        <Shortcut icon={PlayCircle} label="Tour this screen" onClick={onStartTour} />
      </section>

      {currentTopic ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-bold">This page</h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenTopic(currentTopic)}
            className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left outline-none transition hover:border-lavender hover:bg-lavender-soft/35 focus-visible:ring-2 focus-visible:ring-coral-strong"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lavender-soft text-violet-strong">
              <GuideTopicIcon topic={currentTopic} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display font-bold text-ink">{currentTopic.title}</span>
              <span className="mt-1 block text-sm leading-5 text-muted">
                {currentTopic.summary}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted" />
          </button>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold">How Mimorii works</h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2">
          <Concept
            number="1"
            icon={Network}
            title="Add what matters"
            text="Resources are the websites, services, ports, and servers you want to watch."
          />
          <Concept
            number="2"
            icon={Activity}
            title="Collect health signals"
            text="Checks test resources, heartbeats follow scheduled jobs, and agents reach servers and private networks."
          />
          <Concept
            number="3"
            icon={Siren}
            title="Respond to change"
            text="Incidents record unexpected problems; maintenance covers planned work; alerting contacts the right people."
          />
          <Concept
            number="4"
            icon={BarChart3}
            title="Learn and share"
            text="Reports and goals track reliability, while dashboards and status pages share the right view."
          />
        </ol>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold">Common workflows</h2>
          <button
            type="button"
            onClick={onOpenWorkflows}
            className="text-xs font-bold text-violet-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-coral-strong"
          >
            View all
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {workflows.slice(0, 4).map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => onOpenWorkflow(workflow)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm font-semibold text-ink outline-none transition hover:border-lavender hover:bg-lavender-soft/35 focus-visible:ring-2 focus-visible:ring-coral-strong"
            >
              {workflow.title}
              <ArrowRight className="size-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Shortcut({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof BookOpen;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left text-sm font-semibold text-ink outline-none transition hover:-translate-y-0.5 hover:border-lavender hover:shadow-card focus-visible:ring-2 focus-visible:ring-coral-strong"
    >
      <Icon className="size-4 shrink-0 text-violet-strong" />
      {label}
    </button>
  );
}

function Concept({
  number,
  icon: Icon,
  title,
  text,
}: {
  number: string;
  icon: typeof Network;
  title: string;
  text: string;
}) {
  return (
    <li className="relative rounded-2xl border border-line bg-surface p-4 pl-16">
      <span className="absolute left-4 top-4 grid size-9 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
        <Icon className="size-4" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">Step {number}</p>
      <h3 className="mt-1 font-display font-bold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-muted">{text}</p>
    </li>
  );
}
