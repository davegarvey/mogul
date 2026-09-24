## Context

The server arms a per-action timer (`clockSeconds`, default 60) whenever a human or agent seat is active. On expiry, `expireClock` applies pass or end-turn where legal and otherwise marks the seat bot-controlled. Scripted bots act immediately and never use the clock. The snapshot carries `clockSeconds` and `clockDeadline`, which the client uses for a countdown refreshed every second. The agent CLI's comments and fallback assume the server clock will move a seat the CLI cannot move. Two tests use a 1–2 second clock to move a host seat that never acts.

## Goals / Non-Goals

**Goals:**
- Remove the move clock end to end: server, protocol, client, agent assumptions, tests, spec and README.
- Keep every game able to finish in the tests without a clock.

**Non-Goals:**
- A replacement mechanism, such as an optional clock or a host-controlled "hand to bot" button. Either can be added later if needed.
- Any change to the disconnect grace period or bot handoff.

## Decisions

- **Remove the fields, don't just ignore them.** `clockSeconds` goes from `RoomConfig`, and `clockSeconds` and `clockDeadline` go from `SnapshotEnvelope`. Keeping unused optional fields would suggest a feature that doesn't exist. A client sending `clockSeconds` in `create-room` config is harmless: `createRoom` spreads a partial config, and the room never reads the extra field.
- **Agent fallback becomes self-sufficient.** On exhausted retries, the CLI prefers pass or end-turn and otherwise submits the first legal action. Without a clock, doing nothing would stall the game, for example in the first-round auction where passing is not legal.
- **Tests use disconnection, not a clock, to move idle seats.** Where the host only observes, the test disconnects the host after starting the game, so the grace-period handoff (1 second in tests) turns it into a bot seat. The server test that watches for game end drives its own seat instead: it passes or ends its turn where legal, and otherwise takes the first legal action. This exercises the real command path.

## Risks / Trade-offs

- [A connected but idle player, or a hung agent, stalls the game] → Accepted for friendly play. If it becomes a problem, reintroduce a clock (possibly agent-only) or add a host-controlled handoff.
