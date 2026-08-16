## Purpose

Provides deterministic static coordinates and lanes for the Mogul exhibition map so local links remain inside regions and cross-region links use stable inter-region corridors.

## ADDED Requirements

### Requirement: Complete deterministic map layout
The layout SHALL provide coordinates for every city, territory geometry for every region, and a curved route for every cross-region edge. Cities with cross-region links SHALL be positioned on the center-facing side of their region's local arc, while cities without cross-region links MAY be positioned farther toward the outside. The arrangement SHALL be deterministic and SHALL remain unchanged across sessions, rounds, and player counts. Cross-region routes SHALL use the open center or outer circumference and SHALL not traverse an unrelated region territory.

#### Scenario: Every city resolves to the map
- **WHEN** the client loads the board
- **THEN** every city in the map definition resolves to a coordinate inside its region territory

#### Scenario: Layout is stable across sessions and player counts
- **WHEN** the client renders the map in two different sessions or with different player counts
- **THEN** every city and cross-region lane appears at the same coordinates in both, including inactive regions
