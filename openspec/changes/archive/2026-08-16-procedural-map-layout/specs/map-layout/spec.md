## Purpose

Procedural, self-verifying layout generation for the Mogul exhibition map. The layout (region territories, city positions, edge routes, label anchors, canvas) is derived entirely from the map rules by a generator; no coordinates are hand-placed. The committed generated layout is the single data contract the client renders from.

## ADDED Requirements

### Requirement: Complete deterministic layout from map data

The layout generator SHALL derive a complete layout for the exhibition map from the map rules alone: a position for every city, territory geometry and a label anchor for every region, a route and label anchor for every edge, and the viewBox. The generator SHALL accept no hand-placed coordinates. The generated layout SHALL be deterministic: identical map data produces an identical layout across runs, sessions, and player counts. When the map data changes, regenerating the layout SHALL produce a valid layout for the new data without any manual adjustment.

#### Scenario: Every city resolves to the map

- **WHEN** the layout is generated from the map rules
- **THEN** every city resolves to a coordinate inside its own region's territory

#### Scenario: Layout changes only when the map changes

- **WHEN** the map is rendered in two different sessions or with different player counts
- **THEN** every city, region, and edge appears at the same coordinates in both

### Requirement: Local edges never cross

The layout SHALL be drawn so that no local (intra-region) edge crosses any other edge, local or inter-region. Line crossings SHALL be permitted only between inter-region connections, and the layout SHALL minimize the number of inter-region crossings: the chosen configuration SHALL be the minimum over the searched configuration space, with the final crossing set reported.

#### Scenario: A local route never intersects another route

- **WHEN** any two local edges of the map are examined in the generated layout
- **THEN** they do not intersect each other or any inter-region edge

#### Scenario: Crossings are documented

- **WHEN** the generated layout contains inter-region crossings
- **THEN** the exact set of crossing edge pairs is reported in the layout data

### Requirement: Inter-region routes respect territories

An inter-region route SHALL leave and enter only its own two regions' territories. No inter-region route SHALL traverse an unrelated region's territory.

#### Scenario: A cross-region link stays in the corridors

- **WHEN** a cross-region edge connects two regions
- **THEN** its route does not pass through the territory of any third region

### Requirement: UI elements never overlap

The layout SHALL reserve enough space for every UI element a city node renders — node, name label, slot dots, route info microtext, build badge, ownership ring — so that no element of one city overlaps any element of another city, any edge label, or any region label. Edge cost labels SHALL be placed clear of all city UI and of each other. The generator SHALL verify the layout with the rendered UI metrics and SHALL enlarge the spacing budget and regenerate when overlaps are found; if a clean layout cannot be produced, the generator SHALL fail with a report instead of emitting an overlapping map.

#### Scenario: Labels never collide

- **WHEN** the generated layout is verified with rendered UI metrics
- **THEN** no two UI elements overlap

#### Scenario: The generator fails loudly

- **WHEN** the map data cannot be laid out cleanly even after scaling the spacing budget
- **THEN** the generator reports the crossing, clip, and collision findings and does not emit a layout

### Requirement: Self-verifying layout report

The generated layout SHALL carry a verification report: the crossing counts (total, local-local, local-cross, inter-region), the set of inter-region crossing pairs, the list of territory clips (empty in a valid layout), and the list of UI collisions (empty in a valid layout). The committed layout SHALL be re-verified by tests, so a regression in the generator or a stale committed layout fails CI rather than the renderer.

#### Scenario: The committed layout is verified in CI

- **WHEN** the repository tests run
- **THEN** the committed layout satisfies: zero local-local and local-cross crossings, zero territory clips, zero UI collisions, every city inside its territory, every city and label inside the viewBox

### Requirement: Client layout contract

The generated layout SHALL be consumable by the client as plain data: region polygons and label anchors, city coordinates, per-edge routes and label anchors, and the viewBox. The client SHALL perform no layout computation of its own; it SHALL render the data as-is. When the client is built against a layout that does not cover the map rules (e.g., a stale generated file after a map change), the client SHALL throw at render time with a message naming the missing elements and the regeneration command.

#### Scenario: The client renders the committed data

- **WHEN** the client renders the map
- **THEN** every drawn element comes from the generated layout data, and no layout math runs in the client

#### Scenario: Stale layout fails loudly

- **WHEN** the map rules contain a city that the generated layout data does not cover
- **THEN** the client does not render a partially drawn map; it throws with the city's id and the regeneration command
