## Why

A friend described Power Grid as their favorite game, and the mechanical skeleton — a single-currency economy, shared escalating markets, turn-order rubber-banding, a three-step clock — is the draw. Rather than a reskin, this project builds a *new* game on that skeleton, set in 1920s–1950s Hollywood, where the fiction amplifies the mechanics instead of disguising them (the studio system literally hoarded story rights; salary inflation was real; talkies decommissioned silent-era properties). It's a digital game with a lobby — friends play together, and a CLI can join as a scripted bot or an LLM agent.

## What Changes

Greenfield project — builds the entire game "Mogul" from scratch:

- **Core loop**: rights auction → talent market → exhibition → opening night, with money as the only resource and box office as the only income door (Power Grid skeleton).
- **Properties as plants**: players bid on franchises/properties (serials → blockbuster sagas) in a 4+4 market; dud properties get shelved at era transitions.
- **Talent as fuel**: four-track talent market (extras, character actors, stars, A-listers) with escalating prices and restock; consumption is per-picture commitments; storage is exclusive contracts (2× capacity).
- **Theater network**: fictional 1930s country map, theaters as city slots (single screen → palace), distribution costs as connections, film exchanges as network reach.
- **Era clock**: three steps — silent, talkies, golden age — driving market shrink, slot unlocks, and restock acceleration; visual rendering shifts with era.
- **Lobby**: rooms where friends join; seats can be filled by AI players; dropped human seats can be handed to a bot.
- **Dual AI via CLI**: a scripted bot (strong, reference opponent) and an agent client (LLM-driven, game-state snapshots in, moves out), both speaking the same player protocol.
- **Rules as data**: price tracks, decks, income tables, map, and era data in config so the game is tunable without code changes.

## Capabilities

### New Capabilities

- `game-core`: turn structure, the five phases, money loop, income table, victory condition (most theaters lit, ties on money).
- `game-market`: rights auction (bidding, market 4+4, shelfing) and the talent market (four price tracks, contracts, restock).
- `game-map`: fictional country, cities/theaters with slots, distribution connection costs, era slot unlocking.
- `game-lobby`: rooms, invitations, seat management, mixed human/AI seats, bot handoff for dropped players.
- `game-ai`: scripted bot strategy and the agent CLI client, including the player protocol (state snapshot in, moves out), move clocks, and validation.

### Modified Capabilities

None — greenfield project, no existing specs.

## Impact

- New codebase: game server (API-first, authority for lobby + game state), browser client, CLI client, AI player implementations.
- Wire protocol between clients and server must be machine-friendly (complete open-information state snapshots) since agents play through it.
- No existing code, dependencies, or systems are affected; the repo is currently an empty openspec scaffold.
- Tech stack intentionally open — the proposal phase deliberately defers stack choice to design.
