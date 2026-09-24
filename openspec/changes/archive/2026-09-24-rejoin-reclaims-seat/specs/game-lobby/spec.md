## MODIFIED Requirements

### Requirement: Bot handoff

When a human seat disconnects, the server SHALL wait a grace period and then hand the seat to a scripted bot so the game continues. The seat SHALL remain bot-controlled until the player rejoins.

#### Scenario: Dropped player is replaced

- **WHEN** a human player disconnects mid-game and does not return within the grace period
- **THEN** a scripted bot takes over the seat and continues taking its turns

### Requirement: Reconnect

A player who rejoins a room mid-game SHALL rejoin their seat and receive the room state and the full current game-state snapshot. If a disconnected human returns before the grace period expires, the bot handoff SHALL not occur. If they return after a bot has taken over, the seat SHALL revert to human control.

#### Scenario: Reload restores play

- **WHEN** a player reloads their browser mid-game
- **THEN** they rejoin the room, are returned to their seat, and receive the full current snapshot with no event replay

#### Scenario: Returning after the handoff reclaims the seat

- **WHEN** a player whose seat was handed to a bot rejoins the room
- **THEN** the seat reverts to human control and the player receives the room state and the full current snapshot
