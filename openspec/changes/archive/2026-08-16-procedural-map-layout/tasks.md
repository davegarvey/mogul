## 1. Layout generator

- [x] 1.1 Rewrite `tools/generate-map-layout.ts` as the procedural generator: derive chains from intra-region edges, compute city arcs from label extents, place regions on the ring, route cross edges (radial ports, below-ring exits, chords), route local edges (outward bows)
- [x] 1.2 Exhaustive search over region cyclic order × chain orientation (46,080 configs) with exact geometric scoring; fast chord-alternation pre-filter (exact for the chosen routing family)
- [x] 1.3 Verify every candidate: exact crossings (local-local = 0, local-cross = 0, inter-region reported), territory clips (0), UI collisions with rendered-metric boxes
- [x] 1.4 Edge label placement pass (nudge along/around the route until collision-free)
- [x] 1.5 Auto-fit: raise the spacing budget and re-run when collisions remain; fail loudly with the full report after bounded iterations
- [x] 1.6 Emit `packages/client/src/map-layout.generated.json` (regions, cities, edges, labels, viewBox, stats) with the verification report
- [x] 1.7 Remove the ELK ordering pipeline: `tools/generate-region-orders.ts`, `map-order.generated.*`, `generate:map-order` script; add `generate:map-layout`
- [x] 1.8 Add `tools/render-map-svg.ts` to render the generated layout for visual inspection

## 2. Client integration

- [x] 2.1 Rewrite `packages/client/src/map-layout.ts` as a typed accessor over the generated JSON; `assertLayoutComplete` throws with the regeneration command on stale data
- [x] 2.2 `renderMap` consumes generated label anchors (`EDGE_LABELS`) instead of deriving them; viewBox uses width/height
- [x] 2.3 Move the build badge to centered-above the node (matches the verified UI box model)
- [x] 2.4 Regenerate the client bundle (`npm run build:client`)

## 3. Map data

- [x] 3.1 Rename the four conflicting region display names to thematic qualifiers (Emerald Coast, Sunset Coast, Veridian Heartland, Silverado Heartland); ids unchanged; layout reads no names

## 4. Verification

- [x] 4.1 Add `packages/client/test/map-layout.test.ts`: every city/edge resolves, cities inside territories, everything inside the viewBox, local-local and local-cross = 0, clips = 0, collisions = 0, crossing set documented
- [x] 4.2 `npm run typecheck` and `npm test` pass (full suite, including engine tests)
- [ ] 4.3 Eyeball the rendered SVG (`npx tsx tools/render-map-svg.ts`) in a browser for a 2/3/4-player game
