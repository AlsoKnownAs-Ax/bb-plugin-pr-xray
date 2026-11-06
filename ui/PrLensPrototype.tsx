// PROTOTYPE (issue #27), throwaway: PR Lens diagrams in an Explain-like page.
// Answers: theme fit, pan/zoom with atlas click targets and pins, walkthrough
// stepping, pauseAnimations under reduced motion, data-model rendering.
// Not for merge. Open with the "PR Lens prototype" link on the PR X-ray home.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import type { View, WalkthroughStep } from "@coldtea/pr-lens-schema";
import type { Box, RenderAtlas, RenderedSvg } from "@coldtea/pr-lens-renderer";
import renders from "./pr-lens-prototype.renders.json";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Pre-rendered by pr-lens-prototype.render.mjs: the renderer needs node:crypto.
// `background` is the renderer's baked palette background for that theme.
type Rendered = Pick<RenderedSvg, "svg" | "width" | "height" | "animated" | "atlas"> & { background: string };
const DOCS = renders as unknown as Record<string, { views: View[]; walkthrough: WalkthroughStep[]; renders: Record<string, Rendered> }>;
const DOC_NAMES = Object.keys(DOCS);

type Pin = { key: string; kind: "node" | "table"; id: string; text: string };

// Floating layers over the canvas: the only things on the page that cast a shadow.
const PANEL = "pointer-events-auto rounded-lg border border-border bg-background shadow-lg";
// Room the floating panels take, so fitting never hides content under them.
const FIT_INSET = { left: 32, top: 72, bottom: 72, right: 32, rightWithPanel: 352 };

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

function focusBoxes(step: WalkthroughStep, atlas: RenderAtlas, flowId: string | undefined): Box[] {
  const focus = step.focus;
  if (focus.kind === "all") return [];
  const pick = (record: Record<string, Box>, ids: string[]) => ids.map((id) => record[id]).filter((box): box is Box => box !== undefined);
  return [
    ...pick(atlas.lanes, focus.lanes),
    ...pick(atlas.nodes, focus.nodes),
    ...pick(atlas.edges, focus.edges),
    ...pick(atlas.tables, focus.tables),
    ...(flowId ? pick(atlas.messages[flowId] ?? {}, focus.messages) : []),
  ];
}

// A flow stage plays over the first data-flow view that selects that flow.
function viewForStep(step: WalkthroughStep, views: View[]): View | undefined {
  const stage = step.stage;
  if (!stage) return undefined;
  if (stage.kind === "view") return views.find((view) => view.id === stage.view);
  return views.find((view) => view.lens === "data-flow" && (view.scope.kind === "all" || view.scope.flows.includes(stage.flow)));
}

