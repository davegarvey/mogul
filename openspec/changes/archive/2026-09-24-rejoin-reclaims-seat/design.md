## Context

`Room.rejoin` only reattaches a connection when the seat is not bot-controlled, and it pushes room state only to connected seats. A player who returns after the grace period is therefore silently ignored. Separately, the browser client never sent `join-room` on reconnect, and it never stored the room code for the host, so reloading the page never rejoined.

## Decisions

- **Returning players reclaim their seat.** `rejoin` sets `botControlled = false`, marks the seat connected and attaches the send function, then pushes room state and the snapshot. The alternative, letting the returning player watch while the bot plays on, is more complicated and not what a friend who reloaded the page expects.
- **The bot simply stops.** Bots act immediately in `maybeTickBot`, so there is never a bot move pending when a human rejoins. Once the seat is human again, `maybeTickBot` does nothing for it.
- **The client rejoins on every connection open**, using the stored nickname and room code. If the server answers with an error before any room state (the room is gone, or the game started without this player), the client forgets the code and shows the join form with the reason.

## Risks / Trade-offs

- [Anyone who knows a player's nickname and the room code can take their seat] → The same was already true within the grace period. Accepted for private games between friends.
