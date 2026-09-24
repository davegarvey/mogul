## 1. Baseline

- [x] 1.1 Record the current metrics from `map-layout.generated.json`: viewBox 1620 × 1620 (2,624,270 px²); six circular territories of radius ≈213–237; 5 cross-cross crossings, 0 clips, 0 collisions
- [x] 1.2 Add a small geometry helper module in `tools/` (convex hull, polygon offset with rounded corners, point-in-polygon, polygon–polygon distance) with unit tests (`tools/geometry.ts`, `tools/test/geometry.test.ts`)

## 2. Territories and packing

- [x] 2.1 Build each region's territory as the offset convex hull of its city UI boxes and local-edge label boxes; `TERRITORY_MARGIN` reduced from 40 to 16
- [x] 2.2 Replace `ringRadius = 2 × max(territoryR) + RING_GAP` with a bisection on polygon separation (`RING_GAP` 24) and inner-corridor clearance (`MIN_CORRIDOR` 90). The full search ranks candidates on a shared provisional ring; finalists and the hill climb use their own solved ring
- [x] 2.3 Derive the cross-route exit radius from the territories' innermost distance to the centre
- [x] 2.4 Switch `countClips` to point-in-polygon against unrelated territories, with the same 6px tolerance
- [x] 2.5 Anchor region labels above (upper half of the ring) or below (lower half) their territory, centred on it, pushed out until clear of every territory and every earlier label; radial placement is the fallback. Deviation from design Decision 7: radial placement pushed wide labels sideways and widened the canvas

## 3. Canvas and output

- [x] 3.1 Compute the viewBox from the bounds of all drawn content plus `CANVAS_MARGIN` (20)
- [x] 3.2 Emit region geometry as `{ center (centroid), polygon, label }`, drop `radius`, and set `version: 2`
- [x] 3.3 Update the region type in `packages/client/src/map-layout.ts`
- [x] 3.4 Change the territory-containment test to point-in-polygon, and add tests that territories do not overlap and that no cross route passes through an unrelated territory polygon

## 4. Regenerate and verify

- [x] 4.1 Run `npm run generate:map-layout`: 0 local-local and 0 local-cross crossings, 0 clips, 0 collisions, 5 cross-cross crossings (unchanged); clean on the first pass (spacing scale 1.00); deterministic across runs; about 3 s
- [x] 4.2 viewBox 1087 × 1054 (1,145,807 px²) = 43.7% of the baseline, against a 45% target. Territory area 419,154 px², down from ≈997,000. The Americana place names added in the same session are longer, so `ARC_BETA_DEG` went from 100° to 140° to keep within the target (at 100° the canvas was 52%)
- [x] 4.3 Run `npm run typecheck` and `npm test`
- [x] 4.4 Rebuild the client and check in the browser (3- and 4-player games at 1280 × 800): territories hug their cities; measured in the DOM, no text or node lies outside the viewBox and no two rendered labels overlap. Two client fixes followed: region labels are now centred (`text-anchor: middle`, as the generator assumes), and the generator's text boxes were corrected to match the rendered baselines
