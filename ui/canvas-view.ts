// Where the diagram canvas shows its drawing: fitting it (or a focused box)
// into the canvas, and zooming. Positions are in screen pixels.
import type { Box } from "@coldtea/pr-lens-renderer";

export type CanvasView = { x: number; y: number; scale: number };
type Size = { width: number; height: number };

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
/** Fitting never enlarges past this: the whole drawing, or a focused box. */
const MAX_FIT_SCALE = { whole: 1.2, focus: 1.6 };
/** Room fitting leaves around the drawing. */
const INSET = { side: 32, top: 48, bottom: 56 };
/** Panels only push the drawing aside while at least a panel's width (w-80) stays free between them. */
const MIN_FREE_WIDTH = 320;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Widths of the panels floating over the canvas's left and right edges. */
export type Reserve = { left: number; right: number };
const NONE: Reserve = { left: 0, right: 0 };

/** The view that centres `focus` (or the whole render) in the canvas, keeping clear of the panels in `reserve`. */
export function fitView(canvas: Size, render: Size, focus: Box | null, reserve: Reserve = NONE): CanvasView {
  const target = focus ?? { x: 0, y: 0, width: render.width, height: render.height };
  const { left, right } = insets(canvas.width, reserve);
  const width = Math.max(1, canvas.width - left - right);
  const height = Math.max(1, canvas.height - INSET.top - INSET.bottom);
  const fits = Math.min(width / target.width, height / target.height);
  const scale = Math.min(maxFitScale(focus), Math.max(MIN_SCALE, fits));
  return {
    scale,
    x: left + (width - target.width * scale) / 2 - target.x * scale,
    y: INSET.top + (height - target.height * scale) / 2 - target.y * scale,
  };
}

/** A canvas too narrow for the panels and a panel's width between them has the panels overlap the drawing. */
function insets(canvasWidth: number, reserve: Reserve): Reserve {
  const left = Math.max(INSET.side, reserve.left);
  const right = Math.max(INSET.side, reserve.right);
  if (canvasWidth - left - right < MIN_FREE_WIDTH) {
    return { left: INSET.side, right: INSET.side };
  }

  return { left, right };
}

function maxFitScale(focus: Box | null): number {
  if (!focus) {
    return MAX_FIT_SCALE.whole;
  }

  return MAX_FIT_SCALE.focus;
}

/** Zooms by `factor` about the canvas point (px, py), which stays put. */
export function zoomAt(view: CanvasView, factor: number, px: number, py: number): CanvasView {
  const scale = clampScale(view.scale * factor);
  return { scale, x: px - ((px - view.x) * scale) / view.scale, y: py - ((py - view.y) * scale) / view.scale };
}

/** Zooms by `factor` about the view's origin, as the zoom buttons do. */
export function zoomBy(view: CanvasView, factor: number): CanvasView {
  return { ...view, scale: clampScale(view.scale * factor) };
}
