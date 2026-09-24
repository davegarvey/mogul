import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@mogul/engine";
import layout from "../src/map-layout.generated.json" with { type: "json" };
import { pointInPolygon, polygonDistance } from "../../../tools/geometry.js";

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

  it("places every city inside its own territory polygon", () => {
    for (const city of R.map.cities) {
      const pos = layout.cities[city.id];
      const poly = layout.regions[city.region as keyof typeof layout.regions].polygon;
      expect(pointInPolygon(pos, poly), `city ${city.id} outside territory`).toBe(true);
    }
  });

  it("keeps territories apart", () => {
    const ids = Object.keys(layout.regions) as (keyof typeof layout.regions)[];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(polygonDistance(layout.regions[ids[i]].polygon, layout.regions[ids[j]].polygon), `${ids[i]} x ${ids[j]}`).toBeGreaterThan(0);
      }
    }
  });

  it("never routes a cross-region edge through an unrelated territory polygon", () => {
    for (const edge of R.map.edges) {
      const from = R.map.cities.find((c) => c.id === edge.from)!.region;
      const to = R.map.cities.find((c) => c.id === edge.to)!.region;
      if (from === to) continue;
      const pts = layout.edges[`${edge.from}:${edge.to}` as keyof typeof layout.edges].points;
      for (const region of R.map.regions) {
        if (region.id === from || region.id === to) continue;
        const poly = layout.regions[region.id as keyof typeof layout.regions].polygon;
        // allow grazing within the generator's 6px tolerance by testing a shrunk copy
        const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
        const shrunk = poly.map((p) => {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const len = Math.hypot(dx, dy) || 1;
          return { x: p.x - (dx / len) * 6, y: p.y - (dy / len) * 6 };
        });
        for (const p of pts) expect(pointInPolygon(p, shrunk), `${edge.from}:${edge.to} through ${region.id}`).toBe(false);
      }
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
