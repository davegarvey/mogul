## Purpose

The AI players of Mogul: a scripted reference bot and an agent CLI client, both driving a seat through the same player protocol as humans.

## ADDED Requirements

### Requirement: Player protocol

All players — human, bot, and agent — SHALL interact with the game through the same protocol: the server emits a complete state snapshot, and the player submits typed move commands. The snapshot SHALL contain the full open-information state: all money, properties, talent tracks, theaters, and era data. The server SHALL validate every command against the current state and reject illegal moves with a reason.

#### Scenario: Snapshot is complete

- **WHEN** any player requests the game state
- **THEN** the response contains the entire public state with no hidden information

#### Scenario: Illegal move is rejected

- **WHEN** a player submits a bid exceeding their cash
- **THEN** the server rejects the command with a reason, and the player may submit a legal command

### Requirement: Move clocks

Each seat SHALL have a move clock. When a seat's clock expires, the server SHALL apply the configured fallback (pass where legal, otherwise the bot handoff). Clocks SHALL apply to agent seats identically to human seats.

#### Scenario: Clock expiry falls back to pass

- **WHEN** an agent seat's clock expires during an auction
- **THEN** the seat passes on the current bid and continues with a fresh clock

### Requirement: Scripted bot

The scripted bot SHALL be a deterministic, rule-based player that produces legal moves in every phase: valuation-driven auction bids, talent buying against its contracts' needs, expansion toward open slots, and era-aware timing. Its auction heuristics SHALL be separable from its other decisions so they can be tuned independently.

#### Scenario: Bot always moves legally

- **WHEN** a scripted bot seat is active in any phase
- **THEN** it submits a legal move without human intervention before its clock expires

### Requirement: Agent CLI

The agent CLI SHALL connect to a room as a player seat, expose the current state snapshot to an LLM, translate the LLM's response into a typed move command, and handle rejection by presenting the reason back for repair. It SHALL support the same room join flow as the browser client.

#### Scenario: Agent joins a room via CLI

- **WHEN** a user runs the agent CLI against a room code
- **THEN** the CLI joins the room as a seat, prints the state snapshot, and submits the first move once the LLM responds

#### Scenario: Rejected move is repaired

- **WHEN** the server rejects the agent's command with a reason
- **THEN** the CLI presents the reason to the LLM and retries with a corrected command
