import { describe, expect, it } from "vitest";
import { centroid, convexHull, offsetConvex, pointInPolygon, pointPolygonDistance, polygonArea, polygonDistance } from "../geometry.js";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("geometry", () => {
  it("builds the convex hull and drops interior points", () => {
    const hull = convexHull([...square, { x: 5, y: 5 }, { x: 2, y: 8 }]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(100);
  });

  it("offsets a convex polygon outwards with rounded corners", () => {
    const off = offsetConvex(convexHull(square), 2, 4);
    // every original vertex is exactly `margin` from the offset boundary
    for (const v of square) expect(pointPolygonDistance(v, off)).toBe(0);
    expect(pointInPolygon({ x: -1.9, y: 5 }, off)).toBe(true);
    expect(pointInPolygon({ x: -2.1, y: 5 }, off)).toBe(false);
    // rounded corner: the corner diagonal at distance 2 is on the boundary, not beyond it
    expect(pointInPolygon({ x: -1.6, y: -1.6 }, off)).toBe(false);
    // area ≈ square + perimeter·m + π·m²
    expect(polygonArea(off)).toBeGreaterThan(100 + 40 * 2);
    expect(polygonArea(off)).toBeLessThan(100 + 40 * 2 + Math.PI * 4);
  });

  it("measures polygon distance, zero on overlap", () => {
    const shifted = square.map((p) => ({ x: p.x + 15, y: p.y }));
    expect(polygonDistance(square, shifted)).toBeCloseTo(5);
    const overlapping = square.map((p) => ({ x: p.x + 5, y: p.y + 5 }));
    expect(polygonDistance(square, overlapping)).toBe(0);
    const inner = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 6 },
    ];
    expect(polygonDistance(square, inner)).toBe(0);
  });

  it("finds the centroid", () => {
    expect(centroid(square)).toEqual({ x: 5, y: 5 });
  });
});
