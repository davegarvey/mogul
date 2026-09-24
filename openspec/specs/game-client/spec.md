# game-client Specification

## Purpose

The browser client of Mogul: renders the game from state snapshots, submits player commands, and supports reconnection. Deliberately minimal for v1 — the game mechanics are the focus; era theming and visual flourish are out of scope.

## Requirements

### Requirement: Snapshot rendering
The browser client SHALL render the current game state from the latest snapshot: the phase stepper, the stage for the current phase, and a rail with the turn order, each player's money, properties, contracts and theatres, the map thumbnail, and a log of game events. The client SHALL update the render on every snapshot it receives. On wide viewports the stage and the rail SHALL sit side by side; on narrow viewports the rail SHALL stack below the stage. The page MAY scroll. The exhibition map SHALL render from the generated layout data (region polygons and label anchors, city coordinates, edge routes and label anchors, viewBox) with no client-side layout computation. When the map rules are not covered by the layout data (for example a stale generated layout after a map change), the client SHALL throw at render time with the missing city or edge id and the regeneration command, rather than render a partial map.

#### Scenario: Board reflects the snapshot
- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater on the map and the updated money for the building player

#### Scenario: Rail stacks on narrow viewports
- **WHEN** the viewport is too narrow for the stage and the rail side by side
- **THEN** the rail is rendered below the stage

#### Scenario: Stale layout fails loudly
- **WHEN** the map rules contain a city that the generated layout data does not cover
- **THEN** the client does not render a partially drawn map; it throws with the city's id and the regeneration command

### Requirement: Player commands
The browser client SHALL present the active player's legal actions as controls on the objects they act on, including clicking a buildable city on the map during the exhibition phase, and SHALL submit the chosen action as a typed command carrying the snapshot's state version. For bids and auction starts, the client MAY substitute an amount between the legal minimum and the player's cash. For multi-unit talent purchases, the client SHALL submit one purchase at a time, waiting for each to be acknowledged before sending the next. Rejected commands SHALL be surfaced with the server's reason.

#### Scenario: Legal actions are offered
- **WHEN** it is the player's turn in the talent market
- **THEN** the client offers the legal talent purchases on each property and one end-turn control, and submits the chosen command

#### Scenario: Map click submits a build
- **WHEN** the player clicks a buildable city during their exhibition turn
- **THEN** the client submits the build command for that city and, if the server rejects it, shows the server's reason

### Requirement: Reconnect

The browser client SHALL rejoin the room after a reload or disconnect and re-render from the fresh snapshot, with no event replay.

#### Scenario: Reload restores play

- **WHEN** a player reloads the page mid-game
- **THEN** the client rejoins the room, receives the full current snapshot, and re-renders the board

### Requirement: Exhibition map rendering
The client SHALL render the exhibition map as an SVG node-link diagram showing every city, the regional territories, and the distribution links with their costs. Each city SHALL show its name and its theatre slots with occupancy: occupied slots tinted with the owning player's colour, empty slots as open rings, and slots locked by the current era dimmed. Cities reachable from the current player's network SHALL show their route cost as connection cost plus slot cost. Unreachable cities SHALL be dimmed. Regions not in play for the current player count SHALL remain visible but dimmed, and SHALL state the player count at which they open. During the current player's exhibition turn, each city the player can build in SHALL show a badge with its total build cost and SHALL submit a build command when clicked. At all other times the client SHALL show no build affordance. All map data SHALL be readable without hovering.

#### Scenario: Edge costs visible at rest
- **WHEN** the client renders the map
- **THEN** every distribution link displays its cost label

#### Scenario: Era-locked slots visible
- **WHEN** the era is silent
- **THEN** each city shows its first slot as available and its remaining slots dimmed

#### Scenario: Unreachable cities dimmed
- **WHEN** a city is not reachable from the current player's network
- **THEN** the city is dimmed and offers no build affordance

#### Scenario: Region out of play
- **WHEN** a region requires more players than are in the game
- **THEN** the region is dimmed and labelled with the player count at which it opens

#### Scenario: Click-to-build on the map
- **WHEN** it is the current player's exhibition turn and the player clicks a city with a build badge
- **THEN** the client submits the build command for that city

#### Scenario: No dead affordances
- **WHEN** it is not the current player's exhibition turn
- **THEN** no city offers a build affordance, and route costs remain visible

### Requirement: Turn order display
The client SHALL display the snapshot's turn order as an ordered strip of players, marking the active player, the next player and the current player's own position. The strip SHALL re-render whenever the snapshot changes, including when the order is recomputed at the start of a round.

#### Scenario: Order shown in snapshot order
- **WHEN** the client renders a snapshot
- **THEN** the strip shows the players in the snapshot's turn order

#### Scenario: Active and next players marked
- **WHEN** another player's turn is active
- **THEN** the strip marks that player as active and the following player as next

### Requirement: Phase-gated action affordances
The client SHALL present controls only to the active player and only for the current phase. During automatic phases (moguls-assemble, opening-night) and during other players' turns, the client SHALL present no action controls. Market prices, talent tracks, the auction panel and map costs SHALL remain visible in every phase, with no controls that cannot be used in that phase.

