## Context

`tools/generate-map-layout.ts` places each region's cities on a 100° arc of radius `arcR` (at least 90), facing the map centre. The region centres sit on a ring of radius `ringRadius = 2 × max(territoryR) + RING_GAP`. The territory is the circle of radius `arcR + TERRITORY_MARGIN` around the arc's centre. Cross-region routes drop from each gateway city to a shared inner circle at `ringRadius − max(territoryR) − EXIT_BELOW_RING`, then run as chords across the empty centre. An exhaustive search over region order and chain orientation minimises cross-region crossings (currently 5). `autoFit` then grows the spacing until there are no collisions and no clips.

Three things tie the geometry to circles: the territory shape, the ring spacing, and the clip check (distance from centre < radius − 6). The emitted `radius` is also used by the containment test. The client draws only the `polygon` and `label` anchor.

Current output: viewBox 1,620 × 1,620. The cities span about 805 × 765. The territories cover about 2.2 times the area of the regions' padded city bounding boxes.

## Goals / Non-Goals

**Goals:**
- Territories that hug their content, and a canvas that hugs the territories.
- A viewBox area at most 45% of today's, with every current guarantee kept.
- Keep the procedural, data-only pipeline: no hand-placed coordinates or per-region overrides.

**Non-Goals:**
- Changing the ring topology, region order search, chain model or map data.
- Changing the client layout (two-column rail, stacking). A smaller map should make it easier to fit the view without scrolling, but that is a separate change.
- Concave or hand-styled territory shapes.

## Decisions

### 1. Territory = offset convex hull of the region's content boxes
Collect the region's collision boxes (already computed by `cityBoxes`: node, ring, name, dots, info, badge) and its local-edge label boxes. Take the convex hull of their corners, then offset it outwards by `TERRITORY_MARGIN` (reduced from 40 to about 16), rounding each corner with a short arc. Emit this as the polygon.

Alternatives considered. A capsule (a stroke of fixed width along the city chain) fits more tightly but is concave, which complicates the clip check and the label placement for little extra gain on a 100° arc. An axis-aligned or oriented rectangle is simpler but wastes the corners of the rotated regions. The offset convex hull keeps point-in-polygon and segment tests simple and removes the empty outer half.

### 2. Flatter arcs as a tunable, not a change of model
The chord area of the arc is the only real slack inside a convex hull. Keep `ARC_BETA_DEG` as it is, but record the hull area it produces in `stats`, so a later tuning pass can flatten the arc without changing the code structure. Cross-route geometry depends on the arc facing the centre, so the arc stays.

### 3. Pack the ring by polygon separation
Place each region's content with its region angle as today, as a function of `ringRadius`. Binary-search the smallest `ringRadius` for which:
(a) neighbouring territory polygons are separated by at least `RING_GAP`;
(b) the inner exit circle (see 4) keeps at least `MIN_CORRIDOR` clearance to every territory.
Both are monotonic in `ringRadius`, so bisection over a bracket such as [max hull extent, current ringRadius] converges in about 20 iterations. The region order search stays outside this loop and unchanged, which keeps the search cost similar.

### 4. Exit circle from the hulls' inner edge
Set the cross-route exit radius to `min over regions(distance from map centre to the hull) − EXIT_BELOW_RING`, not a value derived from the largest circle. The crossing count depends only on the cyclic order of the exit angles, which Decision 3 preserves, so the minimum found by the search carries over. The acceptance check still compares it with the current 5.

### 5. Clip check and containment against polygons
`countClips` tests sampled route points against each unrelated territory polygon, shrunk by 6px to match today's tolerance, using point-in-polygon. The containment test in `packages/client/test/map-layout.test.ts` changes from centre + radius to point-in-polygon on the emitted data. That makes CI check the geometry it draws, not a proxy for it.

### 6. Content-fitted viewBox
After label placement, compute the bounding box over territory polygons, region label boxes, city UI boxes, sampled edge routes and edge label boxes, then add `CANVAS_MARGIN` (about 20). Emit it as `{x, y, width, height}`. It may be rectangular. The client already renders any viewBox with `width: 100%; height: auto`.

### 7. Region label anchors
Place each region label beyond the hull's outermost point along the region's outward direction, plus 16px, instead of `radius + 16`. The label box enters collision verification, as it does today.

### 8. Layout data version 2
Region geometry becomes `{ center, polygon, label }`, where `center` is the polygon centroid, kept for diagnostics. `radius` is removed and `version` is set to 2. `packages/client/src/map-layout.ts` updates its type. `assertLayoutComplete` needs no change.

## Risks / Trade-offs

- [Tighter packing leaves less room for chord cost labels in the centre] → `MIN_CORRIDOR` sets a floor, and `autoFit` already grows the spacing and reruns when label collisions appear. If the target cannot be met cleanly, the generator fails loudly as it does now.
- [A different geometry could let the search pick a different region order] → The search objective is unchanged, and the crossing count depends only on the angular order. The acceptance check requires no more than 5 cross-cross crossings and none of the other kinds.
- [Hull offsetting and polygon tests add geometry code to the generator] → They stay in the offline tool, and the client has no layout maths. The CI tests re-check the emitted polygons.
- [A non-square viewBox changes the map's aspect ratio in the client] → The client scales to width. Check in the browser at 2, 3 and 4 players (region sets differ) and with a narrow window.

## Open Questions

- Whether regions not in play for the current player count should still take space on the canvas. The layout must stay identical across player counts (determinism requirement), so this proposal keeps them.
