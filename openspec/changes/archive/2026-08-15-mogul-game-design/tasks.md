## 1. Setup and rules-as-data

- [x] 1.1 Initialize the TypeScript monorepo (engine, protocol, server, client, bot, agent-cli packages) with shared config, lint, and typecheck
- [x] 1.2 Define the rules-as-data schema and data files: price tracks, property deck (face value / output / talent type / capacity / era card), income table, map (cities, slots, edge costs, regions by player count), era data — validated at startup
- [x] 1.3 Add validation + unit tests for rules data (every property, city, and track references valid ids)

## 2. game-core: engine

- [x] 2.1 Implement the state model and pure reducer with command validation and rejection reasons
- [x] 2.2 Implement round phases in fixed order (moguls assemble, rights auction, talent market, exhibition, opening night) with a round that only advances when all active phases complete
- [x] 2.3 Implement turn order: most theaters built, ties broken by highest-output property owned; reverse order for talent market and exhibition
- [x] 2.4 Implement the money loop: starting capital and opening-night box office as the only money sources; all purchases paid from cash
- [x] 2.5 Implement box office income: per income table by theaters lit, guaranteed minimum 10, no other modifiers
- [x] 2.6 Implement the era clock: talkies begins at start of opening night when any player builds their 7th theater; golden age begins at the next phase boundary when the era card is drawn
- [x] 2.7 Implement victory: game ends after the exhibition phase of the round in which a player builds the target theater count (17 for four players); winner is the player who can light the most theaters, ties on money then theaters built
- [x] 2.8 Unit tests covering all game-core spec scenarios (round order, tie-breaks, income values, era triggers, endgame)

## 3. game-market: engine

- [x] 3.1 Implement the rights auction: 4+4 market, auction lifecycle (open at or above face value, strictly higher bids, pass-on-start vs pass-on-bid semantics, winner out for the round), one property per player per round
- [x] 3.2 Implement market refresh: replacement draw + re-sort by value after a sale, no-sale removal, round-1 mandatory purchase
- [x] 3.3 Implement the property deck: era card at the bottom, talkies shelving with replacement, golden age shrink to six available properties
- [x] 3.4 Implement the minimum rule: remove and replace any market property whose output is at or below the leader's built-theater count
- [x] 3.5 Implement the talent market: four price tracks, single purchase turn per player in reverse order, marker prices, contract-storage limits, era-determined restock
- [x] 3.6 Implement exclusive contracts: 2× storage, per-picture consumption on opening night, partial supply when starved
- [x] 3.7 Unit tests covering all game-market spec scenarios (auction passes, refresh, minimum rule, price movement, contracts)

## 4. game-map: engine

- [x] 4.1 Implement the map data: graph of cities with 1–3 slots, distribution edge costs, region selection by player count
- [x] 4.2 Implement expansion: contiguous build (route from own network, pass-through allowed), cheapest-path edge costs paid per player, any number of builds subject to cash, max one theater per player per city, open slots only
- [x] 4.3 Implement theater slots: first theater 10 in every era, second 15 from talkies, third 20 from golden age, unlocks applying from the round after the transition
- [x] 4.4 Unit tests covering all game-map spec scenarios (shared routes, contiguity, full cities, one theater per player per city, slot unlocks)

## 5. Protocol package

- [x] 5.1 Implement the full state snapshot: serialized JSON of all money, properties, talent tracks, theaters, era data, plus a state version that changes on every applied command
- [x] 5.2 Implement typed command schemas (bid, buy-talent, build, pass, end-turn) and server-side validation with human-readable rejection reasons
- [x] 5.3 Keep the message schema transport-agnostic so the engine runs headless (tests, tournament harness) without a socket

## 6. Tournament harness and balance

- [x] 6.1 Build a minimal deterministic bot (legal moves in every phase) sufficient for headless games
- [x] 6.2 Build the tournament harness: run N bot-vs-bot games headless, report win rates, income curves, era timing, and endgame reachability
- [x] 6.3 First balance pass: sanity-check income table pacing, era triggers, and endgame target against rules data; tune data only

## 7. game-ai: scripted bot

- [x] 7.1 Implement the scripted bot on the player protocol: deterministic, rule-based, legal moves in every phase
- [x] 7.2 Implement separable auction heuristics (property valuation against face value and output) with its own test surface
- [x] 7.3 Implement talent buying against contract needs, expansion toward open slots, and era-aware timing
- [x] 7.4 Unit tests: bot always produces legal moves before its clock expires in every phase

## 8. game-lobby and server

- [x] 8.1 Implement lobby: room creation and codes, join by code, nicknames only, roster, host start when seat requirements are met
- [x] 8.2 Implement mixed seats: human, scripted-bot, and agent seats up to room capacity, all under the same player protocol
- [x] 8.3 Implement bot handoff: grace period on disconnect, seat marked bot-controlled, human return before the grace period reverts control
- [x] 8.4 Implement reconnect: rejoin reattaches the seat and re-sends the full current snapshot with no event replay
- [x] 8.5 Implement per-seat move clocks with configured fallbacks (pass where legal, otherwise bot handoff), identical for agent and human seats
- [x] 8.6 Implement WebSocket transport: room-scoped connection, snapshot pushed after every change, command ack or rejection reason per command

## 9. game-client: browser client

- [x] 9.1 Implement room create/join flow over WebSocket (room code, roster, host start)
- [x] 9.2 Implement snapshot rendering: board, property and talent markets, each player's money/properties/contracts/theaters, current phase, turn indicator
- [x] 9.3 Implement legal-action controls for the active player and command submission, surfacing server rejection reasons
- [x] 9.4 Implement reconnect: reload rejoins the room and re-renders from the fresh snapshot
- [x] 9.5 Add the era indicator and a minimal visual shift on era transitions (theming depth stays out of v1 scope)

## 10. game-ai: agent CLI

- [x] 10.1 Implement CLI room join as a player seat (same join flow as the browser client) with LLM config via environment/config file
- [x] 10.2 Implement the turn loop: block while not the seat's turn; render prompt with current phase, seat state, and the menu of currently legal actions including end-turn
- [x] 10.3 Implement reply handling: exactly one action in a fixed schema, parse + shape-validate, re-prompt on malformed replies with bounded retries
- [x] 10.4 Implement command submission with the snapshot state version, stale-menu discard and re-fetch, rejection repair loop, and clock-rule fallback on retry exhaustion
- [x] 10.5 End-to-end test: agent CLI plays a full game against scripted bots and passes a complete menu-driven turn scenario
