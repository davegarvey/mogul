## Purpose

The fictional 1930s country map of Mogul: cities with theater slots, distribution connections with costs, and era-driven expansion limits.

## ADDED Requirements

### Requirement: Map structure

The map SHALL be a graph of cities connected by distribution edges, each edge carrying a build cost. Each city SHALL have 1 to 3 theater slots. The set of regions in play SHALL depend on player count.

#### Scenario: Region selection by player count

- **WHEN** a room has fewer players
- **THEN** the game uses only the coastal regions of the map, with the heartland unlocked for larger games

### Requirement: Expansion

A player SHALL expand by paying the distribution cost of every edge on the route from their own network to a target city, plus the theater slot cost of that city. Edge costs SHALL be paid by each player who traverses them; no player SHALL own edges, and any player may build into any city with an open slot.

#### Scenario: Shared routes are paid by each player

- **WHEN** two players both extend their networks across the same set of edges
- **THEN** each pays the full edge costs independently

#### Scenario: Full city blocks entry

- **WHEN** all slots of a city are occupied
- **THEN** no player can build a new theater into that city

### Requirement: Theater slots

Theater slots SHALL cost 10, 15, and 20, and SHALL unlock by era: one slot per city in the silent era, a second in the talkies era, and a third in the golden age.

#### Scenario: Slots unlock by era

- **WHEN** the talkies era begins
- **THEN** the second theater slot becomes available in every city that has room

### Requirement: Era transitions

Era transitions SHALL be triggered by game conditions: the talkies era SHALL begin when a player lights their 7th theater, and the golden age SHALL begin when the era card is drawn from the property deck. Transitions SHALL apply to all players simultaneously.

#### Scenario: Talkies trigger city-wide

- **WHEN** any player lights their 7th theater
- **THEN** the game immediately enters the talkies era, affecting the market, slots, and restock for all players
