import { describe, expect, it } from "vitest";
import { clampCodeWidth, defaultCodeWidth, fitView, panelLayout, zoomAt, zoomBy } from "./canvas-view";

const size = (width: number, height: number) => ({ width, height });
const render = size(400, 200);

describe("fitting a diagram", () => {
  it("centres the whole drawing, at most at 120%", () => {
    expect(fitView(size(1000, 600), render, null)).toEqual({ scale: 1.2, x: 260, y: 176 });
  });

  it("zooms to a focused box, at most at 160%", () => {
    expect(fitView(size(1000, 600), render, { x: 100, y: 50, width: 100, height: 50 })).toEqual({ scale: 1.6, x: 260, y: 176 });
  });

  it("keeps clear of a panel on the left when the canvas is wide enough", () => {
    expect(fitView(size(1000, 600), render, null, { left: 344, right: 0 })).toEqual({ scale: 1.2, x: 416, y: 176 });
    // Under a panel's width (320px) would stay free beside it, so it overlaps instead.
    expect(fitView(size(600, 600), render, null, { left: 344, right: 0 })).toEqual({ scale: 1.2, x: 60, y: 176 });
    expect(fitView(size(688, 600), render, null, { left: 344, right: 0 })).toEqual({ scale: 1.2, x: 104, y: 176 });
  });

  it("keeps clear of panels on both sides, or overlaps both when the middle gets too narrow", () => {
    expect(fitView(size(1400, 600), render, null, { left: 344, right: 512 })).toEqual({ scale: 1.2, x: 376, y: 176 });
    expect(fitView(size(1100, 600), render, null, { left: 344, right: 512 })).toEqual({ scale: 1.2, x: 310, y: 176 });
  });

  it("shrinks to fit the narrower side, but no smaller than 10%", () => {
    expect(fitView(size(500, 304), render, null).scale).toBe(1);
    expect(fitView(size(300, 600), render, null)).toEqual({ scale: 0.59, x: 32, y: 237 });
    expect(fitView(size(50, 50), render, null)).toEqual({ scale: 0.1, x: 12.5, y: 38.5 });
  });
});

describe("zooming", () => {
  it("keeps the point under the cursor in place", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 2, 100, 50)).toEqual({ scale: 2, x: -100, y: -50 });
    expect(zoomAt({ x: 10, y: 20, scale: 2 }, 2, 100, 50)).toEqual({ scale: 4, x: -80, y: -10 });
  });

  it("stays between 10% and 400%", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 10, 100, 50)).toEqual({ scale: 4, x: -300, y: -150 });
    expect(zoomBy({ x: 5, y: 6, scale: 0.2 }, 0.1)).toEqual({ x: 5, y: 6, scale: 0.1 });
    expect(zoomBy({ x: 5, y: 6, scale: 1 }, 1.25)).toEqual({ x: 5, y: 6, scale: 1.25 });
  });
});

describe("panels over the canvas", () => {
  it("keeps clear of each open panel on a wide viewport, the Code panel at its chosen width", () => {
    expect(panelLayout(false, true, true, 640)).toEqual({ showExplain: true, reserve: { left: 344, right: 664 } });
    expect(panelLayout(false, false, true, 480)).toEqual({ showExplain: false, reserve: { left: 0, right: 504 } });
    expect(panelLayout(false, true, false, 640)).toEqual({ showExplain: true, reserve: { left: 344, right: 0 } });
  });

  it("shows one panel at a time on a compact viewport, over the drawing", () => {
    expect(panelLayout(true, true, true, 640)).toEqual({ showExplain: false, reserve: { left: 0, right: 0 } });
    expect(panelLayout(true, true, false, 640)).toEqual({ showExplain: true, reserve: { left: 0, right: 0 } });
  });

  it("keeps the Code panel between a readable minimum and a strip of canvas on its left", () => {
    expect(clampCodeWidth(700, 1600)).toBe(700);
    expect(clampCodeWidth(100, 1600)).toBe(360);
    expect(clampCodeWidth(1500, 1600)).toBe(1400);
    // A canvas narrower than both limits gets the minimum.
    expect(clampCodeWidth(500, 400)).toBe(360);
  });

  it("starts the Code panel at about half the canvas", () => {
    expect(defaultCodeWidth(1600)).toBe(720);
    expect(defaultCodeWidth(600)).toBe(360);
  });
});
