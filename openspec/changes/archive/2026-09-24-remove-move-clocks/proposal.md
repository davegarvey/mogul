## Why

Every human and agent seat has a 60-second clock per action. When it runs out, the server passes for the seat, or, where passing is not legal (such as the first-round auction, where every player must buy), hands the seat to a bot even though the player is still connected. The clock was added to keep slow or stuck LLM agents from stalling a game. For friends playing together it adds pressure for no benefit, and it can take a studio away from someone who is only thinking. Disconnects are already covered by the grace-period bot handoff. The simpler system is to have no move clock at all and to add one back if a real need appears.

## What Changes

- **BREAKING** Remove the per-seat move clock from the server: no timer and no expiry fallback. A seat keeps its turn until it acts or disconnects.
- **BREAKING** Remove `clockSeconds` from the room config, and `clockSeconds` and `clockDeadline` from the snapshot envelope.
- The browser client's turn indicator shows whose turn it is, without a countdown. The lobby no longer shows a move-clock setting.
- When the agent CLI's retries are exhausted, it submits pass or end-turn if legal, and otherwise the first legal action. It no longer relies on a server clock to move it.
- The disconnect grace period and bot handoff are unchanged. They remain the only way a seat passes to a bot.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-ai`: remove the Move clocks requirement. The Scripted bot and Agent CLI requirements no longer refer to clocks, and the agent's fallback is defined without them.

## Impact

- `packages/server/src/room.ts`: remove the clock timer, arming, expiry and config default.
- `packages/protocol/src/index.ts`: remove the clock fields from `RoomConfig` and `SnapshotEnvelope`.
- `packages/client/src/main.ts`, `packages/server/public/index.html`: remove the countdown, the one-second refresh, the `urgent` style and the lobby clock text.
- `packages/agent-cli/src/agent.ts`: the fallback no longer depends on the clock.
- Tests in `packages/server/test` and `packages/agent-cli/test` that used a short clock to move an idle host now disconnect the host, so the grace-period handoff keeps the game moving.
- `README.md`: remove the mention of the 60-second clock.
- Risk: a connected but idle player, or a hung agent, can stall a game indefinitely. That is acceptable for friendly games, and the host can end the game by leaving.