#### Scenario: Single contextual end-turn control
- **WHEN** the active player is in the talent market
- **THEN** the client presents the legal talent purchases and exactly one "End your talent purchases" control

#### Scenario: Data visible without controls
- **WHEN** the player expands the map outside the exhibition phase
- **THEN** the map shows route and build costs without build affordances

#### Scenario: Automatic phase shows no controls
- **WHEN** an automatic phase is resolving
- **THEN** the client presents no action controls

#### Scenario: Other players' turns show data only
- **WHEN** another player is bidding in an open auction
- **THEN** the "On the block" panel shows the auction state without bid or drop-out controls

#### Scenario: Talent data visible to waiting players
- **WHEN** another player is buying talent
- **THEN** the talent stage shows the tracks and the waiting player's own needs, without purchase controls

### Requirement: Static legend
The client SHALL display a static legend explaining the slot cost tiers (10 for the first theatre in a city, 15 for the second, 20 for the third), the era slot unlocks (one slot in the silent era, two in talkies, three in the golden age), the player colours, and the map's node states.

#### Scenario: Legend covers the map's rule encodings
- **WHEN** the legend is rendered
- **THEN** it states the slot cost tiers, the era slot unlocks and the node-state encodings

### Requirement: Phase stepper
The client SHALL display a stepper of the round's player-facing phases (rights auction, talent, build, opening night), marking the current phase, together with the round, the era, and whose turn it is ("Your turn" or "Waiting on" the active player's name).

#### Scenario: Current phase marked
- **WHEN** the snapshot's phase is the talent market
- **THEN** the stepper marks the talent step as current and shows whose turn it is

### Requirement: Phase stage
The client SHALL show the current phase's task as the main surface of the game view (the stage): the auction stage during the rights auction, the talent stage during the talent market, and the full exhibition map during exhibition. Controls SHALL be attached to the card, panel or map element they act on. Each phase SHALL present exactly one end-turn or pass-for-the-round control in the stage when that action is legal. The client SHALL NOT present a separate list of action buttons detached from the objects they act on.

#### Scenario: Stage follows the phase
- **WHEN** the phase changes from the rights auction to the talent market
- **THEN** the stage switches from the auction stage to the talent stage without any action from the player

#### Scenario: Controls sit on their objects
- **WHEN** it is the player's turn to start an auction
- **THEN** each property card they can afford carries its own "Auction from $X" control, and no detached list of auction buttons is shown

### Requirement: Auction stage
The auction stage SHALL show the current market and the future market as property cards, each with its name, face value, output and talent type. When no auction is open and it is the player's turn, each card the player can afford SHALL offer to start an auction at the face value, and a pass-for-the-round control SHALL be offered when legal. While an auction is open, the stage SHALL show an "On the block" panel with the property, the current bid, the highest bidder and the players still bidding. When it is the player's turn in an open auction, the panel SHALL offer a bid amount adjustable from the minimum raise up to the player's cash, a control to submit that bid, and a control to drop out.

#### Scenario: Live auction visible to everyone
- **WHEN** an auction is open, whoever's turn it is
- **THEN** every player sees the property on the block, the current bid, the highest bidder and the players still in

#### Scenario: Jump bid
- **WHEN** the current bid is 21, the player has 37 in cash, and they set the bid amount to 25 and submit
- **THEN** the client submits a bid of 25 for the property on the block

#### Scenario: Bid amount bounded by cash
- **WHEN** the player adjusts the bid amount
- **THEN** it cannot go below the minimum raise or above the player's cash

### Requirement: Talent stage
The talent stage SHALL show the four talent tracks with their prices and remaining supply, and, for each property the player owns, its talent type, the talent needed to light its full output at the next opening night, the talent contracted, and its storage limit. When it is the player's turn, each property that can take more talent SHALL offer a quantity, bounded by storage, cash and supply, and SHALL show the total cost of that quantity before the player buys.

#### Scenario: Needs shown against contracts
- **WHEN** the player owns a property with output 4 that needs stars and has 1 star contracted
- **THEN** the talent stage shows that property as needing 3 more stars for a full opening night

#### Scenario: Multi-unit purchase
- **WHEN** the player selects 3 units for a property and buys
- **THEN** the client purchases 3 units in order at the prices shown, and stops and shows the server's reason if any purchase is rejected

### Requirement: Opening night summary
After an opening night resolves, the client SHALL show a summary of the theatres each studio lit and the income each earned. The summary SHALL remain visible at the top of the stage until the player dismisses it or takes their next action.

#### Scenario: Summary after opening night
- **WHEN** an opening night has just resolved and the next round's auction begins
- **THEN** the stage shows each studio's theatres lit and income from that night above the auction stage

### Requirement: Map on demand
Outside the exhibition phase, the client SHALL show the exhibition map as a thumbnail in the rail, rendered from the same layout data as the full map. The player SHALL be able to expand the map into the stage for viewing in any phase and collapse it back to the phase's task. During exhibition, the full map SHALL be the stage.

#### Scenario: Map collapsed during the auction
- **WHEN** the rights auction begins
- **THEN** the map appears as a thumbnail in the rail and the auction stage fills the main area

#### Scenario: Expand and collapse
- **WHEN** the player expands the map during the talent market and then collapses it
- **THEN** the stage shows the full map, then returns to the talent stage
