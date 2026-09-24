## Why

The generated exhibition map uses about a quarter of its canvas. Each region's territory is the full circle through its city arc (arc radius + 40px), but the cities sit on the edge of that circle nearest the map centre, so the outer half of every circle is empty. The regions are spaced by the largest circle (ring radius = 2 × largest territory + gap), and the viewBox is a square sized to enclose the circles. The result is a canvas of 1,620 × 1,620 for cities that span about 805 × 765, and each territory is about 460px across for five cities that spread over about 300 × 70 or 160 × 250. The client scales the map to the column width, so the empty space makes cities, labels and costs small, and it makes the game view longer than the screen.

## What Changes

- Each region's territory becomes a tight outline around its cities and their rendered UI (node, name, slot dots, route info, build badge) plus a fixed margin, replacing the full circle.
- Regions are packed around the ring by the real extent of their outlines, not by the largest circle. The empty centre used by cross-region routes shrinks to the space those routes and their cost labels need.
- The viewBox fits the drawn content (territories, region labels, city UI, routes and edge labels) plus a fixed margin, and no longer needs to be square.
- The territory-clip check and the "city inside its territory" test switch from centre and radius to the emitted polygon.
- The generated layout's region geometry becomes polygon + label anchor (+ centroid). The `radius` field is removed, and the layout `version` rises to 2. The client already draws regions from the polygon, so only its type changes.
- Target: the viewBox area is at most 45% of today's (about 1,090 square or smaller), with the same guarantees: no local-edge crossings, no clips, no UI collisions, and no more inter-region crossings than the current 5.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-layout`: territories and canvas become content-fitted; verification checks the emitted polygons.

## Impact

- `tools/generate-map-layout.ts`: territory shape, ring packing, cross-route exit radius, clip check, label anchors, viewBox and emitted region geometry.
- `packages/client/src/map-layout.generated.json`: regenerated.
- `packages/client/src/map-layout.ts`: the region type drops `radius`.
- `packages/client/test/map-layout.test.ts`: the territory-containment test uses point-in-polygon.
- No changes to engine, protocol, server or game rules. The map data (`map.json`) is unchanged.
