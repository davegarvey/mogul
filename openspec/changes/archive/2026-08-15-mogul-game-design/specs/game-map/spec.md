## Purpose

The fictional 1930s country map of Mogul: cities with theater slots, distribution connections with costs, and era-driven expansion limits. A player's built theaters and paid distribution routes constitute their film exchange; expanding the network extends the exchange's reach.

## ADDED Requirements

### Requirement: Map structure

The map SHALL be a graph of cities connected by distribution edges, each edge carrying a build cost. Each city SHALL have 1 to 3 theater slots. The set of regions in play SHALL depend on player count.

#### Scenario: Region selection by player count

- **WHEN** a room has fewer players
- **THEN** the game uses only the coastal regions of the map, with the heartland unlocked for larger games

### Requirement: Expansion

A player SHALL expand by paying the distribution cost of every edge on the route from their own network to a target city, plus the theater slot cost of that city. A player SHALL build only into cities connected to their own network by a route of paid edges, and MAY pass through cities without building there. A player SHALL build at most one theater per city and only into a city with an open slot. A player SHALL build any number of theaters in a round, subject to cash and open slots. Edge costs SHALL be paid by each player who traverses them; no player SHALL own edges.

#### Scenario: Shared routes are paid by each player

- **WHEN** two players both extend their networks across the same set of edges
- **THEN** each pays the full edge costs independently

#### Scenario: Expansion is contiguous

- **WHEN** a player's theaters all lie in the coastal cities
- **THEN** the player may only build in cities reachable from them by paid edges, regardless of distance

#### Scenario: Full city blocks entry

- **WHEN** all slots of a city are occupied
- **THEN** no player can build a new theater into that city

#### Scenario: One theater per player per city

- **WHEN** a player already holds a theater in a city
- **THEN** they cannot build a second theater there, even while slots remain open

### Requirement: Theater slots

The first theater built in a city SHALL cost 10 in every era. A second theater SHALL cost 15 and SHALL become available when the talkies era begins; a third SHALL cost 20 and SHALL become available when the golden age begins. Slot unlocks SHALL apply to builds from the round after the transition.

#### Scenario: Slots unlock by era

- **WHEN** the talkies era begins
- **THEN** the second theater slot becomes available in every city that has room, for builds from the next round
