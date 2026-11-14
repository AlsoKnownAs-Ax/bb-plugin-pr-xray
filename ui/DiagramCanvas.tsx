// Pan/zoom canvas for one diagram: the PR Lens SVG the server rendered, shown
// inline. The renderer escapes model text and emits no script, so inline is safe.
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { Icon } from "@/components/ui/icon";
import type { Box } from "@coldtea/pr-lens-renderer";
import type { DiagramRender } from "../shared/schema";
import { fitView, zoomAt, zoomBy, type Reserve } from "./canvas-view";
import { unionBox } from "./walkthrough";

export function DiagramCanvas({
  render,
  overlay,
  onBackgroundClick,
  focus = [],
  reserve,
}: {
  render: DiagramRender;
  /** Drawn over the SVG in its viewBox units; gets the zoom. */
  overlay?: (scale: number) => ReactNode;
  onBackgroundClick?: () => void;
  /** The boxes to zoom to and leave undimmed, in the render's viewBox units. */
  focus?: Box[];
  /** Panels floating over the edges, kept clear when fitting. Changing it alone doesn't refit, so toggling a panel never moves the drawing. */
  reserve?: Reserve;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Set once the reader pans or zooms, so a resize never moves a view they chose.
  const moved = useRef(false);

  const fit = () => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) {
      return;
    }

    moved.current = false;
    setView(fitView(box, render, unionBox(focus), reserve));
  };
  const focusKey = JSON.stringify(focus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [render.width, render.height, focusKey]);

  // Fit again when the canvas resizes (focus mode, the window), unless the reader has moved the view.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!moved.current) {
        fitRef.current();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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

  // The wheel zooms about the cursor. A native listener, because React's is passive and can't stop the page scrolling.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = container.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * wheelZoomRate(event));
      moved.current = true;
      setView((current) => zoomAt(current, factor, event.clientX - box.left, event.clientY - box.top));
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    if (Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) > 3) {
      state.moved = true;
      moved.current = true;
    }
    setView((current) => ({ ...current, x: state.vx + event.clientX - state.x, y: state.vy + event.clientY - state.y }));
  };
  const onPointerUp = () => {
    if (drag.current && !drag.current.moved) onBackgroundClick?.();
    drag.current = null;
  };

  const zoom = (factor: number) => {
    moved.current = true;
    setView((current) => zoomBy(current, factor));
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ backgroundColor: render.background }}
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
        {/* PR Lens rides a card's 16px badges 8px above it, right-aligned 7px in; this shrinks them to 14px and moves them 4px inside its top-right corner, so a focus veil at the card's box doesn't cut them. */}
        <div
          ref={svgHostRef}
          className="[&>svg]:block [&_.bdg]:[transform-box:fill-box] [&_.bdg]:[transform-origin:top_right] [&_.bdg]:[transform:translate(3px,12px)_scale(0.875)]" dangerouslySetInnerHTML={{ __html: render.svg }} />
        {focus.length > 0 ? <FocusVeil focus={focus} width={render.width} height={render.height} background={render.background} /> : null}
        {overlay?.(view.scale)}
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-xs">
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

/** Zoom per wheel delta: a pinch (ctrl) sends small deltas, a mouse notch about 100px, or 3 lines in Firefox's line mode. */
function wheelZoomRate(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return 0.06;
  }

  if (event.ctrlKey) {
    return 0.01;
  }

  return 0.002;
}

/** Dims everything but the focus: a veil in the canvas colour with a hole at each focused box, as PR Lens does: no rim. */
function FocusVeil({ focus, width, height, background }: { focus: Box[]; width: number; height: number; background: string }) {
  // A mask, not an even-odd path: overlapping holes (a lane and its nodes) must stay clear, not dim again.
  const maskId = useId();
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden>
      <mask id={maskId} maskUnits="userSpaceOnUse" x={-8000} y={-8000} width={width + 16000} height={height + 16000}>
        <rect x={-8000} y={-8000} width={width + 16000} height={height + 16000} fill="white" />
        {focus.map((hole, index) => (
          <rect key={index} {...hole} fill="black" />
        ))}
      </mask>
      <rect x={-8000} y={-8000} width={width + 16000} height={height + 16000} fill={background} fillOpacity={0.75} mask={`url(#${maskId})`} />
    </svg>
  );
}
