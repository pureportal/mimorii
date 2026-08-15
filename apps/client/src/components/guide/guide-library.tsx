import { ArrowLeft, ArrowRight, PlayCircle, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import {
  guideGroupLabels,
  guideGroupOrder,
  type GuideTopic,
  type GuideWorkflow,
} from "./guide-content";
import { GuideArtwork } from "./guide-artwork";
import { GuideTopicIcon } from "./guide-icons";

export function GuideMenuLibrary({
  topics,
  onOpenTopic,
}: {
  topics: readonly GuideTopic[];
  onOpenTopic: (topic: GuideTopic) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-display text-2xl font-black tracking-tight">Menus</h2>
        <p className="mt-2 text-sm text-muted">Choose an area to see what it contains.</p>
      </div>

      {guideGroupOrder.map((group) => {
        const groupTopics = topics.filter((topic) => topic.group === group && topic.menu !== false);
        if (!groupTopics.length) return null;
        return (
          <section key={group}>
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              {guideGroupLabels[group]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupTopics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} onClick={() => onOpenTopic(topic)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function GuideSearchResults({
  query,
  topics,
  workflows,
  onOpenTopic,
  onOpenWorkflow,
}: {
  query: string;
  topics: readonly GuideTopic[];
  workflows: readonly GuideWorkflow[];
  onOpenTopic: (topic: GuideTopic) => void;
  onOpenWorkflow: (workflow: GuideWorkflow) => void;
}) {
  if (!topics.length && !workflows.length) {
    return (
      <div className="grid min-h-80 place-items-center text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 size-24 overflow-hidden rounded-full border border-line bg-surface">
            <GuideArtwork
              variant="map"
              className="h-full w-full object-cover object-[87%_center]"
            />
          </div>
          <SearchX className="mx-auto size-5 text-muted" />
          <h2 className="mt-3 font-display text-lg font-bold">No guide results</h2>
          <p className="mt-1 text-sm text-muted">Try a menu name, feature, or task.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Search</p>
        <h2 className="mt-1 font-display text-2xl font-black tracking-tight">
          Results for “{query}”
        </h2>
      </div>

      {topics.length ? (
        <section>
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Menus and features
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} onClick={() => onOpenTopic(topic)} />
            ))}
          </div>
        </section>
      ) : null}

      {workflows.length ? (
        <section>
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Workflows
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                onClick={() => onOpenWorkflow(workflow)}
                className="rounded-2xl border border-line bg-surface p-4 text-left outline-none transition hover:border-lavender hover:bg-lavender-soft/30 focus-visible:ring-2 focus-visible:ring-coral-strong"
              >
                <span className="font-display font-bold text-ink">{workflow.title}</span>
                <span className="mt-1 block text-sm leading-5 text-muted">{workflow.summary}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function GuideTopicDetail({
  topic,
  isCurrent,
  onBack,
  onNavigate,
  onStartTour,
}: {
  topic: GuideTopic;
  isCurrent: boolean;
  onBack: () => void;
  onNavigate: () => void;
  onStartTour: () => void;
}) {
  return (
    <article className="space-y-7">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg text-xs font-bold text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-lavender-soft text-violet-strong">
          <GuideTopicIcon topic={topic} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-strong">
            {guideGroupLabels[topic.group]}
          </p>
          <h2 className="mt-1 font-display text-3xl font-black tracking-tight">{topic.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{topic.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isCurrent && topic.tour.length ? (
              <Button type="button" variant="coral" size="sm" onClick={onStartTour}>
                <PlayCircle /> Show me around
              </Button>
            ) : (
              <Button asChild variant="coral" size="sm">
                <Link to={topic.to} onClick={onNavigate}>
                  Open {topic.title} <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {topic.sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-display font-bold">{section.title}</h3>
            <ul className="mt-3 space-y-3">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-coral" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {topic.distinctions?.length ? (
        <section>
          <h3 className="mb-3 font-display text-lg font-bold">How these areas differ</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topic.distinctions.map((item) => (
              <div key={item.title} className="rounded-2xl bg-ink/[.035] p-4">
                <p className="text-sm font-bold text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function TopicCard({ topic, onClick }: { topic: GuideTopic; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-28 items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left outline-none transition hover:-translate-y-0.5 hover:border-lavender hover:shadow-card focus-visible:ring-2 focus-visible:ring-coral-strong"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-soft text-violet-strong">
        <GuideTopicIcon topic={topic} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display font-bold text-ink">{topic.title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted">{topic.summary}</span>
      </span>
      <ArrowRight className="mt-2 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
    </button>
  );
}
