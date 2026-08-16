# game-client Specification

## Purpose

The browser client of Mogul: renders the game from state snapshots, submits player commands, and supports reconnection. Deliberately minimal for v1 — the game mechanics are the focus; era theming and visual flourish are out of scope.

## Requirements

### Requirement: Snapshot rendering

The browser client SHALL render the current game state from the latest snapshot: the board, property and talent markets, each player's money, properties, contracts, and theaters, the current phase, and whose turn it is. The client SHALL update the render on every snapshot it receives. The exhibition map SHALL render from the generated layout data (region polygons and label anchors, city coordinates, edge routes and label anchors, viewBox) with no client-side layout computation. When the map rules are not covered by the layout data (for example a stale generated layout after a map change), the client SHALL throw at render time with the missing city or edge id and the regeneration command, rather than render a partial map.

#### Scenario: Board reflects the snapshot

- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater and the updated money for the building player

#### Scenario: Stale layout fails loudly

- **WHEN** the map rules contain a city that the generated layout data does not cover
- **THEN** the client does not render a partially drawn map; it throws with the city's id and the regeneration command

### Requirement: Player commands

The browser client SHALL present the active player with the legal actions for the current turn as controls and SHALL submit the chosen action as a typed command. Rejected commands SHALL be surfaced with the server's reason.

#### Scenario: Legal actions are offered

- **WHEN** it is the player's turn in the talent market
- **THEN** the client offers the legal talent purchases and end-turn, and submits the chosen command

### Requirement: Reconnect

The browser client SHALL rejoin the room after a reload or disconnect and re-render from the fresh snapshot, with no event replay.

#### Scenario: Reload restores play

- **WHEN** a player reloads the page mid-game
- **THEN** the client rejoins the room, receives the full current snapshot, and re-renders the board
