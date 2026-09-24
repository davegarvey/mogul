## 1. Layout shell and map on demand

- [ ] 1.1 Restructure `packages/server/public/index.html` into a stepper bar, a stage and a rail (turn order, studios, map thumbnail, log); side by side above 1024px, stacked below
- [ ] 1.2 Add the phase stepper (auction, talent, build, opening night) with round, era and whose turn it is
- [ ] 1.3 Route `renderGame` to a stage renderer per phase; during automatic phases keep the previous stage without controls
- [ ] 1.4 Render the map thumbnail in the rail from the existing SVG renderer, with no controls and labels hidden at small size
- [ ] 1.5 Add `mapExpanded` (expand from the thumbnail, collapse in the stage), reset on phase change
- [ ] 1.6 Keep the old action list as a fallback, shown only for legal actions not yet matched to a stage control

## 2. Auction stage

- [ ] 2.1 Render the current and future markets as property cards (name, face value, output, talent type)
- [ ] 2.2 Attach "Auction from $X" to each card that has a matching `start-auction` action, and the pass-for-the-round control when legal
- [ ] 2.3 Add the "On the block" panel: property, current bid, high bidder and players still in, visible to all players
- [ ] 2.4 Add the bid amount stepper (from the minimum raise to cash), "Bid $N" (the legal command with the amount substituted) and "Drop out"
- [ ] 2.5 Check in the browser: start an auction, jump-bid against bots, drop out, and win a property in round 1

## 3. Talent stage

- [ ] 3.1 Render the four tracks with prices and remaining supply
- [ ] 3.2 For each owned property, show talent type, needed for a full night, contracted and storage
- [ ] 3.3 Add a quantity picker bounded by storage, cash and supply, with a cost preview walked along the track
- [ ] 3.4 Buy sequentially, one `buy-talent` per acknowledged snapshot, stopping on rejection with the reason
- [ ] 3.5 Add the single "End your talent purchases" control in the stage

## 4. Build stage and opening night

- [ ] 4.1 Make the full map (with legend) the exhibition stage, with "End your building" in the stage
- [ ] 4.2 Add the opening night summary from the latest `opening-night` event: lit and income per studio, dismissible, hidden on the first action
- [ ] 4.3 Remove the bottom action bar once every action type is matched to a stage control; keep the unmatched-action fallback

## 5. Verification and docs

- [ ] 5.1 Add a client test that every action in representative snapshots (auction open or closed, talent, exhibition) is rendered as a control
- [ ] 5.2 Run `npm run typecheck` and `npm test`, and rebuild the client
- [ ] 5.3 Play a full game in the browser against bots at 2, 3 and 4 players, on a wide and a narrow window
- [ ] 5.4 Update the README's "How to play" to describe the stepper, stages and map toggle, and remove the "Known limitations" note about scrolling if it no longer applies
