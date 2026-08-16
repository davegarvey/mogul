# Exhibition Map UI — Design

## Context

See proposal.md for motivation. The client is a single-file vanilla TypeScript app (`packages/client/src/main.ts`) bundled by esbuild into `packages/server/public/client.js`; all styles are inline in `packages/server/public/index.html`. The client already imports `@mogul/engine`, which exports everything needed to compute map data client-side (`buildCost`, `pathCosts`, `slotCost`, `slotsForEra`, `activeCities`, `propertyDef`, `DEFAULT_RULES`). The snapshot ships the full `GameState`, including `turnOrder` and per-city ownership, so no engine or protocol changes are required.

## Goals / Non-Goals

- **Goals**: An SVG map that paints all map data at rest; phase-gated affordances; turn-order strip; two-column layout with a compact rail; static legend.
- **Non-Goals**: New engine or protocol surfaces; animated transitions; map pan/zoom; mobile-specific layouts beyond scaling via the SVG `viewBox`.

## Decisions

### D1: Stable radial map geometry
Cities and region territories use fixed coordinates arranged around an open central space. Each region's cities sit on a local arc; cities with cross-region links are placed on the center-facing side of that arc, while local-only cities sit farther out. The client does not run a force simulation, so the map never moves when player count or game state changes.
- *Alternative considered*: global force layout — rejected because force layouts do not guarantee readable edge routing and produced a hairball for this graph.
- *Alternative considered*: add coordinates to `packages/engine/src/data/map.json` — rejected: presentation layout is not game rules.

### D2: Inter-region arcs
The nine cross-region edges remain visible on the map as fixed quadratic arcs through the open center or around the outside of the regional ring. Each route has its own control point and endpoint ports, preserving graph continuity without allowing a link to pass through an unrelated region.
- *Alternative considered*: bridge ledger — rejected because it made the board feel like disconnected panels rather than a map.

### D3: Single source of map truth — a `renderMap` function
One function owns the full map render: edge layer, region layer, city nodes, badges, and interaction wiring. State is re-derived from the snapshot on every render (no incremental mutation); the snapshot version number (already used for the log) gates re-render. City state is derived through engine helpers, e.g. reachability and route cost via `pathCosts` + `slotCost` for the current player, era locks via `slotsForEra`.
- *Trade-off*: full re-render per snapshot is heavier than DOM diffing; acceptable at this scene size (≤30 nodes) and simplifies correctness.

### D4: Perspective is always the current player's
Cost badges show the current player's route + slot numbers in every phase; build affordances appear only during the current player's exhibition turn. The turn pill and turn-order strip carry the "whose turn" information. Chosen over showing the active player's perspective, which would churn numbers every turn and mislead the viewer about their own options.

### D5: Click-to-build on the map only, during exhibition only
City clicks submit `{ type: "build", cityId }` (the same typed command the action bar sends) when and only when the snapshot's actions include that build. The client keys off `snapshot.actions` (already authoritative for legality) rather than re-validating costs. All other actions remain in the phase-contextual action bar, which renders exactly the current phase's actions with a single end-turn CTA.
- *Rationale*: the action list is the server-computed source of legality; client-side cost math is for display only.

### D6: Rail compaction
Player cards become compact rows (name, cash, theater count, lit income, property chips); market and talent sections become row lists; the log shows a bounded tail. The rail is `overflow: auto` only as a fallback for very short viewports; the target is no-scroll at ≥1080p. The action bar stays sticky at the bottom.

### D7: Legend as a static card
Slot tiers (10/15/20), era unlocks (1/2/3), player colors, and node states live in a legend card in the rail. Chosen over per-node explanatory text to avoid repeating global rules at 30 nodes.

### D8: Cross-region lanes are explicit map infrastructure
The previous force layout and generic obstacle router are superseded. Cross-region links use named, fixed corridor routes with enough separation to keep their labels and paths distinct. They are visually differentiated from local roads but remain continuous city-to-city links.

### D9: Routed links use node ports and softened corners
Each route terminates at an offset port on the node perimeter rather than the node center. Cross-region routes use rounded quadratic arcs along their dedicated lanes, while local roads use shallower arcs that follow their regional track. This prevents multiple links sharing the same visual departure point and makes lane ownership apparent.

### D10: Local links follow the regional arc
Local chain edges use shallow outward quadratic arcs rather than direct chords. This keeps each region's five-city chain legible when gateway cities are pulled inward for cross-region connectivity.

### D11: ELK is an offline ordering assistant
`elkjs` runs only in the layout-generation script. Its partitioned crossing-minimization pass compares each region's canonical and reversed city-chain orientation; map-specific gateway constraints may override that score where the fictional geography requires a named city to face an inter-region route. The generated boolean is committed as client data. The client does not load ELK or run an asynchronous layout at runtime.
- *Rationale*: ELK provides a tested crossing-minimization engine without adding a large runtime dependency or allowing the board to move during play.
- *Trade-off*: the game-specific circular composition and arc routing remain explicit because a generic compound radial layout did not preserve the desired map shape.

### D12: Gateway positions follow target regions
Cross-connected cities are placed from the vector toward the region or regions they connect to, rather than receiving a generic inward offset. This makes a city such as Northgate move toward its West Heartland connection while local-only cities remain on the outer arc.

Map-specific orientation overrides remain allowed when the fictional geography produces a clearer named-city order than the generic crossing score.

## Risks / Trade-offs

- **30 badges of route data could read as noise** → badges render only where a route exists (reachable cities), use microtext (`4+15`), and never compete with the build badge, which is the only emphasized element.
- **SVG clutter at small viewports** → labels scale with the `viewBox`; the layout is tuned for a laptop-width left column; below ~1024px the rail wraps below the map rather than beside it.
- **Hand-placed layout drifts from future map edits** → a render-time assertion logs missing coordinates; the layout file is the single place to update.
- **Click-target confusion (node vs. badge)** → the entire city node group (node + name + dots) is the click target; non-buildable states show no pointer cursor and no hover effect.

## Migration Plan

Single-package client change; no data migration. Ship by replacing `renderBoard` with `renderMap`, adding the rail/layout CSS, then running `npm run build:client` to regenerate `packages/server/public/client.js` (already part of `npm run dev`). Rollback is a revert of the client source + bundle.

## Open Questions

None — the deferrable unknowns (exact coordinates, palette, label font sizes) are tuning, not architecture, and don't affect the specs, the approach, or the task breakdown.
