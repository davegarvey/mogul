## Purpose

The lobby of Mogul: rooms where friends join to play, where AI players fill seats, and where dropped humans hand their seat to a bot.

## ADDED Requirements

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

When a human seat disconnects, the server SHALL wait a grace period and then hand the seat to a scripted bot so the game continues. The seat SHALL be marked as bot-controlled for the remainder of the game.

#### Scenario: Dropped player is replaced

- **WHEN** a human player disconnects mid-game and does not return within the grace period
- **THEN** a scripted bot takes over the seat and continues taking its turns

### Requirement: Lobby events

The lobby SHALL emit seat, chat, and game-state events to all members of a room, so every client — browser or CLI — sees the same room state.

#### Scenario: Clients stay in sync

- **WHEN** any player joins, leaves, or the host adds an AI seat
- **THEN** every connected client in the room receives the updated roster
