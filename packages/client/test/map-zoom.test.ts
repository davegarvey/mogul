import { describe, expect, it } from "vitest";
import { MAX_ZOOM, clampView, panBy, zoomAt, zoomLevel } from "../src/map-zoom.js";

const full = { x: -500, y: -400, width: 1000, height: 800 };

describe("map zoom", () => {
  it("zooms about a point, keeping that point fixed", () => {
    const at = { x: 100, y: 50 };
    const v = zoomAt(full, full, 2, at);
    expect(zoomLevel(v, full)).toBe(2);
    // the point sits at the same fraction of the view before and after
    expect((at.x - v.x) / v.width).toBeCloseTo((at.x - full.x) / full.width);
    expect((at.y - v.y) / v.height).toBeCloseTo((at.y - full.y) / full.height);
  });

  it("never zooms out beyond the full map or in beyond the maximum", () => {
    expect(zoomAt(full, full, 0.5, { x: 0, y: 0 })).toEqual(full);
    const deep = zoomAt(full, full, 100, { x: 0, y: 0 });
    expect(zoomLevel(deep, full)).toBe(MAX_ZOOM);
  });

  it("keeps the aspect ratio of the full map", () => {
    const v = clampView({ x: 0, y: 0, width: 500, height: 123 }, full);
    expect(v.height / v.width).toBeCloseTo(full.height / full.width);
  });

  it("stops panning at the map edges", () => {
    const v = zoomAt(full, full, 2, { x: 0, y: 0 });
    const left = panBy(v, full, -10_000, -10_000);
    expect(left.x).toBe(full.x);
    expect(left.y).toBe(full.y);
    const right = panBy(v, full, 10_000, 10_000);
    expect(right.x + right.width).toBe(full.x + full.width);
    expect(right.y + right.height).toBe(full.y + full.height);
  });

  it("does not pan the full map", () => {
    expect(panBy(full, full, 50, 50)).toEqual(full);
  });
});
