/**
 * Typed accessors over the generated map layout (map-layout.generated.json).
 *
 * The layout itself is produced entirely by tools/generate-map-layout.ts from the
 * engine map data; nothing here is hand-placed. If the map data changes, regenerate:
 *   npx tsx tools/generate-map-layout.ts
 */
import type { GameRules } from "@mogul/engine";
import generated from "./map-layout.generated.json" with { type: "json" };

export interface Point { x: number; y: number }

interface GeneratedLayout {
  version: number;
  viewBox: { x: number; y: number; width: number; height: number };
  scale: number;
  regions: Record<string, { center: Point; radius: number; polygon: Point[]; label: Point }>;
  cities: Record<string, { x: number; y: number; region: string }>;
  edges: Record<string, { kind: "local" | "cross"; points: Point[]; label: Point }>;
  stats: {
    crossings: { total: number; localLocal: number; localCross: number; crossCross: number; pairs: string[] };
    clips: string[];
    collisions: string[];
    regionOrder: string[];
  };
}

const layout = generated as GeneratedLayout;

export const CITY_POS: Record<string, Point> = Object.fromEntries(
  Object.entries(layout.cities).map(([id, c]) => [id, { x: c.x, y: c.y }]),
);

export const EDGE_ROUTES: Record<string, Point[]> = Object.fromEntries(
  Object.entries(layout.edges).map(([key, e]) => [key, e.points]),
);

export const EDGE_LABELS: Record<string, Point> = Object.fromEntries(
  Object.entries(layout.edges).map(([key, e]) => [key, e.label]),
);

export const REGION_POLYGON: Record<string, Point[]> = Object.fromEntries(
  Object.entries(layout.regions).map(([id, r]) => [id, r.polygon]),
);

export const REGION_ANCHOR: Record<string, Point> = Object.fromEntries(
  Object.entries(layout.regions).map(([id, r]) => [id, r.label]),
);

export const VIEWBOX = layout.viewBox;

/**
 * Runtime guard: every city and edge of the rules must resolve in the generated
 * layout. The generator guarantees this at build time; this catches mismatched
 * builds (stale generated file) at render time.
 */
export function assertLayoutComplete(rules: GameRules): void {
  const missingCities = rules.map.cities.filter((city) => !CITY_POS[city.id]).map((city) => city.id);
  if (missingCities.length > 0) {
    throw new Error(
      `map-layout: no coordinates for cities [${missingCities.join(", ")}]. ` +
        `Run \`npx tsx tools/generate-map-layout.ts\` to regenerate.`,
    );
  }
  for (const edge of rules.map.edges) {
    const key = `${edge.from}:${edge.to}`;
    if (!EDGE_ROUTES[key]) {
      throw new Error(
        `map-layout: no route for edge ${key}. Run \`npx tsx tools/generate-map-layout.ts\` to regenerate.`,
      );
    }
  }
}
