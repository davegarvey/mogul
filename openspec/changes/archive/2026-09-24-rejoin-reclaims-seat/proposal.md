## Why

When a player returns after the disconnect grace period, their seat stays bot-controlled for the rest of the game, and the server doesn't attach their connection. The returning player gets no room state and no snapshot, so their browser shows a blank page. This breaks the Reconnect requirement, which says a rejoining player receives the full snapshot. For games between friends, the simpler rule is that a returning player always takes their seat back.

## What Changes

- A human who rejoins a room mid-game reclaims their seat, whether or not the grace period has passed. If a bot had taken over, it stops playing the seat.
- The rejoining player always receives the room state and the full current snapshot.
- The browser client now sends the rejoin request when its connection opens (after a reload or a dropped connection), and stores the room code for the host as well as for guests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-lobby`: bot handoff lasts until the player returns rather than for the rest of the game; rejoining always reclaims the seat.

## Impact

- `packages/server/src/room.ts`: `rejoin` clears `botControlled` and attaches the connection.
- `packages/client/src/main.ts`: rejoin on connect; store the host's room code; show join errors.
- `packages/server/test/server.test.ts`: a test for reclaiming a seat after the handoff.
