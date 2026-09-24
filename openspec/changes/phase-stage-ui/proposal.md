## Why

The game view is organised around the exhibition map, which is the main surface in every phase although only the build phase uses it. Actions are a flat list of text buttons in a bar at the bottom of the screen, built from the engine's action labels and separated from the properties and talent they act on. In the auction, the property cards are in the side rail and their buttons are at the bottom, so it is hard to see what to do. A live auction is not shown anywhere: the property on the block, the high bid, the high bidder and who is still bidding can only be inferred from button labels and the log. The client offers only the minimum raise, although the engine accepts any bid up to the player's cash, so a bidding war takes many clicks. Talent is bought one unit per click, with no view of what each property needs.

## What Changes

- Replace the map-centred layout with a **phase stage**: the main area shows the task for the current phase, and a narrow rail holds studios, a map thumbnail and the log.
- Add a **phase stepper** (Rights auction → Talent → Build → Opening night) showing the current phase, round, era and whose turn it is.
- **Auction stage:** property cards for the current and future markets, with "Auction from $X" on each biddable card. While an auction is open, an "On the block" panel shows the property, current bid, high bidder and players still in, with a bid amount (−/+, from the minimum raise up to the player's cash), "Bid" and "Drop out".
- **Talent stage:** for each of the player's properties, talent needed for the next opening night against talent contracted and storage, next to the four price tracks. The player picks a quantity, sees the total cost and buys.
- **Build stage:** the full exhibition map with the existing click-to-build, plus "End your building".
- **Opening night summary:** after an opening night, the next stage shows what each studio lit and earned until the player dismisses it or acts.
- **Map on demand:** outside the build phase the map is a thumbnail in the rail. Expanding it shows the full map in the stage for viewing, and collapsing it returns to the phase's task.
- **Controls sit on their objects.** The bottom action bar is removed. Each control is attached to the card, panel or map element it acts on, and each phase has one end-turn control in the stage.
- Update the README's "How to play" to describe the new screen.

The work ships in three slices: (1) layout, stepper, map on demand and the auction stage; (2) the talent stage; (3) the build stage and the opening night summary.

## Capabilities

### New Capabilities

None. The phase stage is part of the browser client.

### Modified Capabilities

- `game-client`: the layout becomes phase-centred. The map moves to a rail thumbnail outside the build phase. Controls move from a bottom bar onto the objects they act on. Custom bid amounts and multi-unit talent purchases are added.

## Impact

- `packages/client/src/main.ts`: new stage renderers per phase, stepper, rail and map toggle. `renderActions` and the flat action list are replaced.
- `packages/server/public/index.html`: layout and styles for the stage, stepper, cards, auction panel and thumbnail.
- `README.md`: the "How to play" section.
- No changes to engine, protocol, server or bots. The engine already accepts custom bid amounts and single-unit talent purchases, and all displayed data is in the snapshot.
- Complements `compact-map-layout`, which makes the map readable at thumbnail and stage size. Neither change depends on the other.
