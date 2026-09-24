## Why

The `exhibition-map-ui` change was archived without its spec deltas being synced. `procedural-map-layout` then superseded it, but only its hand-placed layout approach. The client requirements it introduced (SVG exhibition map, turn-order strip, phase-gated controls, legend, click-to-build) were lost with it. They are all implemented, yet `openspec/specs/game-client/spec.md` still describes the original minimal v1 client. This change brings the main spec back into line with the shipped client. It changes no code.

## What Changes

- Restore the client requirements from `exhibition-map-ui` that describe shipped behaviour: exhibition map rendering, turn-order display, phase-gated action controls and a static legend.
- Leave out the map-geometry wording from those requirements (cross-region lanes, corridors, perimeter ports, softened corners). The `map-layout` capability now owns layout, and the client only renders the generated layout data.
- Update **Snapshot rendering** to describe the current layout: map plus rail in two columns on wide viewports, stacking on narrow ones. The requirement keeps the generated-layout and stale-layout rules added by `procedural-map-layout`.
- Update **Player commands** so that clicking a city submits a build during the player's exhibition turn.
- Drop the "no scrolling" requirement from `exhibition-map-ui`. It was never met: at 1440×900 the game view is about 1,230px tall. Fitting everything in the viewport is left as a possible future change, not a current requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-client`: records the exhibition map, turn order, phase-gated controls, legend and click-to-build behaviour, and the actual responsive layout.

## Impact

- `openspec/specs/game-client/spec.md` only. No changes to code, protocol or engine.
