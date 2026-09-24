## REMOVED Requirements

### Requirement: Move clocks
**Reason**: The clock only guarded against slow or stuck agents, and it put unnecessary time pressure on human players. When passing was not legal, it could hand a connected player's seat to a bot. Disconnects are covered by the lobby's grace-period bot handoff.
**Migration**: None needed. Seats keep their turn until they act or disconnect. Rooms created with a `clockSeconds` config field ignore it.

## MODIFIED Requirements

### Requirement: Scripted bot

The scripted bot SHALL be a deterministic, rule-based player that produces legal moves in every phase: valuation-driven auction bids, talent buying against its contracts' needs, expansion toward open slots, and era-aware timing. Its auction heuristics SHALL be separable from its other decisions so they can be tuned independently.

#### Scenario: Bot always moves legally

- **WHEN** a scripted bot seat is active in any phase
- **THEN** it submits a legal move without human intervention

### Requirement: Agent CLI

The agent CLI SHALL connect to a room as a player seat through the same join flow as the browser client, then block while it is not the seat's turn. On the seat's turn, the CLI SHALL render the snapshot into a prompt containing the current phase, the seat's state, and the menu of currently legal actions (typed commands, including an explicit end-turn action). The CLI SHALL instruct the model to reply with exactly one action in a fixed schema, parse and shape-validate that reply into a typed command, and submit it. After every acknowledged command, the CLI SHALL re-render the menu from the new snapshot until the seat ends its turn, then SHALL block until the next turn window. Every submitted command SHALL carry the snapshot's state version; a menu rendered from a stale version SHALL be discarded and re-fetched, never submitted blind. When the server rejects a command, the CLI SHALL present the reason to the model for repair, with bounded retries. When retries are exhausted, the CLI SHALL submit pass or end-turn if legal, and otherwise the first legal action, so the seat never stalls. The CLI SHALL contain no rules logic beyond shape validation.

#### Scenario: Agent plays a turn through the action menu

- **WHEN** the agent CLI seat's turn begins in the exhibition phase
- **THEN** the CLI prompts with the legal build actions and end-turn, submits the model's chosen actions one at a time, re-rendering after each ack, and blocks again after end-turn

#### Scenario: Malformed reply is re-prompted

- **WHEN** the model's reply is not a valid action
- **THEN** the CLI re-prompts with the failure described and never submits the reply

#### Scenario: Rejected move is repaired

- **WHEN** the server rejects the agent's command with a reason
- **THEN** the CLI presents the reason to the model and retries with a corrected command

#### Scenario: Retries exhausted

- **WHEN** the model fails to produce a valid action within the retry limit
- **THEN** the CLI submits pass or end-turn if legal, and otherwise the first legal action

#### Scenario: Stale menu is discarded

- **WHEN** the snapshot state version changes between a menu render and a submission
- **THEN** the CLI discards the stale menu, re-fetches the snapshot, and re-renders before acting
