import { Home, ListTree, Map, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Dialog, DialogContent, DialogHeader } from "../ui/dialog";
import { Input } from "../ui/input";
import {
  searchableGuideText,
  searchableWorkflowText,
  type GuideTopic,
  type GuideWorkflow,
} from "./guide-content";
import { GuideArtwork } from "./guide-artwork";
import { GuideHome } from "./guide-home";
import { GuideMenuLibrary, GuideSearchResults, GuideTopicDetail } from "./guide-library";
import { GuideWorkflowDetail, GuideWorkflowLibrary } from "./guide-workflows";

type GuideView = "home" | "menus" | "workflows" | "topic" | "workflow";

export function MimoGuideDialog({
  open,
  onOpenChange,
  topics,
  workflows,
  currentTopic,
  onStartTour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: readonly GuideTopic[];
  workflows: readonly GuideWorkflow[];
  currentTopic?: GuideTopic;
  onStartTour: (topic?: GuideTopic) => void;
}) {
  const [view, setView] = useState<GuideView>("home");
  const [returnView, setReturnView] = useState<GuideView>("home");
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<GuideTopic | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<GuideWorkflow | null>(null);
  const [workflowStep, setWorkflowStep] = useState(0);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setView("home");
    setReturnView("home");
    setQuery("");
    setSelectedTopic(null);
    setSelectedWorkflow(null);
    setWorkflowStep(0);
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const searchTopics = useMemo(
    () =>
      normalizedQuery
        ? topics.filter((topic) => searchableGuideText(topic).includes(normalizedQuery))
        : [],
    [normalizedQuery, topics]
  );
  const searchWorkflows = useMemo(
    () =>
      normalizedQuery
        ? workflows.filter((workflow) => searchableWorkflowText(workflow).includes(normalizedQuery))
        : [],
    [normalizedQuery, workflows]
  );

  function changeView(nextView: GuideView) {
    setQuery("");
    setView(nextView);
    setSelectedTopic(null);
    setSelectedWorkflow(null);
    setWorkflowStep(0);
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    if (!nextQuery.trim() || (view !== "topic" && view !== "workflow")) return;
    setView("home");
    setSelectedTopic(null);
    setSelectedWorkflow(null);
    setWorkflowStep(0);
  }

  function clearQuery() {
    setQuery("");
    searchFieldRef.current?.querySelector("input")?.focus();
  }

  function openTopic(topic: GuideTopic) {
    setReturnView(normalizedQuery ? "home" : view);
    setSelectedTopic(topic);
    setView("topic");
  }

  function openWorkflow(workflow: GuideWorkflow) {
    setReturnView(normalizedQuery ? "home" : view);
    setSelectedWorkflow(workflow);
    setWorkflowStep(0);
    setView("workflow");
  }

  function backFromDetail() {
    setView(normalizedQuery ? "home" : returnView);
    setSelectedTopic(null);
    setSelectedWorkflow(null);
    setWorkflowStep(0);
  }

  const showingDetail = view === "topic" || view === "workflow";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(92dvh,820px)] max-h-[92dvh] max-w-6xl overflow-hidden rounded-[2rem] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchFieldRef.current?.querySelector("input")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = guideReturnFocusTarget();
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <div className="grid h-full min-h-0 lg:grid-cols-[252px_minmax(0,1fr)]">
          <aside className="relative hidden min-h-0 overflow-hidden border-r border-line bg-gradient-to-b from-lavender-soft/65 via-surface to-coral/10 lg:flex lg:flex-col">
            <GuideArtwork
              variant="portrait"
              className="h-64 w-full shrink-0 object-cover object-[53%_18%]"
            />
            <div className="absolute inset-x-0 top-44 h-24 bg-gradient-to-b from-transparent to-surface" />
            <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-5">
              <div className="mb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-strong">
                  Your guide
                </p>
                <p className="mt-1 font-display text-xl font-black">Mimo</p>
              </div>
              <GuideNavigation
                view={view}
                searching={Boolean(normalizedQuery) && !showingDetail}
                onChange={changeView}
              />
              {currentTopic ? (
                <button
                  type="button"
                  onClick={() => openTopic(currentTopic)}
                  className="mt-auto rounded-2xl border border-lavender/35 bg-surface/80 p-3 text-left outline-none transition hover:border-lavender focus-visible:ring-2 focus-visible:ring-coral-strong"
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                    Current page
                  </span>
                  <span className="mt-1 block text-sm font-bold text-ink">
                    {currentTopic.title}
                  </span>
                </button>
              ) : null}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-canvas/60">
            <header className="shrink-0 border-b border-line bg-surface/95 px-4 pb-4 pt-5 backdrop-blur sm:px-6">
              <DialogHeader title="Mimo Guide" />
              <div ref={searchFieldRef} className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  value={query}
                  onChange={(event) => changeQuery(event.target.value)}
                  aria-label="Search the guide"
                  placeholder="Search menus, features, or tasks"
                  className="bg-canvas/70 pl-10 pr-10"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={clearQuery}
                    className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted outline-none transition hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="mt-3 lg:hidden">
                <GuideNavigation
                  view={view}
                  searching={Boolean(normalizedQuery) && !showingDetail}
                  onChange={changeView}
                  horizontal
                />
              </div>
              {normalizedQuery && !showingDetail ? (
                <p className="sr-only" aria-live="polite">
                  {searchTopics.length + searchWorkflows.length} guide results
                </p>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
              {view === "topic" && selectedTopic ? (
                <GuideTopicDetail
                  topic={selectedTopic}
                  isCurrent={selectedTopic.id === currentTopic?.id}
                  onBack={backFromDetail}
                  onNavigate={() => onOpenChange(false)}
                  onStartTour={() => onStartTour(selectedTopic)}
                />
              ) : view === "workflow" && selectedWorkflow ? (
                <GuideWorkflowDetail
                  workflow={selectedWorkflow}
                  activeStep={workflowStep}
                  onStepChange={setWorkflowStep}
                  onBack={backFromDetail}
                  onNavigate={() => onOpenChange(false)}
                />
              ) : normalizedQuery ? (
                <GuideSearchResults
                  query={query.trim()}
                  topics={searchTopics}
                  workflows={searchWorkflows}
                  onOpenTopic={openTopic}
                  onOpenWorkflow={openWorkflow}
                />
              ) : view === "menus" ? (
                <GuideMenuLibrary topics={topics} onOpenTopic={openTopic} />
              ) : view === "workflows" ? (
                <GuideWorkflowLibrary workflows={workflows} onOpenWorkflow={openWorkflow} />
              ) : (
                <GuideHome
                  currentTopic={currentTopic}
                  workflows={workflows}
                  onOpenTopic={openTopic}
                  onOpenMenus={() => changeView("menus")}
                  onOpenWorkflows={() => changeView("workflows")}
                  onOpenWorkflow={openWorkflow}
                  onStartTour={() => onStartTour(currentTopic)}
                />
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function guideReturnFocusTarget(): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-guide="guide-trigger"], [aria-label="Open navigation"]'
    )
  ).find(isGuideReturnFocusTargetVisible);
}

function isGuideReturnFocusTargetVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      current.getAttribute("data-state") === "closed" ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function GuideNavigation({
  view,
  searching,
  onChange,
  horizontal = false,
}: {
  view: GuideView;
  searching: boolean;
  onChange: (view: GuideView) => void;
  horizontal?: boolean;
}) {
  const items = [
    { view: "home" as const, label: "Home", icon: Home },
    { view: "menus" as const, label: "Menus", icon: ListTree },
    { view: "workflows" as const, label: "Workflows", icon: Map },
  ];

  return (
    <nav
      aria-label="Guide sections"
      className={cn(horizontal ? "grid grid-cols-3 gap-1" : "space-y-1")}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          !searching &&
          (view === item.view ||
            (item.view === "menus" && view === "topic") ||
            (item.view === "workflows" && view === "workflow"));
        return (
          <button
            key={item.view}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.view)}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted outline-none transition hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong",
              horizontal && "justify-center gap-2 px-1 text-xs",
              active && "bg-lavender-soft text-violet-strong"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
