## MODIFIED Requirements

### Requirement: Snapshot rendering

The browser client SHALL render the current game state from the latest snapshot: the board, property and talent markets, each player's money, properties, contracts, and theaters, the current phase, and whose turn it is. The client SHALL update the render on every snapshot it receives. The exhibition map SHALL render from the generated layout data (region polygons and label anchors, city coordinates, edge routes and label anchors, viewBox) with no client-side layout computation. When the map rules are not covered by the layout data (for example a stale generated layout after a map change), the client SHALL throw at render time with the missing city or edge id and the regeneration command, rather than render a partial map.

#### Scenario: Board reflects the snapshot

- **WHEN** the client receives a snapshot after a player builds a theater
- **THEN** the render shows the new theater and the updated money for the building player

#### Scenario: Stale layout fails loudly

- **WHEN** the map rules contain a city that the generated layout data does not cover
- **THEN** the client does not render a partially drawn map; it throws with the city's id and the regeneration command
