import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import type { GuideWorkflow } from "./guide-content";

export function GuideWorkflowLibrary({
  workflows,
  onOpenWorkflow,
}: {
  workflows: readonly GuideWorkflow[];
  onOpenWorkflow: (workflow: GuideWorkflow) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-black tracking-tight">Workflows</h2>
        <p className="mt-2 text-sm text-muted">Choose what you want to complete.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {workflows.map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            onClick={() => onOpenWorkflow(workflow)}
            className="group flex min-h-32 items-start gap-4 rounded-2xl border border-line bg-surface p-5 text-left outline-none transition hover:-translate-y-0.5 hover:border-lavender hover:shadow-card focus-visible:ring-2 focus-visible:ring-coral-strong"
          >
            <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-coral/15 font-display text-danger">
              <span className="text-sm font-black leading-none">{workflow.steps.length}</span>
              <span className="mt-0.5 text-[9px] font-bold leading-none">steps</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display font-bold text-ink">{workflow.title}</span>
              <span className="mt-1 block text-sm leading-5 text-muted">{workflow.summary}</span>
            </span>
            <ArrowRight className="mt-2 size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GuideWorkflowDetail({
  workflow,
  activeStep,
  onStepChange,
  onBack,
  onNavigate,
}: {
  workflow: GuideWorkflow;
  activeStep: number;
  onStepChange: (index: number) => void;
  onBack: () => void;
  onNavigate: () => void;
}) {
  const step = workflow.steps[activeStep]!;
  const progress = ((activeStep + 1) / workflow.steps.length) * 100;

  return (
    <article className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg text-xs font-bold text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-coral-strong"
      >
        <ArrowLeft className="size-4" /> Workflows
      </button>

      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-strong">
          Step-by-step
        </p>
        <h2 className="mt-1 font-display text-3xl font-black tracking-tight">{workflow.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{workflow.summary}</p>
      </header>

      <div
        role="progressbar"
        aria-label={`${workflow.title} progress`}
        aria-valuemin={1}
        aria-valuemax={workflow.steps.length}
        aria-valuenow={activeStep + 1}
        className="h-2 overflow-hidden rounded-full bg-ink/6"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-coral to-lavender transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.72fr)]">
        <section
          aria-live="polite"
          className="rounded-3xl border border-lavender/45 bg-surface p-5 sm:p-6"
        >
          <p className="text-xs font-bold text-violet-strong">
            Step {activeStep + 1} of {workflow.steps.length}
          </p>
          <h3 className="mt-2 font-display text-2xl font-bold text-ink">{step.title}</h3>
          <p className="mt-3 text-sm leading-7 text-muted">{step.text}</p>
          {step.to && step.action ? (
            <Button asChild variant="coral" className="mt-5">
              <Link to={step.to} onClick={onNavigate}>
                {step.action} <ArrowRight />
              </Link>
            </Button>
          ) : null}
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeStep === 0}
              onClick={() => onStepChange(activeStep - 1)}
            >
              <ChevronLeft /> Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={activeStep === workflow.steps.length - 1}
              onClick={() => onStepChange(activeStep + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </section>

        <ol className="space-y-2">
          {workflow.steps.map((workflowStep, index) => {
            const active = index === activeStep;
            const passed = index < activeStep;
            return (
              <li key={workflowStep.title}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => onStepChange(index)}
                  className={`flex w-full gap-3 rounded-2xl border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-coral-strong ${
                    active
                      ? "border-lavender bg-lavender-soft text-violet-strong"
                      : "border-line bg-surface text-muted hover:border-lavender"
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      passed
                        ? "bg-success text-night"
                        : active
                          ? "bg-violet-strong text-night"
                          : "bg-ink/6 text-muted"
                    }`}
                  >
                    {passed ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-sm font-bold text-ink">{workflowStep.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {workflowStep.text}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}
