## Purpose

Core rules engine for Mogul: the five-phase round, the money loop, income, the era clock, and victory — the Power Grid skeleton that every other system hangs on. Theaters are *built* during the exhibition phase; they are *lit* on opening night when a picture is actually shown. Built theaters drive turn order, era triggers, and the endgame trigger; lit theaters drive income and victory.

## ADDED Requirements

### Requirement: Round phases

The game SHALL proceed in fixed rounds of five phases in order: moguls assemble (turn order), rights auction, talent market, exhibition, opening night. A round SHALL only advance when every active phase has completed.

#### Scenario: Full round completes in order

- **WHEN** a round begins
- **THEN** the game runs the five phases in fixed order and only begins the next round after opening night completes

### Requirement: Turn order

Players SHALL be ordered each round by most theaters built, with ties broken by the highest-output property owned. Turn order SHALL be the same order used for the rights auction, and SHALL be reversed for the talent market and exhibition phases.

#### Scenario: Leader acts first in auction

- **WHEN** two players are tied for the most theaters built and one owns a higher-output property
- **THEN** the owner of the higher-output property acts first in the rights auction

#### Scenario: Trailing player buys talent first

- **WHEN** the talent market phase begins
- **THEN** players purchase talent in reverse turn order, so the player with the fewest theaters built buys first

### Requirement: Money loop

Money SHALL only enter the game through starting capital and opening-night box office. All purchases — properties, talent, theaters, connections — SHALL be paid from a player's cash.

#### Scenario: Cash constraint binds

- **WHEN** a player attempts to buy a property, talent, or connection they cannot afford
- **THEN** the purchase is rejected and the player must choose a legal action or pass

### Requirement: Box office income

A player SHALL earn income on opening night per the income table in the rules data, based on the number of theaters lit. A player who lights no theaters SHALL earn the guaranteed minimum of 10. The income table SHALL be the only source of income values; no other penalty or bonus SHALL modify them.

#### Scenario: Worked income values

- **WHEN** a player lights their 4th theater
- **THEN** they earn 54 per the v1 income table, and the marginal gain over 3 theaters (44) is 10

#### Scenario: Guaranteed minimum

- **WHEN** a player lights no theaters on opening night
- **THEN** they earn 10

### Requirement: Era clock

The game SHALL progress through three eras: silent, talkies, and golden age. The talkies era SHALL begin at the start of the opening night phase of the round in which any player builds their 7th theater. The golden age SHALL begin at the next phase boundary after the era card is drawn from the property deck. Transitions SHALL apply to all players simultaneously; their effects — property shelving and market shrink in game-market, theater slot unlocks in game-map — SHALL take effect from the phase boundary that follows the transition.

#### Scenario: Talkies begin after exhibition

- **WHEN** any player builds their 7th theater during the exhibition phase
- **THEN** the talkies era begins at the start of the following opening night, so new slot unlocks apply from the next round

#### Scenario: Golden age begins on the era card

- **WHEN** the era card is drawn from the property deck
- **THEN** the golden age begins at the next phase boundary, affecting market and slots for all players

### Requirement: Victory condition

The game SHALL end after the exhibition phase of the round in which any player builds the target number of theaters for the player count; no opening night SHALL be played in that round. The winner SHALL be the player who can light the most theaters with their properties and contracted talent; ties SHALL break on most money, then most theaters built.

#### Scenario: Lit capacity wins

- **WHEN** the game ends and two players could light 10 theaters each while a third could light 9
- **THEN** the winner is decided between the two 10-theater players by most money

#### Scenario: Endgame triggered by target count

- **WHEN** a player builds their 17th theater in a four-player game
- **THEN** the current round ends after the exhibition phase and the game ends without an opening night
