## 1. Map layout data

- [x] 1.1 Create `packages/client/src/map-layout.ts` with an x/y coordinate for every city in `map.json` (30 cities), region label anchors, and region polygon points (per design D1/D2)
- [x] 1.2 Add a dev-time assertion helper that logs any map city missing a coordinate, and wire it into the map render
- [x] 1.3 Replace the force layout with stable deterministic map coordinates and region territories
- [x] 1.4 Add the offline ELK.js region-order generator and commit its deterministic orientation output

## 2. SVG map rendering

- [x] 2.1 Implement `renderMap(state, rules)` in `packages/client/src/main.ts` replacing `renderBoard`: SVG with an edge layer, every edge labeled with its cost
- [x] 2.2 Draw region polygons with low-opacity fills, dashed strokes, and region name labels; dim regions not in play with an "opens at N players" chip
- [x] 2.3 Render city nodes: name label, slot dots (occupied = owner color, empty = ring, era-locked = dimmed + lock indicator), and next slot-tier price
- [x] 2.4 Encode node states for the current player: owned ring, unreachable dimming, and route cost (`conn + slot`) microtext on reachable cities, via `pathCosts`/`slotCost`/`buildCost`
- [x] 2.5 Add the build badge (total cost) on afford-able cities during the current player's exhibition turn only, with no dead affordances at other times (keyed off `snapshot.actions`)
- [x] 2.6 Wire click-to-build: the whole city node group submits the build command during the current player's exhibition turn; no pointer affordance otherwise
- [x] 2.7 Render all 30 cities and all edges at stable positions; inactive regions and cities remain visible but dimmed for player-count context
- [x] 2.8 Replace generic cross-region routing with manually designed inter-region corridor lanes
- [x] 2.9 Superseded: region panels and bridge ledger experiment
- [x] 2.10 Render the continuous SVG map with local roads and dedicated inter-region lanes
- [x] 2.11 Add distinct node perimeter ports and curved corners to inter-region lanes
- [x] 2.12 Arrange regions around an open center with center-facing cross-link cities and outer local-only cities; use curved inter-region arcs
- [x] 2.13 Route local chain links along shallow outward arcs to avoid unnecessary chords and overlaps inside regions
- [x] 2.14 Position each gateway city toward its actual external target region and separate same-direction gateways

## 3. Turn order strip

- [x] 3.1 Render a turn-order strip from `snapshot.state.turnOrder` marking active, next, and "you", re-rendered on every snapshot

## 4. Layout and rail

- [x] 4.1 Restructure the game view to two columns in `index.html`: map (left, primary), rail (right) with players, rights market, talent market, log, and legend
- [x] 4.2 Compact the rail sections into rows (players as compact rows, markets/talent as row lists, log bounded tail) so all data fits without scrolling
- [x] 4.3 Add the static legend card: slot tiers 10/15/20, era unlocks 1/2/3, player colors, node states
- [x] 4.4 Add CSS for the SVG map, badges, lock indicators, dimming, turn strip, and responsive wrap below ~1024px; keep the action bar sticky with one contextual end-turn CTA

## 5. Verification

- [x] 5.1 Run `npm run typecheck` (client included) and `npm run build:client`
- [ ] 5.2 Eyeball in browser via `npm run dev`: 2-, 3-, and 4-player games and all three eras — map data at rest, phase-gated affordances, no-scroll rail, click-to-build, turn strip
