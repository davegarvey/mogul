# game-market Specification

## Purpose

The shared escalating markets of Mogul: the rights auction for properties and the talent market for stars — the engine's tension devices.

## Requirements

### Requirement: Rights auction

The rights auction SHALL expose a market of properties: four available for bidding (current market) and four visible but unavailable (future market). Acting in turn order, the leading eligible player SHALL either put a property up for auction with an opening bid at or above its face value, or pass and take no further part in the auction that round. Bids SHALL be strictly higher than the current bid; a player who passes on an active bid SHALL take no further part in that property's auction but MAY bid in later auctions that round. The winning bidder SHALL pay their bid and receive the property, and SHALL take no further part in the auction that round; a player SHALL buy at most one property per round. If the auction starter did not win, they SHALL put another property up for auction or pass. After a purchase, a new property SHALL be drawn from the deck and the market reshuffled by value, with the four cheapest in the current market. In the first round, every player SHALL purchase a property. If no property is purchased in a round, the lowest-valued property in the market SHALL be removed from the game and a replacement drawn.

#### Scenario: Pass on start is final

- **WHEN** a player passes without putting a property up for auction
- **THEN** they take no further part in the rights auction that round

#### Scenario: Pass on a bid only ends that auction

- **WHEN** a player passes on the current bid for a property
- **THEN** they may still bid on a different property later in the round

#### Scenario: One property per round

- **WHEN** a player wins an auction
- **THEN** they take no further part in the rights auction that round

#### Scenario: Purchase refreshes the market

- **WHEN** a player wins an auction
- **THEN** a new property is drawn, and the market is reordered by face value with the cheapest four in the current market

#### Scenario: No sale refreshes the market

- **WHEN** no property is purchased in a round
- **THEN** the lowest-valued property in the market is removed from the game and a replacement drawn

#### Scenario: First round forces purchase

- **WHEN** the rights auction is held in the first round
- **THEN** no player may pass without purchasing a property

### Requirement: Property deck

Properties SHALL carry: face value, output (number of theaters the property can supply per opening night), talent type consumed per picture, and contract capacity. The property deck SHALL include a single era card placed at the bottom of the deck at setup; drawing the era card SHALL begin the golden age. At the talkies transition, the lowest-valued property in the market SHALL be removed and a replacement drawn. At the golden age transition, the lowest-valued property and the era card SHALL be removed with no replacements, shrinking the market to six properties, all available for bidding.

#### Scenario: Talkies shelves a dud

- **WHEN** the talkies era begins
- **THEN** the lowest-valued property in the market is removed from the game and a replacement is drawn

#### Scenario: Golden age shrinks the market

- **WHEN** the golden age era begins
- **THEN** the lowest-valued property and the era card are removed, no replacement is drawn, and the six remaining properties are all available for bidding

### Requirement: Minimum rule

Any time a property in the market has an output equal to or lower than the number of theaters the turn-order leader has built, the property SHALL be removed from the game and a replacement drawn from the deck.

#### Scenario: Leader's growth shelves weak properties

- **WHEN** the leader builds their 6th theater while a market property has an output of 6
- **THEN** that property is removed from the game and a replacement drawn

### Requirement: Talent market

The talent market SHALL consist of four price tracks: extras, character actors, stars, and A-listers. Talent SHALL be bought from the cheapest available spot on the track during each player's single purchase turn, played in reverse turn order. Each purchase SHALL move that track's marker up, raising the price for all players; a player SHALL buy no more talent than their contracts' storage allows. Each round, tracks SHALL restock by era-determined amounts.

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
