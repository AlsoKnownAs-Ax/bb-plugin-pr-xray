// The PR Lens walkthrough: a numbered list of steps, stepped with the arrow keys.
import { useEffect } from "react";
import { detailParts, type CiteRef, type WalkthroughStep } from "@coldtea/pr-lens-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { progressLabel, stepForKey } from "./walkthrough";

type StepProps = {
  steps: WalkthroughStep[];
  /** The selected step, or null for "All". */
  current: number | null;
  onSelect: (index: number | null) => void;
};

/** ← / → step through and Esc goes back to All, ignoring typing and dialogs as ReviewPage's keys do. Lives outside the panel so it works collapsed. */
export function useStepKeys({ steps, current, onSelect }: StepProps) {
  useEffect(() => {
    if (steps.length === 0) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]") || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const next = stepForKey(event.key, current, steps.length);
      if (next === undefined) {
        return;
      }

      onSelect(next);
      event.preventDefault();
    };
    // Capture runs before ReviewPage's listener, so Esc on a step leaves the step, not focus mode.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current, onSelect, steps.length]);
}

/** The walkthrough's progress and the button back to "All", for its section heading. */
export function WalkthroughProgress({ steps, current, onSelect }: StepProps) {
  return (
    <>
      <span className="text-xs font-normal text-muted-foreground">{progressLabel(current, steps.length)}</span>
      <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" aria-pressed={current === null} onClick={() => onSelect(null)}>
        All
      </Button>
    </>
  );
}

export function WalkthroughSteps({
  steps,
  current,
  onSelect,
  citeAction,
}: StepProps & {
  /** What clicking a cite does, or null to show it as plain text. */
  citeAction: (ref: CiteRef) => (() => void) | null;
}) {
  return (
    <ol className="space-y-1">
      {steps.map((step, index) => (
        <li key={step.id}>
          <button
            type="button"
            aria-current={index === current ? "step" : undefined}
            onClick={() => onSelect(index)}
            className="flex w-full gap-2 rounded-md p-2 text-left hover:bg-state-hover aria-[current=step]:bg-state-hover"
          >
            <StepNumber index={index} current={current} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.heading}</span>
              <span className="block text-xs text-muted-foreground">{step.body}</span>
            </span>
          </button>
          {index === current && step.detail ? (
            <p className="px-9 pb-2 text-xs text-muted-foreground">
              {detailParts(step.detail).map((part, partIndex) => {
                const action = part.ref && citeAction(part.ref);
                return action ? (
                  <button key={partIndex} type="button" className="text-foreground underline underline-offset-2 hover:text-primary" onClick={action}>
                    {part.text}
                  </button>
                ) : (
                  <span key={partIndex}>{part.text}</span>
                );
              })}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function StepNumber({ index, current }: { index: number; current: number | null }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]",
        index === current && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}
