## Context

This is a spec-only reconciliation. The shipped client (`packages/client/src/main.ts`, `packages/server/public/index.html`) implements the behaviour that `exhibition-map-ui` specified, but that change was archived without syncing. `procedural-map-layout` superseded its layout approach and rewrote **Snapshot rendering** from the original v1 text, so the other `exhibition-map-ui` requirements never reached the main spec.

## Goals / Non-Goals

**Goals:**
- Make `game-client` describe the shipped client accurately.
- Keep a clean split of ownership: `map-layout` owns geometry, and `game-client` owns what is drawn and how the player interacts with it.

**Non-Goals:**
- Any code change, including meeting the old no-scrolling goal.

## Decisions

- **Restore rather than rewrite.** The `exhibition-map-ui` requirement text is reused where it still matches the code. It was checked against the client: the turn-order strip marks active, next and "you"; slots are dimmed by era; unreachable cities are dimmed; out-of-play regions are labelled "opens at N players"; build badges and click-to-build appear only on the player's exhibition turn; the legend states cost tiers and era unlocks.
- **Drop the geometry clauses.** Lanes, corridors, ports and corner softening are properties of the generated layout, which `map-layout` covers under "Inter-region routes respect territories" and "Client layout contract". Repeating them in `game-client` would give two sources of truth.
- **Describe the layout as it is.** The layout has two columns above a 1024px breakpoint and stacks below it. The page scrolls: at 1440×900 the game view is about 1,230px tall. The spec allows scrolling instead of keeping a requirement the code has never met.

## Risks / Trade-offs

- [Dropping the no-scroll requirement loses a stated design aim] → The proposal records it as a possible future change. Restoring it should come with an implementation.
