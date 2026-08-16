## Why

The client renders the exhibition map as plain region-grouped cards with colored slot dots: the network graph, build costs, reachability, era slot gating, and region availability are invisible, so players cannot see the map mechanics while deciding. The v1 client also deliberately excluded visual polish; the UI is now the focus.

## What Changes

- Replace the region-cards board with a stable SVG map: cities and local distribution links remain in their regional territories, while cross-region links use dedicated lanes through the empty corridors between regions.
- Paint map data at rest, without hover-only surfaces: slot dots with era-locked slots shown dimmed/dashed, next slot-tier price per city, per-city route cost (`conn + slot`) for the current player's network, ownership rings, and dimming for unreachable cities.
- Phase-gated affordances: green build badges and click-to-build only during the current player's exhibition turn; other phases show the data without dead buttons.
- Add a turn-order strip showing the live `state.turnOrder` (active player, next player, "you"), which recomputes each round.
- Restructure the game view into a two-column layout: the map as the hero surface on the left, a compact status rail (players, rights market, talent market, log) on the right, and a phase-contextual action bar showing exactly one phase's actions with one end-turn CTA.
- Add a static legend covering slot cost tiers (10/15/20), era slot unlocks, and node states.
- Compact the rail rows so all data is visible without scrolling.
- No engine or protocol changes; all data is computed client-side from the snapshot using engine helpers.

## Capabilities

### New Capabilities

- `map-layout`: static hand-placed coordinates for the exhibition map (client-side data)

### Modified Capabilities

- `game-client`: board rendering, player command presentation, and layout requirements change (SVG map, phase-gated affordances, turn-order strip, two-column layout)

## Impact

- `packages/client/src/main.ts` — `renderBoard` replaced with SVG map rendering; renderPlayers/renderActions reworked; turn-order strip added
- `packages/client/src/map-layout.ts` — fixed city coordinates, region territories, and dedicated inter-region routes
- `packages/server/public/index.html` — SVG/CSS styles, legend card, two-column layout
- `packages/server/public/client.js` — rebuilt bundle (via `npm run build:client`)
- No changes to `@mogul/engine` or `@mogul/protocol`
