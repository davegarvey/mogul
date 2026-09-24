# game-lobby Specification

## Purpose

The lobby of Mogul: rooms where friends join to play, where AI players fill seats, and where dropped humans hand their seat to a bot.

## Requirements

### Requirement: Rooms

A player SHALL create a room and receive a room code; other players SHALL join by that code. The host SHALL start the game once the room meets its configured seat requirements. Players SHALL identify by nickname only; no accounts are required.

#### Scenario: Join by code

- **WHEN** a player enters a valid room code
- **THEN** they join the room in an open seat and appear in the room roster

#### Scenario: Host starts the game

- **WHEN** the host starts the game with the minimum number of seats filled
- **THEN** the game begins and all seated players are in the round

### Requirement: Mixed seats

A room SHALL hold any combination of human, scripted-bot, and agent seats up to the room capacity. AI seats SHALL be added by the host and SHALL participate in all phases under the same player protocol as humans.

#### Scenario: AI fills an open seat

- **WHEN** the host adds a scripted bot to a room with an open seat
- **THEN** the bot joins the room and takes its turn automatically when the game begins

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

### Requirement: Lobby events

The lobby SHALL emit seat, chat, and game-state events to all members of a room, so every client — browser or CLI — sees the same room state.

#### Scenario: Clients stay in sync

- **WHEN** any player joins, leaves, or the host adds an AI seat
- **THEN** every connected client in the room receives the updated roster
