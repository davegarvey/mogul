## 1. Baseline

- [ ] 1.1 Record the current metrics from `map-layout.generated.json`: viewBox size, per-region territory area and city spread, crossing set (5 cross-cross)
- [ ] 1.2 Add a small geometry helper module in `tools/` (convex hull, polygon offset with rounded corners, point-in-polygon, polygon–polygon distance, segment–polygon test) with unit tests

## 2. Territories and packing

- [ ] 2.1 Build each region's territory as the offset convex hull of its city UI boxes and local-edge label boxes; reduce `TERRITORY_MARGIN` to about 16
- [ ] 2.2 Replace `ringRadius = 2 × max(territoryR) + RING_GAP` with a bisection on polygon separation (`RING_GAP`) and inner-corridor clearance (`MIN_CORRIDOR`)
- [ ] 2.3 Derive the cross-route exit radius from the hulls' innermost distance to the centre
- [ ] 2.4 Switch `countClips` to point-in-polygon against unrelated territories (shrunk by 6px)
- [ ] 2.5 Anchor region labels beyond each hull's outermost point along the region direction

## 3. Canvas and output

- [ ] 3.1 Compute the viewBox from the bounds of all drawn content plus `CANVAS_MARGIN`
- [ ] 3.2 Emit region geometry as `{ center (centroid), polygon, label }`, drop `radius`, and set `version: 2`
- [ ] 3.3 Update the region type in `packages/client/src/map-layout.ts`
- [ ] 3.4 Change the territory-containment test in `packages/client/test/map-layout.test.ts` to point-in-polygon, and add a test that territories do not overlap

## 4. Regenerate and verify

- [ ] 4.1 Run `npm run generate:map-layout`; confirm zero local-local and local-cross crossings, zero clips, zero collisions, and no more than 5 cross-cross crossings
- [ ] 4.2 Confirm the viewBox area is at most 45% of the baseline, and record the before and after figures in the change
- [ ] 4.3 Run `npm run typecheck` and `npm test`
- [ ] 4.4 Rebuild the client (`npm run build:client`) and check the map in the browser with 2, 3 and 4 players and in a narrow window: territories hug their cities, labels are legible, and no route passes through an unrelated region
