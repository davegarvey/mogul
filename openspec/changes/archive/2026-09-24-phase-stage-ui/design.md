## Context

The client (`packages/client/src/main.ts`, vanilla DOM and SVG, bundled with esbuild) renders one layout for every phase: the map card in a left column, a 360px rail (turn order, studios, rights market, talent market, legend, log), and a sticky bottom bar listing `snapshot.actions` as buttons labelled with the engine's action text. The snapshot already carries everything the new stages need:

- **Auction:** `AuctionState` has `propertyId`, `currentBid`, `highestBidder` and `biddersIn`.
- **Talent:** each track's `slots` and prices are in the state. The engine exports `trackPrice`, `storageFor` and `contractedCount`.
- **Opening night:** `state.events` is cumulative, and each `opening-night` event records `lit` and `income` per player. Players also carry `litLastNight`.
- **Commands:** the engine validates `start-auction` amounts (at least face value, at most cash) and `bid` amounts (above the current bid, at most cash). It sells talent one unit per `buy-talent` command.

## Goals / Non-Goals

**Goals:**
- Make each phase's task the focus of the screen, with controls on the objects they affect.
- Make live auctions readable to every player, and allow jump bids.
- Show talent needs and costs before purchase, and allow multi-unit purchases.
- Keep the map available in every phase, without it dominating the screen.
- No engine, protocol or server changes.

**Non-Goals:**
- Era theming, animation or an art pass.
- Changing map geometry (that is `compact-map-layout`).
- Chat, spectating or UI for a host handing a seat to a bot.
- A UI framework. The client stays vanilla DOM and SVG.

## Decisions

### 1. One stage renderer per phase, chosen from the snapshot
`renderGame` picks the stage from `state.phase`: `rights-auction` → auction stage, `talent-market` → talent stage, `exhibition` → map stage. During the automatic phases (`moguls-assemble`, `opening-night`), it keeps the previous stage visible without controls, because they resolve too quickly to need their own screen. A client-only `mapExpanded` flag overrides the stage with the full map in any phase. It resets whenever the phase changes, so a new phase always opens on its task.

### 2. Controls are built from legal actions, not from rules
Every control is derived from `snapshot.actions`, matched to its object by command fields (`propertyId`, `track`, `cityId`). A card shows "Auction from $X" only if a matching `start-auction` action exists, and the bid panel appears only if a `bid` or `pass-auction` action exists. The client adds no rules of its own. It only varies the amount (Decision 3) and repeats purchases (Decision 4). The engine remains the single authority, and anything the client gets wrong is rejected with a reason.

### 3. Custom amounts substitute into a legal action
For a jump bid, the client copies the legal `bid` (or `start-auction`) command and replaces `amount` with the chosen value. The stepper is limited to the range from the action's own amount (the minimum) up to the player's cash. The state version comes from the same snapshot, so a stale snapshot is rejected as it is today. Alternatives considered: adding a "bid N" action to the engine's menu would change the engine and flood the menu for no gain; free text input invites mistakes that the stepper prevents.

### 4. Multi-unit talent purchases are sequential single commands
Buying N units sends one `buy-talent` at a time, waiting for the next snapshot and using its state version. It stops on the first rejection and shows the reason. The displayed total is calculated before the first purchase by walking the track's slots from the current price, which is the same order the engine follows. Prices only change through this player's purchases during their turn, so the preview is exact. Alternative considered: a batch command in the engine, rejected to keep the engine unchanged.

### 5. Talent needs from engine helpers
For each owned property: needed for a full night = `output × perPicture`; contracted = `contractedCount`; storage = `storageFor`; the most that can be bought is the minimum of the storage headroom, the units affordable along the track, and the track's remaining supply. These are displayed only; the engine still validates each purchase.

### 6. Opening night summary from the last event
After a round's opening night, the client finds the latest `opening-night` event and shows each studio's `lit` and `income` at the top of the next stage. A client-only `dismissedRound` records dismissal; the summary also hides when the player takes their first action. Nothing new is needed in the snapshot.

### 7. Map thumbnail reuses the full renderer
The thumbnail is the same SVG drawn from the same layout data, scaled into the rail, with labels hidden below a size threshold through CSS. It carries no controls. Clicking it, or its "Expand" control, sets `mapExpanded`. There is no second layout path, so the "no client-side layout computation" rule still holds.

### 8. Layout and responsiveness
The stepper runs across the top. Below it, the stage and a rail of about 280px sit side by side above 1024px, with the rail stacking below the stage on narrower screens, as today. The rail holds turn order, studios, the map thumbnail and the log. The legend moves into the map stage. The rights and talent markets move from the rail into their stages.

### 9. Delivery in three slices
1. Layout shell, stepper, rail, map on demand, and the auction stage (replacing the auction part of the action bar).
2. The talent stage.
3. The map stage's end-turn control and the opening night summary. The bottom action bar is removed.

The flat action bar stays as a fallback for phases not yet moved, so the game remains playable between slices.

## Risks / Trade-offs

- [Matching actions to objects misses a new action type] → Unmatched legal actions are shown in a small fallback list in the stage, so no legal move is ever hidden. A test checks that every action in a snapshot is rendered somewhere.
- [Sequential purchases race with a disconnect or a turn change] → Each step waits for its acknowledgement and uses the fresh state version. A rejection or turn change stops the sequence.
- [Jump bids make it easy to overbid by mistake] → The stepper starts at the minimum raise, the button shows the exact amount ("Bid $25"), and the amount can't exceed cash.
- [The thumbnail is unreadable at rail width with the current map] → It is only for orientation and opens the full map. `compact-map-layout` improves it, but this change doesn't depend on it.
- [Removing the action bar breaks bot or agent flows] → It doesn't: bots run in the server and the agent CLI reads `snapshot.actions` directly. Neither uses the browser client.
