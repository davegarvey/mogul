## Purpose

Core rules engine for Mogul: the five-phase round, the money loop, income, and victory — the Power Grid skeleton that every other system hangs on.

## ADDED Requirements

### Requirement: Round phases

The game SHALL proceed in fixed rounds of five phases in order: moguls assemble (turn order), rights auction, talent market, exhibition, opening night. A round SHALL only advance when every active phase has completed.

#### Scenario: Full round completes in order

- **WHEN** a round begins
- **THEN** the game runs the five phases in fixed order and only begins the next round after opening night completes

### Requirement: Turn order

Players SHALL be ordered each round by most theaters lit, with ties broken by the highest-value property owned. Turn order SHALL be the same order used for the rights auction, and SHALL be reversed for the talent market and exhibition phases.

#### Scenario: Leader acts first in auction

- **WHEN** two players are tied for the most theaters and one owns a higher-value property
- **THEN** the owner of the higher-value property acts first in the rights auction

#### Scenario: Trailing player buys talent first

- **WHEN** the talent market phase begins
- **THEN** players purchase talent in reverse turn order, so the player with the fewest theaters buys first

### Requirement: Money loop

Money SHALL only enter the game through starting capital and opening-night box office. All purchases — properties, talent, theaters, connections — SHALL be paid from a player's cash.

#### Scenario: Cash constraint binds

- **WHEN** a player attempts to buy a property, talent, or connection they cannot afford
- **THEN** the purchase is rejected and the player must choose a legal action or pass

### Requirement: Box office income

A player SHALL earn income on opening night per the income table based on the number of theaters lit, with the first player in turn order earning 10 less than the table value. Income values SHALL increase with diminishing returns as theaters lit grow.

#### Scenario: Diminishing returns

- **WHEN** a player lights their 4th theater
- **THEN** they earn 44 per the table, and the marginal gain over 3 theaters is 11

#### Scenario: Leader penalty

- **WHEN** the first player in turn order lights 5 theaters
- **THEN** they earn 44 (table value 54 minus 10), while another player lighting 5 theaters earns 54

### Requirement: Victory condition

The game SHALL end when any player lights the target number of theaters for the player count, finishing the current round. The winner SHALL be the player lighting the most theaters; ties SHALL break on most money, then most theaters lit.

#### Scenario: Most theaters lit wins

- **WHEN** the round completes and two players have lit 10 theaters while a third has lit 9
- **THEN** the winner is decided between the two 10-theater players by most money

#### Scenario: Endgame triggered by target count

- **WHEN** a player lights their 17th theater in a four-player game
- **THEN** the current round plays to completion and the game ends
