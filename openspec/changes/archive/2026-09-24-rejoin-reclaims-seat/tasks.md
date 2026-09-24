## 1. Server

- [x] 1.1 In `Room.rejoin`, clear `botControlled`, attach the connection, and send room state and the snapshot
- [x] 1.2 Add a server test: a player disconnects, the grace period passes, a bot takes over, the player rejoins and gets their seat and a snapshot back

## 2. Client

- [x] 2.1 Send `join-room` with the stored nickname and code when the connection opens
- [x] 2.2 Store the room code whenever room state includes the player's seat, including for the host
- [x] 2.3 On an error before any room state, clear the stored code and show the join form with the reason
