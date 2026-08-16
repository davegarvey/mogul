# game-ai Specification

## Purpose

The AI players of Mogul: a scripted reference bot and an agent CLI client, both driving a seat through the same player protocol as humans.

## Requirements

### Requirement: Player protocol

All players — human, bot, and agent — SHALL interact with the game through the same protocol: the server emits a complete state snapshot, and the player submits typed move commands. The snapshot SHALL contain the full open-information state: all money, properties, talent tracks, theaters, and era data, plus a state version that changes with every applied command. The server SHALL validate every command against the current state and reject illegal moves with a reason.

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

The agent CLI SHALL connect to a room as a player seat through the same join flow as the browser client, then block while it is not the seat's turn. On the seat's turn, the CLI SHALL render the snapshot into a prompt containing the current phase, the seat's state, and the menu of currently legal actions (typed commands, including an explicit end-turn action). The CLI SHALL instruct the model to reply with exactly one action in a fixed schema, parse and shape-validate that reply into a typed command, and submit it. After every acknowledged command, the CLI SHALL re-render the menu from the new snapshot until the seat ends its turn, then SHALL block until the next turn window. Every submitted command SHALL carry the snapshot's state version; a menu rendered from a stale version SHALL be discarded and re-fetched, never submitted blind. When the server rejects a command, the CLI SHALL present the reason to the model for repair, with bounded retries before falling back to the clock rules. The CLI SHALL contain no rules logic beyond shape validation.

#### Scenario: Agent plays a turn through the action menu

- **WHEN** the agent CLI seat's turn begins in the exhibition phase
- **THEN** the CLI prompts with the legal build actions and end-turn, submits the model's chosen actions one at a time, re-rendering after each ack, and blocks again after end-turn

#### Scenario: Malformed reply is re-prompted

- **WHEN** the model's reply is not a valid action
- **THEN** the CLI re-prompts with the failure described and never submits the reply

#### Scenario: Rejected move is repaired

- **WHEN** the server rejects the agent's command with a reason
- **THEN** the CLI presents the reason to the model and retries with a corrected command

#### Scenario: Stale menu is discarded

- **WHEN** the snapshot state version changes between a menu render and a submission
- **THEN** the CLI discards the stale menu, re-fetches the snapshot, and re-renders before acting
