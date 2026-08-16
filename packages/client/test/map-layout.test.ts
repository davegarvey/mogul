import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@mogul/engine";
import layout from "../src/map-layout.generated.json" with { type: "json" };

const R = DEFAULT_RULES;

describe("generated map layout", () => {
  it("resolves every city and every edge", () => {
    for (const city of R.map.cities) {
      expect(layout.cities[city.id], `city ${city.id}`).toBeDefined();
      expect(layout.cities[city.id].region).toBe(city.region);
    }
    for (const edge of R.map.edges) {
      const key = `${edge.from}:${edge.to}`;
      expect(layout.edges[key], `edge ${key}`).toBeDefined();
      expect(layout.edges[key].points.length).toBeGreaterThanOrEqual(2);
    }
    for (const region of R.map.regions) {
      expect(layout.regions[region.id], `region ${region.id}`).toBeDefined();
      expect(layout.regions[region.id].polygon.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("places every city inside its own territory", () => {
    for (const city of R.map.cities) {
      const pos = layout.cities[city.id];
      const geom = layout.regions[city.region];
      const d = Math.hypot(pos.x - geom.center.x, pos.y - geom.center.y);
      expect(d, `city ${city.id} outside territory`).toBeLessThanOrEqual(geom.radius);
    }
  });

  it("keeps every city and label inside the viewBox", () => {
    const vb = layout.viewBox;
    const inside = (p: { x: number; y: number }, margin: number) =>
      p.x >= vb.x + margin && p.x <= vb.x + vb.width - margin && p.y >= vb.y + margin && p.y <= vb.y + vb.height - margin;
    for (const city of R.map.cities) {
      expect(inside(layout.cities[city.id], 0), `city ${city.id}`).toBe(true);
    }
    for (const region of R.map.regions) {
      expect(inside(layout.regions[region.id].label, 0), `region label ${region.id}`).toBe(true);
    }
  });

  it("never lets a local edge cross anything", () => {
    expect(layout.stats.crossings.localLocal).toBe(0);
    expect(layout.stats.crossings.localCross).toBe(0);
  });

  it("never routes a cross-region edge through an unrelated territory", () => {
    expect(layout.stats.clips).toEqual([]);
  });

  it("places no UI element over another (names, labels, badges)", () => {
    expect(layout.stats.collisions).toEqual([]);
  });

  it("reports the crossing minimum honestly", () => {
    // every crossing must be inter-region, and the set must be documented
    expect(layout.stats.crossings.total).toBe(layout.stats.crossings.crossCross);
    expect(layout.stats.crossings.pairs.length).toBe(layout.stats.crossings.crossCross);
  });
});
