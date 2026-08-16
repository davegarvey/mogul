# Procedural Map Layout — Design

## Context

See proposal.md — Why. The previous layout (`packages/client/src/map-layout.ts` + ELK ordering scripts) mixed generated data with hand-tuned constants (region angles, city offsets, per-edge control points, orientation overrides) and was never verified: the committed map had 4 inter-region crossings and 31 label/node overlaps. The client renders a single SVG map from data in `packages/client/src/map-layout.ts`; all styles live in `packages/server/public/index.html`; the engine ships `map.json` (6 regions, 30 cities, 33 edges).

## Goals / Non-Goals

- **Goals**: A generator that derives the whole layout from `map.json` with no hand-placed coordinates; provable crossing guarantees (local edges never cross; inter-region crossings minimized and documented); label-space guarantees (no overlapping UI); self-verification that fails loudly; the client renders data as-is.
- **Non-Goals**: Runtime layout computation in the browser (the layout is generated at build time and committed); pan/zoom; animated transitions; alternative arrangement families beyond the single-ring model (two-ring "coasts outer / heartlands inner" was prototyped and rejected — see D1); interactive map editing.

## Decisions

### D1: Single-ring radial composition (not two rings)

Regions sit on one hexagon ring; each region's cities sit on a local arc facing the map center; cross-region links cross the empty inner disk. Prototyped alternative: two concentric rings (coasts outside, heartlands inside, edges routed through corridors between inner territories). The two-ring model achieved 3 crossings but required corridor-aware routing (dive points between inner territories), produced a ~50% larger canvas (2100px vs 1370px at the time), shrinking label size at a given display width — the opposite of the legibility goal. Rejected in favor of the single ring.

### D2: Region arrangement by exhaustive search

Crossing reduction in circular layouts is NP-hard (Masuda et al. 1987); established tools either put everything on one circle (Graphviz circo — tested empirically: 4 local-local crossings, fails the local-edge guarantee) or are hierarchical-only (ELK layered; ELK's circular algorithm is absent from the JS bundle — verified). With 6 regions the discrete space is tractable: cyclic region order (6! = 720) × per-region chain orientation (2⁶ = 64) = 46,080 configurations, exhaustively evaluated in ~60s at build time. Each configuration is scored by the exact geometric crossing count of the final routing (see D4/D5), with a fast chord-alternation pre-filter used for ranking. The committed layout therefore carries the minimum crossings for this arrangement family — a stronger claim than any heuristic library offers at this scale.

### D3: City placement from label extents

Each region's chain (derived from the intra-region edges, not from array order — the generator validates that each region's intra-region edges form a single path) is laid on a local arc facing the center. The arc radius is solved so the chord distance between consecutive cities clears both name boxes plus the local-edge cost label: gap_i = (nameW_i + nameW_i+1)/2 + PAD + 18. The region territory is a circle of radius arcRadius + margin, and the ring radius is 2·maxTerritory + gap, so territories never overlap. Name widths use a conservative per-character metric (5.6px at the 10.5px Georgia font); the collision verifier (D6) is authoritative and scales the budget if the metric underestimates.

### D4: Radial ports and below-ring chord routing

Each cross-region edge routes as city → port → exit → chord → exit → port → city. The exit points sit on a fixed below-ring radius circle (ringRadius − maxTerritory − 20) at each city's own angle, so (a) the port segment is radial and stays inside the source territory's angular span — it can never cross a local edge or an unrelated territory; (b) the chord between two same-radius exits stays inside the disk of that radius, which the territories never enter — it can never traverse an unrelated region; (c) the crossing count is exactly the chord-alternation count on exit angles, so the fast pre-filter is exact and the search result is provable.

