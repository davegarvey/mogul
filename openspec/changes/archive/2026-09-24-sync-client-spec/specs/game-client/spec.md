## ADDED Requirements

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
The client SHALL present the active player with action controls for the current phase only, ending with a single end-turn control for that phase. During automatic phases (moguls-assemble, opening-night) and during other players' turns, the client SHALL present no action controls. Market prices, talent tracks and map costs SHALL remain visible in every phase, with no controls that cannot be used in that phase.

#### Scenario: Single contextual end-turn control
- **WHEN** the active player is in the talent market
- **THEN** the client presents the legal talent purchases and exactly one "End your talent purchases" control

#### Scenario: Automatic phase shows no controls
- **WHEN** an automatic phase is resolving
- **THEN** the client presents no action controls

#### Scenario: Data visible without controls
- **WHEN** the active player is in the exhibition phase
- **THEN** the rights market shows its data without bid controls

### Requirement: Static legend
The client SHALL display a static legend explaining the slot cost tiers (10 for the first theatre in a city, 15 for the second, 20 for the third), the era slot unlocks (one slot in the silent era, two in talkies, three in the golden age), the player colours, and the map's node states.

#### Scenario: Legend covers the map's rule encodings
- **WHEN** the legend is rendered
- **THEN** it states the slot cost tiers, the era slot unlocks and the node-state encodings

## MODIFIED Requirements

### Requirement: Snapshot rendering
The browser client SHALL render the current game state from the latest snapshot: the exhibition map, the property and talent markets, each player's money, properties, contracts and theatres, the current phase, the turn order, whose turn it is, and a log of game events. The client SHALL update the render on every snapshot it receives. On wide viewports the client SHALL use a two-column layout, with the map as the primary surface and the players, markets, legend and log in a side rail. On narrow viewports the rail SHALL stack below the map. The page MAY scroll. The exhibition map SHALL render from the generated layout data (region polygons and label anchors, city coordinates, edge routes and label anchors, viewBox) with no client-side layout computation. When the map rules are not covered by the layout data (for example a stale generated layout after a map change), the client SHALL throw at render time with the missing city or edge id and the regeneration command, rather than render a partial map.

#### Scenario: Board reflects the snapshot
- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater on the map and the updated money for the building player

#### Scenario: Rail stacks on narrow viewports
- **WHEN** the viewport is too narrow for two columns
- **THEN** the rail is rendered below the map rather than beside it

#### Scenario: Stale layout fails loudly
- **WHEN** the map rules contain a city that the generated layout data does not cover
- **THEN** the client does not render a partially drawn map; it throws with the city's id and the regeneration command

### Requirement: Player commands
The browser client SHALL present the active player with the legal actions for the current phase as controls, including clicking a buildable city on the map during the exhibition phase, and SHALL submit the chosen action as a typed command. Rejected commands SHALL be surfaced with the server's reason.

#### Scenario: Legal actions are offered
- **WHEN** it is the player's turn in the talent market
- **THEN** the client offers the legal talent purchases and end-turn, and submits the chosen command

#### Scenario: Map click submits a build
- **WHEN** the player clicks a buildable city during their exhibition turn
- **THEN** the client submits the build command for that city and, if the server rejects it, shows the server's reason
