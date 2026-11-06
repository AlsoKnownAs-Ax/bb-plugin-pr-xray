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
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";

// Pre-rendered by pr-lens-prototype.render.mjs: the renderer needs node:crypto.
type Rendered = Pick<RenderedSvg, "svg" | "width" | "height" | "animated" | "atlas">;
const DOCS = renders as unknown as Record<string, { views: View[]; walkthrough: WalkthroughStep[]; renders: Record<string, Rendered> }>;

type Pin = { key: string; kind: "node" | "table"; id: string; text: string };

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
  const [docName, setDocName] = useState(Object.keys(DOCS)[0]!);
  const [themeOverride, setThemeOverride] = useState<"auto" | "light" | "dark">("auto");
  const [forcePause, setForcePause] = useState(false);
  const doc = DOCS[docName]!;
  const views = doc.views;
  const [viewId, setViewId] = useState(views[0]!.id);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [selected, setSelected] = useState<{ kind: "node" | "table"; id: string } | null>(null);
  const theme = themeOverride === "auto" ? codeTheme.mode : themeOverride;
  const steps = doc.walkthrough;
  const step = stepIndex === null ? null : steps[stepIndex] ?? null;
  const view = views.find((candidate) => candidate.id === viewId) ?? views[0]!;

  const found = doc.renders[`${view.id}:${theme}`];
  const rendered = found ? { ok: true as const, ...found } : { ok: false as const, error: `no render for ${view.id}:${theme}` };

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
    const pad = 40;
    const scale = Math.min(maxScale, (rect.width - pad * 2) / box.width, (rect.height - pad * 2) / box.height);
    setPan({ scale, x: rect.width / 2 - (box.x + box.width / 2) * scale, y: rect.height / 2 - (box.y + box.height / 2) * scale });
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
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      setPan((current) => {
        const scale = Math.min(4, Math.max(0.1, current.scale * factor));
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        return { scale, x: px - ((px - current.x) * scale) / current.scale, y: py - ((py - current.y) * scale) / current.scale };
      });
    } else setPan((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 md:p-6">
      <div className="rounded-md border border-warning/60 bg-warning/10 px-3 py-2 text-xs">
        PROTOTYPE for issue #27. Throwaway, not for merge. Fake data from <code>@coldtea/pr-lens-schema/examples</code>.
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className="rounded border border-border bg-background px-2 py-1" value={docName} onChange={(event) => switchDoc(event.target.value)}>
          {Object.keys(DOCS).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <span className="text-muted-foreground">Theme:</span>
        {(["auto", "light", "dark"] as const).map((option) => (
          <Button key={option} size="sm" variant={themeOverride === option ? "secondary" : "ghost"} onClick={() => setThemeOverride(option)}>
            {option}
          </Button>
        ))}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={forcePause} onChange={(event) => setForcePause(event.target.checked)} /> simulate reduced motion
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {views.map((candidate) => (
          <Button key={candidate.id} size="sm" variant={candidate.id === view.id ? "secondary" : "ghost"} onClick={() => setViewId(candidate.id)}>
            {candidate.title}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Click a card to pin · ⌘/Ctrl + scroll to zoom · drag to pan · ←/→ steps</span>
      </div>

      <div className="flex min-h-[480px] flex-1 gap-3">
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-grab select-none overflow-hidden rounded-lg border border-border bg-muted/20 active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          {rendered.ok ? (
            <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`, width: rendered.width, height: rendered.height }}>
              {/* Renderer output is escaped at its boundary (README: Untrusted text). */}
              <div ref={svgHostRef} className="[&>svg]:block" dangerouslySetInnerHTML={{ __html: rendered.svg }} />
              {focusBox ? (
                <svg className="pointer-events-none absolute left-0 top-0" width={rendered.width} height={rendered.height}>
                  <path
                    fillRule="evenodd"
                    className="fill-background/70 transition-opacity"
                    d={`M0 0H${rendered.width}V${rendered.height}H0Z ${focused.map((b) => `M${b.x - 6} ${b.y - 6}h${b.width + 12}v${b.height + 12}h${-(b.width + 12)}Z`).join(" ")}`}
                  />
                  {focused.map((b, i) => (
                    <rect key={i} x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} className="fill-none stroke-primary" strokeWidth={2} />
                  ))}
                </svg>
              ) : null}
              {targets.map(({ kind, id, box }) => (
                <button
                  key={`${kind}:${id}`}
                  type="button"
                  data-target
                  title={`${kind}: ${id}`}
                  onClick={() => setSelected({ kind, id })}
                  className={cn("absolute rounded-md outline-offset-2 hover:outline hover:outline-2 hover:outline-primary/60", selected?.kind === kind && selected.id === id && "outline outline-2 outline-primary")}
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
                    className="pointer-events-none absolute flex size-5 items-center justify-center rounded-full rounded-bl-none bg-primary text-[10px] font-semibold text-primary-foreground shadow"
                    style={{ left: box.x + box.width - 10 - sameTarget * 14, top: box.y - 10 }}
                  >
                    {index + 1}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-sm text-destructive">{rendered.error}</div>
          )}
        </div>

        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto text-sm">
          <section>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">Walkthrough</h2>
              <Button size="sm" variant={stepIndex === null ? "secondary" : "ghost"} onClick={() => goTo(null)}>
                All
              </Button>
            </div>
            {steps.length === 0 ? <p className="text-xs text-muted-foreground">This document has no walkthrough.</p> : null}
            <ol className="space-y-1">
              {steps.map((candidate, index) => (
                <li key={candidate.id}>
                  <button type="button" onClick={() => goTo(index)} className={cn("flex w-full gap-2 rounded-md p-2 text-left hover:bg-state-hover", index === stepIndex && "bg-state-hover")}>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-medium">{candidate.heading}</span>
                      <span className="block text-xs text-muted-foreground">{candidate.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {selected ? (
            <section className="space-y-1">
              <h2 className="font-semibold">Comment on {selected.kind} <code>{selected.id}</code></h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = new FormData(event.currentTarget).get("text")?.toString() ?? "";
                  setPins((current) => [...current, { key: view.id, ...selected, text: text || "(empty)" }]);
                  event.currentTarget.reset();
                }}
              >
                <input name="text" className="w-full rounded border border-border bg-background px-2 py-1 text-xs" placeholder="Design comment" />
              </form>
            </section>
          ) : null}

          <section className="space-y-1 text-xs">
            <h2 className="font-semibold text-sm">State</h2>
            <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
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
          </section>
        </aside>
      </div>
    </div>
  );
}