Alternatives evaluated and rejected by measurement: target-facing boundary exits (good crossing structure, but port segments cross local edges' bow bands — measured 4 local-cross); exits clamped to region "doorways" (exit-order collapse — measured 36 crossings); gateway cities pulled inward (broke the local-edge structure); polar curves with a center dip (adds mirror-symmetric crossings — measured 9 vs 5 for chords).

### D5: Draw exactly what is verified

The client renders the same geometry the generator verifies: routes are 4-point polylines (city, exit, exit, city) drawn with the client's port inset (10px) and quadratic smoothing, and the generator's crossing/clip verification samples that exact transform (the client's `svgPath` logic replicated in the generator). Local edges are 3-point quadratic bows; the label anchor for every edge is computed by a label-placement pass (candidates nudged outward/along the route until collision-free) and committed in the layout data — the client no longer derives label positions itself.

### D6: Self-verification and auto-fit

The generator verifies every candidate it considers: exact polyline crossings (local-local must be 0, local-cross must be 0, inter-region reported), territory clips (no cross-edge route through an unrelated territory, 6px margin), and UI collisions using boxes that mirror the client's rendering exactly (node, ring, name, slot dots, info microtext, badge, region labels, edge labels; same-city boxes excluded as a designed composite). If the winning configuration still has collisions, the generator raises the spacing budget (PAD) and re-runs the whole search (bounded iterations), then fails loudly with the full report if it cannot produce a clean layout. The committed layout is re-verified in CI (packages/client/test/map-layout.test.ts), so a stale generated file or a generator regression breaks the build, not the render.

### D7: Region names follow the arrangement

The crossing-minimal arrangement puts `coast-north` at the top but the other regions' compass names would misdescribe their positions. Rather than relax the crossing objective (the requirement is minimize crossings), the four conflicting region display names were renamed to thematic qualifiers (coast-south → "Emerald Coast", coast-west → "Sunset Coast", heartland-east → "Veridian Heartland", heartland-west → "Silverado Heartland"); ids stay stable and the layout never reads names. A soft tie-break prefers coastal regions (the 2-player regions) contiguous on the ring, so early games play on one unbroken shore.

## Results (committed layout)

- 5 inter-region crossings — the exhaustive-search minimum for this arrangement family; the crossing pairs are reported in the layout data (all involve `cn5:hw4` or the diagonal coast↔heartland pairs)
- 0 local-local crossings, 0 local-cross crossings (structural + verified)
- 0 territory clips (structural: chords stay inside the empty inner disk)
- 0 UI collisions (verified with rendered metrics)
- viewBox 1620×1620, no auto-fit scaling required
- Deterministic: identical output on every run

## Risks / Trade-offs

- **5 crossings is a hard floor for this arrangement family** → the count and the exact pairs are committed in the layout data and CI-verified, so any future map change is judged against a documented baseline; the requirement allows inter-region crossings and demands minimization, which the exhaustive search provides.
- **The generator runs a 46k-configuration search (~60s)** → build-time only; the committed JSON keeps the client dependency-free and deterministic. `npm run build:client` does not regenerate the layout — `npm run generate:map-layout` is the explicit step after a map change, and `assertLayoutComplete` throws with the regeneration command if the committed layout is stale.
- **Name-width metric is an estimate** → the collision verifier is authoritative; if it ever flags overlaps, the auto-fit raises the spacing budget and regenerates. Tests fail rather than ship an overlapping map.
- **Chord routing is straighter than the old hand-drawn arcs** → the drawn geometry is exactly the verified geometry (D5), so readability is a fact, not an aspiration; the dashed inter-region styling keeps the two classes of link visually distinct.

## Migration Plan

1. Run `npm run generate:map-layout` (regenerates `packages/client/src/map-layout.generated.json`), `npm run build:client` (rebuilds the bundle), and `npm test` (CI re-verifies the committed layout).
2. `packages/client/src/map-layout.ts` becomes a typed accessor over the generated JSON; `renderMap` in `main.ts` consumes the same export shapes (`CITY_POS`, `EDGE_ROUTES`, `REGION_POLYGON`, `REGION_ANCHOR`, `VIEWBOX`), plus `EDGE_LABELS` for label anchors; the build badge moves to centered-above the node.
3. Removed: the ELK ordering scripts and their generated output (`map-order.generated.*`), the old layout JSON format, and the `generate:map-order` script (replaced by `generate:map-layout`). `elkjs` stays as a dev dependency only if other tooling needs it — no runtime or build dependency on it remains.
4. Rollback: revert the client sources, the generated JSON, and `map.json` names; `client.js` rebuild restores the previous map.

## Open Questions

None — remaining unknowns (exact label metrics, palette, font sizes) are tuning knobs the verification loop absorbs automatically.
