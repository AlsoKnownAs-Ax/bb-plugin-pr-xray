// Pan/zoom canvas for one diagram: the PR Lens SVG the server rendered, shown
// inline. The renderer escapes model text and emits no script, so inline is safe.
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { Icon } from "@/components/ui/icon";
import type { Box } from "@coldtea/pr-lens-renderer";
import type { DiagramRender } from "../shared/schema";
import { fitView, zoomAt, zoomBy } from "./canvas-view";
import { unionBox, veilHoles } from "./walkthrough";

export function DiagramCanvas({
  render,
  overlay,
  onBackgroundClick,
  focus = [],
  reserveRight = 0,
}: {
  render: DiagramRender;
  /** Drawn over the SVG in its viewBox units; gets the zoom so pins can keep their screen size. */
  overlay?: (scale: number) => ReactNode;
  onBackgroundClick?: () => void;
  /** The boxes to zoom to and leave undimmed, in the render's viewBox units. */
  focus?: Box[];
  /** Width of a panel floating over the right edge, kept clear when fitting. */
  reserveRight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const fit = () => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) {
      return;
    }

    setView(fitView(box, render, unionBox(focus), reserveRight));
  };
  const focusKey = JSON.stringify(focus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [render.width, render.height, focusKey, reserveRight]);

  // Re-run on every SVG swap: a new SVG starts its animations again.
  useEffect(() => {
    const svg = svgHostRef.current?.querySelector("svg");
    if (!svg) return;
    if (prefersReducedMotion) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [render.svg, prefersReducedMotion]);

  // Panning must not start a native text selection, which can spill into the page around the canvas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blockSelection = (event: Event) => event.preventDefault();
    container.addEventListener("selectstart", blockSelection);
    return () => container.removeEventListener("selectstart", blockSelection);
  }, []);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      setView((current) => zoomAt(current, factor, event.clientX - box.left, event.clientY - box.top));
    } else {
      setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    if (Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) > 3) state.moved = true;
    setView((current) => ({ ...current, x: state.vx + event.clientX - state.x, y: state.vy + event.clientY - state.y }));
  };
  const onPointerUp = () => {
    if (drag.current && !drag.current.moved) onBackgroundClick?.();
    drag.current = null;
  };

  const zoom = (factor: number) => setView((current) => zoomBy(current, factor));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ backgroundColor: render.background }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, width: render.width, height: render.height }}
      >
        <div ref={svgHostRef} className="[&>svg]:block" dangerouslySetInnerHTML={{ __html: render.svg }} />
        {focus.length > 0 ? <FocusVeil focus={focus} width={render.width} height={render.height} background={render.background} /> : null}
        {overlay?.(view.scale)}
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-xs">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
          <Icon name="Minus" />
        </Button>
        <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(view.scale * 100)}%</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => zoom(1.2)} aria-label="Zoom in">
          <Icon name="Plus" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={fit} aria-label="Fit to view">
          <Icon name="Maximize2" />
        </Button>
      </div>
    </div>
  );
}

/** Dims everything but the focus: a veil in the canvas colour with a hole round each focused box. No rim: a selected part already gets an outline, and two rings read as double. */
function FocusVeil({ focus, width, height, background }: { focus: Box[]; width: number; height: number; background: string }) {
  const holes = veilHoles(focus);
  // A mask, not an even-odd path: overlapping holes (a lane and its nodes) must stay clear, not dim again.
  const maskId = useId();
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden>
      <mask id={maskId} maskUnits="userSpaceOnUse" x={-8000} y={-8000} width={width + 16000} height={height + 16000}>
        <rect x={-8000} y={-8000} width={width + 16000} height={height + 16000} fill="white" />
        {holes.map((hole, index) => (
          <rect key={index} {...hole} fill="black" />
        ))}
      </mask>
      <rect x={-8000} y={-8000} width={width + 16000} height={height + 16000} fill={background} fillOpacity={0.75} mask={`url(#${maskId})`} />
    </svg>
  );
}
