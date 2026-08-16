## ADDED Requirements

### Requirement: Exhibition map rendering
The client SHALL render a stable SVG map containing every city, regional territories, and local distribution links with their costs. Cross-region links SHALL use dedicated lanes through the empty corridors between regions, SHALL terminate at distinct perimeter ports on their endpoint cities, and SHALL NOT pass through an unrelated region territory. Cross-region lane corners SHALL be visually softened rather than rendered as overlapping hard diagonals. Each city SHALL show its name, its theater slots with occupancy (occupied slots tinted with the owning player's color, empty slots as open rings, slots locked by the current era rendered dimmed), and relevant build-cost information. Cities reachable from the current player's network SHALL show their route cost as connection cost plus slot cost; unreachable cities SHALL be dimmed. Regions not in play for the current player count SHALL remain visible but dimmed with a chip stating the player count at which they open. During the current player's exhibition turn, cities the player can afford SHALL show a build badge and SHALL submit a build command when clicked; at all other times the client SHALL show no build affordance. All map data SHALL be readable without hover.

#### Scenario: Edge costs visible at rest
- **WHEN** the client renders the map
- **THEN** every local edge and every inter-region lane displays its cost label

#### Scenario: Cross-region lanes avoid unrelated regions
- **WHEN** a cross-region edge is rendered
- **THEN** its lane travels through an empty inter-region corridor and terminates at its two endpoint cities without crossing another region territory

#### Scenario: Era-locked slots visible
- **WHEN** the era is silent
- **THEN** each city shows its first slot as available and its remaining slots dimmed with a lock indicator

#### Scenario: Unreachable cities dimmed
- **WHEN** a city is not reachable from the current player's network
- **THEN** the city is dimmed and offers no build affordance

#### Scenario: Click-to-build on the map
- **WHEN** it is the current player's exhibition turn and the player clicks a city they can afford
- **THEN** the client submits the build command for that city

#### Scenario: No dead affordances
- **WHEN** it is not the current player's exhibition turn
- **THEN** no city offers a build affordance while build costs remain visible

### Requirement: Turn order display
The client SHALL display the snapshot's turn order as an ordered strip of players, marking the active player, the next player, and the current player's own position. The strip SHALL re-render whenever the snapshot changes, including when the order recomputes at the start of a round.

#### Scenario: Order shown in snapshot order
- **WHEN** the client renders a snapshot
- **THEN** the strip shows the players in the snapshot's turn order

#### Scenario: Active and next players marked
- **WHEN** another player's turn is active
- **THEN** the strip marks that player as active and the following player as next

### Requirement: Phase-gated action affordances
The client SHALL present action controls for exactly the current phase to the active player, ending in a single contextual end-turn control. During automatic phases (moguls-assemble, opening-night) and during other players' turns, the client SHALL present no action controls. Market prices, talent slots, and map costs SHALL remain visible in every phase without presenting controls that cannot be used in that phase.

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
The client SHALL display a static legend explaining slot cost tiers (10 for the first theater in a city, 15 for the second, 20 for the third), era slot unlocks (one in the silent era, two in talkies, three in the golden age), the player colors, and the map node states (owned, buildable, unreachable, full).

#### Scenario: Legend covers the map's rule encodings
- **WHEN** the legend is rendered
- **THEN** it states the slot cost tiers, the era slot unlocks, and the node state encodings

## MODIFIED Requirements

### Requirement: Snapshot rendering
The client SHALL render the current game state from the latest snapshot: the exhibition map as a node-link diagram, property and talent markets, each player's money, properties, contracts, and theaters, the current phase, the turn order, and whose turn it is, in a two-column layout with the map as the primary surface and the markets, players, and log in a compact rail. The client SHALL update the render on every snapshot it receives. The map and all rail sections SHALL fit within the viewport without scrolling.

#### Scenario: Board reflects the snapshot
- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater on the map and the updated money for the building player

#### Scenario: Full state visible without scrolling
- **WHEN** the client renders a snapshot
- **THEN** the map, the rail sections, and the action bar are all visible in the viewport without scrolling

### Requirement: Player commands
The browser client SHALL present the active player with the legal actions for the current phase as controls — including clicking a buildable city on the map during the exhibition phase — and SHALL submit the chosen action as a typed command. Rejected commands SHALL be surfaced with the server's reason.

#### Scenario: Legal actions are offered
- **WHEN** it is the player's turn in the talent market
- **THEN** the client offers the legal talent purchases and end-turn, and submits the chosen command

#### Scenario: Map click submits a build
- **WHEN** the player clicks a buildable city during their exhibition turn
- **THEN** the client submits the build command for that city and reflects the server's rejection, if any, with its reason
