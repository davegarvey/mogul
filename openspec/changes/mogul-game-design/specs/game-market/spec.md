## Purpose

The shared escalating markets of Mogul: the rights auction for properties and the talent market for stars — the engine's tension devices.

## ADDED Requirements

### Requirement: Rights auction

The rights auction SHALL expose a market of properties: four available for bidding (current market) and four visible but unavailable (future market). A bid SHALL open at or above a property's face value, with players bidding in turn order; a player who passes SHALL not bid again on any property that round. The winning bidder SHALL pay their bid and receive the property; a new property SHALL be drawn from the deck and the market reshuffled by value.

#### Scenario: Pass is final

- **WHEN** a player passes in the rights auction
- **THEN** they take no further part in auctions that round, even if a property they wanted becomes available

#### Scenario: Purchase refreshes the market

- **WHEN** a player wins an auction
- **THEN** a new property is drawn, and the market is reordered by face value with the cheapest four in the current market

### Requirement: Property deck

Properties SHALL carry: face value, output (number of theaters the property can supply per opening night), talent type consumed per picture, and contract capacity. At each era transition, the lowest-valued property in the market SHALL be shelved (removed from the game).

#### Scenario: Era transition shelves a dud

- **WHEN** the talkies era begins
- **THEN** the lowest-valued property in the market is removed from the game

### Requirement: Talent market

The talent market SHALL consist of four price tracks: extras, character actors, stars, and A-listers. Talent SHALL be bought in reverse turn order from the cheapest available spot on the track; each purchase SHALL move that track's marker up, raising the price for all players. Each round, tracks SHALL restock by era-determined amounts.

#### Scenario: Purchase raises price for everyone

- **WHEN** a player buys character actors at price 3
- **THEN** the character actors marker moves up and any player buying later that round pays at least 4

#### Scenario: Restock resets tracks

- **WHEN** opening night completes
- **THEN** talent tracks restock according to the current era, and prices drop back toward their minimum as supply allows

### Requirement: Exclusive contracts

A property SHALL hold up to twice its per-picture talent need as contracted talent (storage). On opening night, each property SHALL consume its per-picture talent per theater supplied; a property without sufficient contracted talent SHALL supply fewer theaters.

#### Scenario: Contracts insulate against price spikes

- **WHEN** a player holds two A-listers under contract on a property needing one per picture
- **THEN** they can supply the property's full output for two opening nights without entering the A-list market

#### Scenario: Starved property lights fewer theaters

- **WHEN** a property has talent contracted for fewer pictures than its output
- **THEN** the property supplies only as many theaters as its contracted talent allows
