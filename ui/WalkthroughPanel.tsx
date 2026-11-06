// The PR Lens walkthrough, floating over the right of the diagram canvas: a
// numbered list of steps, stepped with the arrow keys.
import { useEffect } from "react";
import { detailParts, type CiteRef, type WalkthroughStep } from "@coldtea/pr-lens-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { progressLabel, stepForKey } from "./walkthrough";

/** Width the panel takes over the canvas, including its margin, so fitting can keep clear of it. */
export const WALKTHROUGH_PANEL_WIDTH = 344;

export function WalkthroughPanel({
  steps,
  current,
  onSelect,
  citeAction,
}: {
  steps: WalkthroughStep[];
  /** The selected step, or null for "All". */
  current: number | null;
  onSelect: (index: number | null) => void;
  /** What clicking a cite does, or null to show it as plain text. */
  citeAction: (ref: CiteRef) => (() => void) | null;
}) {
  // ← / → step through, ignoring typing and dialogs as ReviewPage's keys do.
  useEffect(() => {
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onSelect, steps.length]);

  return (
    <aside
      aria-label="Walkthrough"
      className="absolute right-3 top-3 bottom-14 flex w-80 flex-col rounded-lg border border-border bg-background/95 shadow-md"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Walkthrough</span>
        <span className="text-xs text-muted-foreground">{progressLabel(current, steps.length)}</span>
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" aria-pressed={current === null} onClick={() => onSelect(null)}>
          All
        </Button>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              aria-current={index === current ? "step" : undefined}
              onClick={() => onSelect(index)}
              className="flex w-full gap-2 rounded-md p-2 text-left hover:bg-state-hover aria-[current=step]:bg-state-hover"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]",
                  index === current && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {index + 1}
              </span>
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
    </aside>
  );
}
