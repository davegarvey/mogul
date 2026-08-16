## Purpose

The browser client of Mogul: renders the game from state snapshots, submits player commands, and supports reconnection. Deliberately minimal for v1 — the game mechanics are the focus; era theming and visual flourish are out of scope.

## ADDED Requirements

### Requirement: Snapshot rendering

The browser client SHALL render the current game state from the latest snapshot: the board, property and talent markets, each player's money, properties, contracts, and theaters, the current phase, and whose turn it is. The client SHALL update the render on every snapshot it receives.

#### Scenario: Board reflects the snapshot

- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater and the updated money for the building player

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
