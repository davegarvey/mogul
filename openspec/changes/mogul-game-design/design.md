## Context

Greenfield project: the repo contains only an openspec scaffold — no code, no stack, no conventions. Motivation and scope are in proposal.md — Why / What Changes. The binding constraints from exploration:

- Digital game with a **lobby** — friends join rooms; AI players can fill seats.
- Two AI shapes sharing one concept: a **scripted bot** (strong reference opponent) and an **agent CLI** (LLM-driven player).
- Built to be **tuned**: the user expects to iterate on balance, so the rules must be data, not code.
- Fidelity to the Power Grid skeleton is the point; the Hollywood fiction amplifies it.

## Goals / Non-Goals

**Goals:**

- A server-authoritative game engine where the complete game state is open information (the game is open-info by design).
- Rules (price tracks, property deck, income table, map, eras) expressed as data, loaded at runtime.
- One player protocol served to all clients: browser, scripted bot, agent CLI.
- Deterministic, replayable state transitions so the engine can be tested headless and run bot-vs-bot tournaments.
- The era clock is both a rules driver and a visual theme layer.

**Non-Goals:**

- Async/play-by-mail play — v1 rooms are live, synchronous, with per-player move clocks.
- Accounts, authentication, matchmaking, rankings, monetization.
- Mobile clients or 3D rendering.
- Full Power Grid ruleset fidelity (e.g., regional fuel restrictions, multiple networks) — v1 is the pocket-complete economy: auction, talent market, exhibition, income, three eras.

## Decisions

### 1. TypeScript monorepo, rules as a pure package

One language across server, browser, and CLI; the rules engine is a zero-I/O deterministic module shared everywhere. Alternatives: Rust core + WASM (more performance than a turn-based board game needs, slower iteration), Python (weak browser path). A pure rules package runs headless in Node — unit tests, bot tournaments, and the agent's state dumps all reuse it.

### 2. Server-authoritative command/event architecture

Clients send typed commands; the server validates them against the current state and applies them through a pure reducer that emits events. Consequences: reconnect is trivial (state snapshot + event catch-up), spectating is free, replay is free, and cheating is structurally impossible. The state reducer must be the single source of truth for all phase logic.

### 3. Wire protocol: snapshot + commands + events

On join and after every change, the server emits a **complete** state snapshot (serialized JSON — all price tracks, all properties, all players' money/properties/contracts/theaters). Moves are typed commands (bid, buy-talent, build, pass…). Deliberately no delta-only protocol: deltas optimize bandwidth, but a full snapshot is what makes the agent client trivially correct — the agent reads one JSON document and submits one command. Open-information state makes this possible without leaking hidden data.

### 4. Rules-as-data schema

Price tracks, property deck entries (cost / output / talent type / capacity), income table, map (cities, slots, edge costs), and era data live in data files consumed by the engine at startup. Tuning = editing data + re-running the tournament harness. Alternative (constants in code) rejected: the user's stated workflow is iterate-and-playtest.

### 5. Dual AI on one protocol

The server has no notion of "bot vs human" — a player is a seat that submits commands. The scripted bot implements the same interface with rule-based heuristics (auction valuation, market timing, expansion greed); the agent CLI implements it by serializing the snapshot into an LLM prompt and translating the response back into a command. Server-side move validation + clocks apply equally to both — this is what makes the agent path safe to play against.

### 6. Eras as rules driver + rendering layer

The three eras (silent, talkies, golden age) drive: deck availability, market shelving, slot unlocking, restock rates. The client renders era transitions as a visual theme swap — grainy monochrome → tinted → full color — so the clock change is a moment, not a rule read.

### 7. Live rooms with per-player move clocks

Rooms are live and synchronous; each seat has a move clock; expiry policy is configured (auto-pass in auctions, bot handoff on repeated stalls). Clocks are non-negotiable because agent seats are slow by nature.

## Risks / Trade-offs

- [The auction is the game's social heart; AI auction play is hard to make non-boring] → Dedicated bot auction heuristics get first-class budget; auction logic is separated from other bot decisions so it can be tuned independently.
- [Agent seats stall or emit malformed moves] → Server-enforced clocks, strict validation with human-readable rejection reasons, and a retry/repair loop on the CLI side; timeout falls back to pass/bot.
- [Balance risk: PG's numbers are ~20 years of tuning] → Rules-as-data plus a headless tournament harness (bot vs bot vs bot) makes balance testing fast; expect several tuning cycles.
- [Scope creep toward full PG fidelity] → Non-Goals pin v1; shelving/regional extras are post-v1 expansions.
- [Name "Mogul" may collide with an existing game] → Verify availability early; rename costs nothing before any branding assets exist.

## Migration Plan

Greenfield — nothing to migrate. Build order:

1. Rules engine (pure, headless) + unit tests for all five phases
2. Tournament harness (bot-vs-bot) — use it to sanity-check the economy before any UI exists
3. Game server + lobby protocol (snapshot/command/event wire format)
4. Browser client (minimal: board, market, property cards)
5. Scripted bot
6. Agent CLI
7. Era theming / art pass

## Open Questions

- Exact fictional map layout (regions, edge costs, which cities have 3 slots) — deferrable until the engine exists; the data schema supports any layout.
- Room size (2–4?) and endgame city count per player count — deferrable; live as data.
- Client framework details (React vs vanilla DOM vs canvas) — deferrable; the wire protocol doesn't care.
