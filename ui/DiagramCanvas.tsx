// Pan/zoom canvas for one diagram: the PR Lens SVG the server rendered, shown
// inline. The renderer escapes model text and emits no script, so inline is safe.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { Icon } from "@/components/ui/icon";
import type { DiagramRender } from "../shared/schema";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

export function DiagramCanvas({
  render,
  overlay,
  onBackgroundClick,
}: {
  render: DiagramRender;
  /** Drawn over the SVG in its viewBox units; gets the zoom so pins can keep their screen size. */
  overlay?: (scale: number) => ReactNode;
  onBackgroundClick?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const fit = () => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const scale = Math.min(1.2, Math.max(MIN_SCALE, Math.min(box.width / render.width, box.height / render.height) * 0.95));
    setView({ scale, x: (box.width - render.width * scale) / 2, y: (box.height - render.height * scale) / 2 });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [render.width, render.height]);

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
      setView((current) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        return { scale, x: px - ((px - current.x) * scale) / current.scale, y: py - ((py - current.y) * scale) / current.scale };
      });
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

  const zoom = (factor: number) => setView((current) => ({ ...current, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)) }));

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