export function PrLensPrototype() {
  const codeTheme = useCodeTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [docName, setDocName] = useState(DOC_NAMES[0]!);
  const [themeOverride, setThemeOverride] = useState<"auto" | "light" | "dark">("auto");
  const [forcePause, setForcePause] = useState(false);
  const doc = DOCS[docName]!;
  const views = doc.views;
  const [viewId, setViewId] = useState(views[0]!.id);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [showState, setShowState] = useState(false);
  const [selected, setSelected] = useState<{ kind: "node" | "table"; id: string } | null>(null);
  const theme = themeOverride === "auto" ? codeTheme.mode : themeOverride;
  const steps = doc.walkthrough;
  const step = stepIndex === null ? null : steps[stepIndex] ?? null;
  const view = views.find((candidate) => candidate.id === viewId) ?? views[0]!;

  const found = doc.renders[`${view.id}:${theme}`];
  const rendered = found ? { ok: true as const, ...found } : { ok: false as const, error: `No render for ${view.id} in the ${theme} theme.` };

  const flowId = step?.stage?.kind === "flow" ? step.stage.flow : view.scope.kind === "selection" ? view.scope.flows[0] : undefined;
  const focused = rendered.ok && step ? focusBoxes(step, rendered.atlas, flowId) : [];
  const focusBox = union(focused);

  // Pan/zoom, same model as DiagramCanvas.
  const containerRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const fitTo = (box: Box, maxScale: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = rect.width > 760 ? FIT_INSET.rightWithPanel : FIT_INSET.right;
    const width = rect.width - FIT_INSET.left - right;
    const height = rect.height - FIT_INSET.top - FIT_INSET.bottom;
    const scale = Math.max(0.1, Math.min(maxScale, width / box.width, height / box.height));
    setPan({ scale, x: FIT_INSET.left + width / 2 - (box.x + box.width / 2) * scale, y: FIT_INSET.top + height / 2 - (box.y + box.height / 2) * scale });
  };
  const fitAll = () => {
    if (rendered.ok) fitTo({ x: 0, y: 0, width: rendered.width, height: rendered.height }, 1.2);
  };
  const zoomAround = (factor: number, px: number, py: number) =>
    setPan((current) => {
      const scale = Math.min(4, Math.max(0.1, current.scale * factor));
      return { scale, x: px - ((px - current.x) * scale) / current.scale, y: py - ((py - current.y) * scale) / current.scale };
    });
  const zoomBy = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomAround(factor, rect.width / 2, rect.height / 2);
  };
  const focusKey = JSON.stringify(focusBox);
  useLayoutEffect(() => {
    if (!rendered.ok) return;
    fitTo(focusBox ?? { x: 0, y: 0, width: rendered.width, height: rendered.height }, focusBox ? 1.6 : 1.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, focusKey]);

  // Q4: SMIL pulses must stop under reduced motion.
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    const svg = svgHostRef.current?.querySelector("svg");
    if (!svg) return setPaused(null);
    if (prefersReducedMotion || forcePause) svg.pauseAnimations();
    else svg.unpauseAnimations();
    setPaused(svg.animationsPaused());
  }, [found, prefersReducedMotion, forcePause]);

  // Q3: ←/→ step through the walkthrough.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (steps.length === 0 || (event.target as HTMLElement).closest("input, textarea")) return;
      if (event.key === "ArrowRight") goTo(stepIndex === null ? 0 : Math.min(steps.length - 1, stepIndex + 1));
      if (event.key === "ArrowLeft") goTo(stepIndex === null ? 0 : Math.max(0, stepIndex - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const goTo = (index: number | null) => {
    setStepIndex(index);
    const target = index === null ? undefined : viewForStep(steps[index]!, views);
    if (target) setViewId(target.id);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (event.ctrlKey || event.metaKey) zoomAround(Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
    else setPan((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-target]")) return;
    drag.current = { x: event.clientX, y: event.clientY, vx: pan.x, vy: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (state) setPan((current) => ({ ...current, x: state.vx + event.clientX - state.x, y: state.vy + event.clientY - state.y }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const switchDoc = (name: string) => {
    setDocName(name);
    setViewId(DOCS[name]!.views[0]!.id);
    setStepIndex(null);
    setPins([]);
    setSelected(null);
  };

  const targets = rendered.ok
    ? [
        ...Object.entries(rendered.atlas.nodes).map(([id, box]) => ({ kind: "node" as const, id, box })),
        ...Object.entries(rendered.atlas.tables).map(([id, box]) => ({ kind: "table" as const, id, box })),
      ]
    : [];
  const viewPins = pins.filter((pin) => pin.key === view.id);
  // Pins and rims keep their on-screen size while the diagram zooms.
  const counterScale = 1 / pan.scale;

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {/* The canvas is the page; every control floats over it. */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab select-none active:cursor-grabbing"
        style={{ backgroundColor: rendered.ok ? rendered.background : undefined }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onLostPointerCapture={endDrag}
      >
        {rendered.ok ? (
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`, width: rendered.width, height: rendered.height }}>
            {/* Renderer output is escaped at its boundary (README: Untrusted text). */}
            <div ref={svgHostRef} className="[&>svg]:block" dangerouslySetInnerHTML={{ __html: rendered.svg }} />
            {focusBox ? (
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={rendered.width} height={rendered.height}>
                {/* The veil reaches past the drawing so the dim covers the whole canvas. */}
                <path
                  fillRule="evenodd"
                  fill={rendered.background}
                  fillOpacity={0.75}
                  d={`M-8000 -8000H${rendered.width + 8000}V${rendered.height + 8000}H-8000Z ${focused.map((b) => `M${b.x - 6} ${b.y - 6}h${b.width + 12}v${b.height + 12}h${-(b.width + 12)}Z`).join(" ")}`}
                />
                {focused.map((b, i) => (
                  <rect key={i} x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            ) : null}
            {targets.map(({ kind, id, box }) => (
              <button
                key={`${kind}:${id}`}
                type="button"
                data-target
                aria-label={`Comment on ${kind} ${id}`}
                aria-pressed={selected?.kind === kind && selected.id === id}
                onClick={() => setSelected({ kind, id })}
                className="absolute cursor-pointer rounded-lg outline-offset-4 hover:outline hover:outline-2 hover:outline-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-primary"
                style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              />
            ))}
            {viewPins.map((pin, index) => {
              const box = pin.kind === "node" ? rendered.atlas.nodes[pin.id] : rendered.atlas.tables[pin.id];
              if (!box) return null;
              const sameTarget = viewPins.filter((other) => other.id === pin.id).indexOf(pin);
              return (
                <span
                  key={index}
                  title={pin.text}
                  className="pointer-events-none absolute flex size-6 origin-bottom-left items-center justify-center rounded-full rounded-bl-none border-2 border-background bg-foreground text-[11px] font-semibold tabular-nums text-background shadow-md"
                  style={{ left: box.x + box.width - 4 + sameTarget * 18 * counterScale, top: box.y - 24, transform: `scale(${counterScale})` }}
                >
                  {index + 1}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-destructive">{rendered.error}</div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-3 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={cn(PANEL, "flex min-w-0 flex-wrap items-center gap-1 p-1")}>
            {DOC_NAMES.map((name) => (
              <Button key={name} size="sm" variant="ghost" aria-pressed={name === docName} onClick={() => switchDoc(name)}>
                {name.split(" ")[0]}
              </Button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {views.map((candidate) => (
              <Button key={candidate.id} size="sm" variant="ghost" aria-pressed={candidate.id === view.id} onClick={() => setViewId(candidate.id)}>
                {candidate.title}
              </Button>
            ))}
          </div>
          <div className={cn(PANEL, "ml-auto flex shrink-0 items-center gap-1 p-1")}>
            <span
              className="rounded-full border border-warning/60 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-text"
              title="Issue #27. Throwaway, not for merge. Example data from @coldtea/pr-lens-schema."
            >
              Prototype
            </span>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {(["auto", "light", "dark"] as const).map((option) => (
              <Button key={option} size="sm" variant="ghost" className="capitalize" aria-pressed={themeOverride === option} onClick={() => setThemeOverride(option)}>
                {option}
              </Button>
            ))}
            <Button size="sm" variant="ghost" aria-pressed={forcePause} onClick={() => setForcePause(!forcePause)}>
              <Icon name="Pause" />
              Reduced motion
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-start justify-end">
          <aside className={cn(PANEL, "flex max-h-full w-80 flex-col overflow-hidden text-sm")}>
            <div className="flex items-center gap-2 border-b border-border py-1.5 pl-3 pr-1.5">
              <h2 className="text-[15px] font-semibold leading-[22px]">Walkthrough</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">{stepIndex === null ? `${steps.length} steps` : `${stepIndex + 1} of ${steps.length}`}</span>
              <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" aria-pressed={stepIndex === null} onClick={() => goTo(null)}>
                All
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto p-1">
              {steps.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">This document has no walkthrough.</p> : null}
              <ol>
                {steps.map((candidate, index) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      aria-current={index === stepIndex ? "step" : undefined}
                      onClick={() => goTo(index)}
                      className="group flex w-full gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-state-hover hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[current=step]:bg-state-active"
                    >
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium tabular-nums text-muted-foreground group-aria-[current=step]:border-foreground group-aria-[current=step]:bg-foreground group-aria-[current=step]:text-background">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{candidate.heading}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{candidate.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            {selected ? (
              <form
                className="space-y-2 border-t border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = new FormData(event.currentTarget).get("text")?.toString().trim() ?? "";
                  if (!text) return;
                  setPins((current) => [...current, { key: view.id, ...selected, text }]);
                  event.currentTarget.reset();
                }}
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0">Comment on {selected.kind}</span>
                  <code className="min-w-0 truncate font-mono text-foreground">{selected.id}</code>
                  <Button type="button" size="icon" variant="ghost" className="ml-auto size-6 shrink-0" aria-label="Close comment" onClick={() => setSelected(null)}>
                    <Icon name="X" />
                  </Button>
                </div>
                <Input name="text" aria-label="Design comment" autoFocus placeholder="Design comment, Enter to pin" />
              </form>
            ) : null}
          </aside>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-col items-start gap-2">
            {showState ? (
              <pre className={cn(PANEL, "max-w-xs whitespace-pre-wrap p-2 font-mono text-[11px] text-muted-foreground")}>
                {JSON.stringify(
                  {
                    view: view.id,
                    lens: view.lens,
                    theme,
                    bbThemeMode: codeTheme.mode,
                    size: rendered.ok ? [rendered.width, rendered.height] : null,
                    animated: rendered.ok ? rendered.animated : null,
                    prefersReducedMotion,
                    animationsPaused: paused,
                    step: step?.id ?? "All",
                    focusedBoxes: focused.length,
                    zoom: Number(pan.scale.toFixed(2)),
                    pins: viewPins.length,
                  },
                  null,
                  1,
                )}
              </pre>
            ) : null}
            <div className={cn(PANEL, "flex min-w-0 items-center gap-1 p-1")}>
              <Button size="sm" variant="ghost" className="h-7 px-2" aria-pressed={showState} onClick={() => setShowState(!showState)}>
                State
              </Button>
              <span className="truncate px-2 text-[11px] text-muted-foreground">Click a card to comment · drag to pan · ⌘/Ctrl + scroll to zoom · ←/→ steps</span>
            </div>
          </div>
          <div className={cn(PANEL, "ml-auto flex shrink-0 items-center gap-1 p-1")}>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
              <Icon name="Minus" />
            </Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(pan.scale * 100)}%</span>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
              <Icon name="Plus" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={fitAll} aria-label="Fit to view">
              <Icon name="Maximize2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
