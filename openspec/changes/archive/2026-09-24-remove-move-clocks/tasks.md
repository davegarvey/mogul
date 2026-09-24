## 1. Server and protocol

- [x] 1.1 Remove `clockSeconds` from `RoomConfig`, and `clockSeconds` and `clockDeadline` from `SnapshotEnvelope`, in `packages/protocol/src/index.ts`
- [x] 1.2 Remove the clock timer, `armClock`, `expireClock`, `clearClock`, the snapshot clock fields and the `clockSeconds` default from `packages/server/src/room.ts`

## 2. Clients

- [x] 2.1 Remove the countdown, one-second refresh and lobby clock text from `packages/client/src/main.ts`, and the `urgent` turn-pill style from `packages/server/public/index.html`
- [x] 2.2 Make the agent CLI's exhausted-retry fallback submit pass or end-turn if legal, otherwise the first legal action, and remove the clock references in `packages/agent-cli/src/agent.ts`

## 3. Tests and docs

- [x] 3.1 Update the server and agent-cli tests to drop `clockSeconds` and to move idle host seats by disconnection or by driving them
- [x] 3.2 Remove the 60-second clock from `README.md`
- [x] 3.3 Run `npm run typecheck` and `npm test`, rebuild the client, and check in the browser that the turn indicator shows no countdown
