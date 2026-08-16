## Why

The exhibition map layout is a mix of generated data and hand-tuned constants: fixed region angles, fixed city offsets, per-edge control points for every cross-region route, and manual orientation overrides. Today the committed layout has 4 inter-region line crossings and 31 label/node overlaps — nobody noticed because the client only logs warnings (`assertLayoutComplete`). Any edit to `map.json` (new city, new edge, different region) silently leaves cities without coordinates, edges without routes, or overlapping labels. The map cannot adapt without manual intervention.

## What Changes

- Replace the hand-tuned layout constants with a **fully procedural layout generator** that derives everything from `map.json`: region arrangement, city positions, local and inter-region edge routes, label anchors, and the canvas size. No per-edge or per-city manual coordinates anywhere.
- **Crossing minimization**: the generator searches over layout configurations (region order on the ring, per-region chain orientation) and verifies the result geometrically. Intra-region (local) edges never cross anything; inter-region crossings are minimized and reported — the only crossings allowed are inter-region.
- **Space guarantees**: city separation is computed from real label extents (names, slot dots, route info, build badges), and a collision-verification pass asserts that no icon or text overlaps anything. If any collision is found, the generator scales the spacing budget and re-runs until the map is clean — it cannot silently produce an illegible map.
- **Self-verifying output**: the generator validates the map data (regions form a chain, every edge resolves, every route stays in the viewBox) and fails loudly with a precise message instead of degrading silently.
- The client renders **purely from committed generated layout data**; no layout math and no hand-tuned geometry remains in the client. Runtime shape stays the same (`CITY_POS`, `EDGE_ROUTES`, `REGION_POLYGON`, `REGION_ANCHOR`, `VIEWBOX`).
- Tests assert the layout invariants (containment, crossings, collisions, completeness) on the committed generated layout, so regressions are caught in CI.

## Capabilities

### New Capabilities
- `map-layout`: procedural, self-verifying layout generation for the exhibition map; the capability replaces the hand-placed layout approach from the `exhibition-map-ui` change (superseded) and defines the generated layout contract the client consumes.

### Modified Capabilities
- `game-client`: the map render now consumes the generated layout contract (coordinates, routes, label anchors) with no client-side layout computation; previously undefined layout-origin behavior becomes a defined data contract.

## Impact

- `tools/generate-map-layout.ts` — rewritten as the procedural generator (search, routing, verification); ELK no longer used
- `tools/generate-region-orders.ts`, `map-order.generated.ts`, `map-order.generated.json` — removed (superseded)
- `packages/client/src/map-layout.ts` — rewritten as a typed accessor over the generated layout JSON
- `packages/client/src/map-layout.generated.json` — regenerated with the new contract (regions, cities, routes, label anchors, viewBox)
- `packages/client/src/main.ts` — `renderMap` consumes the generated layout; edge labels use generated anchors
- `packages/server/public/index.html` — minor CSS adjustments for the new geometry; `client.js` rebuilt
- New tests: `packages/client/test/map-layout.test.ts` (invariants on committed layout)
- `openspec/changes/exhibition-map-ui` — superseded by this change (its layout approach is replaced wholesale)
- No changes to `@mogul/engine` or `@mogul/protocol`
