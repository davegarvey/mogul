## ADDED Requirements

### Requirement: Compact territories
Each region's territory SHALL be derived from the extent of its cities' rendered UI (node, ownership ring, name label, slot dots, route info and build badge) and its local edges and their cost labels, expanded by a fixed margin. A territory SHALL NOT contain any point further than that margin from the region's own content. Territories SHALL be simple, non-overlapping polygons.

#### Scenario: No empty half-territory
- **WHEN** the layout is generated
- **THEN** every point of a region's territory lies within the fixed margin of that region's cities, local edges or their labels

#### Scenario: Territories do not overlap
- **WHEN** any two territories in the generated layout are compared
- **THEN** their polygons do not intersect

### Requirement: Content-fitted canvas
The viewBox SHALL be the bounding box of everything drawn on the map (territories, region labels, city UI, edge routes and edge cost labels) expanded by a fixed margin. It SHALL NOT be padded to a square or sized to any geometry that is not drawn. Regions SHALL be packed as closely as the separation, routing and label constraints allow, not spaced by the largest region.

#### Scenario: Canvas hugs the content
- **WHEN** the layout is generated
- **THEN** each side of the viewBox lies exactly the fixed margin beyond the outermost drawn element on that side

## MODIFIED Requirements

### Requirement: Self-verifying layout report
The generated layout SHALL carry a verification report: the crossing counts (total, local-local, local-cross, inter-region), the set of inter-region crossing pairs, the list of territory clips (empty in a valid layout), and the list of UI collisions (empty in a valid layout). Territory containment and clip checks SHALL be made against the emitted territory polygons. The committed layout SHALL be re-verified by tests, so a regression in the generator or a stale committed layout fails CI rather than the renderer.

#### Scenario: The committed layout is verified in CI
- **WHEN** the repository tests run
- **THEN** the committed layout satisfies: zero local-local and local-cross crossings, zero territory clips, zero UI collisions, every city inside its territory polygon, every city and label inside the viewBox

#### Scenario: Containment uses the drawn polygon
- **WHEN** a city lies inside a region's former bounding circle but outside its emitted territory polygon
- **THEN** verification reports the city as outside its territory
