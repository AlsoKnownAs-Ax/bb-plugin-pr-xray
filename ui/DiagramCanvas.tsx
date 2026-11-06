// Pan/zoom canvas for one diagram: the PR Lens SVG the server rendered, shown
// inline. The renderer escapes model text and emits no script, so inline is safe.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { Icon } from "@/components/ui/icon";
import type { Box } from "@coldtea/pr-lens-renderer";
import type { DiagramRender } from "../shared/schema";
import { unionBox, veilHoles } from "./walkthrough";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
/** Room fitting leaves around the drawing. */
const INSET = { side: 32, top: 48, bottom: 56 };

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

  const zoomTo = unionBox(focus);
  const fit = () => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const target = zoomTo ?? { x: 0, y: 0, width: render.width, height: render.height };
    // A narrow canvas has no room beside the panel, so the panel just overlaps it.
    const right = reserveRight && box.width > reserveRight * 2 ? reserveRight : INSET.side;
    const width = Math.max(1, box.width - INSET.side - right);
    const height = Math.max(1, box.height - INSET.top - INSET.bottom);
    const scale = Math.min(zoomTo ? 1.6 : 1.2, Math.max(MIN_SCALE, Math.min(width / target.width, height / target.height)));
    setView({
      scale,
      x: INSET.side + (width - target.width * scale) / 2 - target.x * scale,
      y: INSET.top + (height - target.height * scale) / 2 - target.y * scale,
    });
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

/** Dims everything but the focus: a veil in the canvas colour with a hole round each focused box. */
function FocusVeil({ focus, width, height, background }: { focus: Box[]; width: number; height: number; background: string }) {
  const holes = veilHoles(focus);
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={height} aria-hidden>
      <path
        fillRule="evenodd"
        fill={background}
        fillOpacity={0.75}
        d={`M-8000 -8000H${width + 8000}V${height + 8000}H-8000Z ${holes.map((hole) => `M${hole.x} ${hole.y}h${hole.width}v${hole.height}h${-hole.width}Z`).join(" ")}`}
      />
      {holes.map((hole, index) => (
        <rect key={index} {...hole} rx={10} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
