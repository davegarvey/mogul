import {
  applyGoldenTransition,
  applyMinimumRule,
  drawReplacement,
  removeFromMarket,
  shelveLowestAndReplace,
  sortMarket,
} from "./market.js";
import { recomputeTurnOrder, reverseTurnOrder, runOpeningNight, winnerOf } from "./phases/opening-night.js";
import {
  buildCost,
  contractedCount,
  litCapacity,
  log,
  playerById,
  propertyDef,
  storageFor,
} from "./state.js";
import type {
  Action,
  ActionResult,
  AuctionState,
  Command,
  GameRules,
  GameState,
  TalentTrackId,
} from "./types.js";

export type { GameState, GameRules, Command, ActionResult, Action };

/** Next eligible auction starter in turn order, or -1 if none. */
function nextEligibleOfferer(state: GameState): number {
  for (let i = 0; i < state.turnOrder.length; i++) {
    const p = playerById(state, state.turnOrder[i]);
    if (p.auctionEligible && !p.auctionBought && !p.auctionPassed) return i;
  }
  return -1;
}

function eligibleBidders(state: GameState): string[] {
  return state.turnOrder.filter((id) => {
    const p = playerById(state, id);
    return p.auctionEligible && !p.auctionBought && !p.auctionPassed;
  });
}

/** Cheapest available price on a talent track, or null if empty. */
export function trackPrice(state: GameState, rules: GameRules, track: TalentTrackId): number | null {
  const t = state.talent[track];
  const def = rules.talentTracks[track];
  for (let i = 0; i < t.slots.length; i++) {
    if (t.slots[i] > 0) return def.slots[i].price;
  }
  return null;
}

function cityName(rules: GameRules, cityId: string): string {
  return rules.map.cities.find((c) => c.id === cityId)?.name ?? cityId;
}

function applyAuctionCommand(state: GameState, rules: GameRules, playerId: string, cmd: Command): string | null {
  const auction = state.phaseState as AuctionState;
  const p = playerById(state, playerId);

  if (cmd.type === "start-auction") {
    if (auction.propertyId !== null) return "an auction is already open";
    if (p.auctionBought) return "you already bought a property this round";
    if (p.auctionPassed) return "you already passed this round";
    if (cmd.propertyId === undefined) return "missing propertyId";
    const slot = state.market.current.find((s) => s.propertyId === cmd.propertyId);
    if (!slot) return "that property is not available for bidding";
    const def = propertyDef(rules, cmd.propertyId);
    const amount = cmd.amount ?? def.faceValue;
    if (amount < def.faceValue) return `the opening bid must be at least the face value of ${def.faceValue}`;
    if (amount > p.cash) return "you cannot bid more than your cash";
    auction.propertyId = cmd.propertyId;
    auction.currentBid = amount;
    auction.highestBidder = playerId;
    auction.biddersIn = eligibleBidders(state);
    state.events.push({ type: "auction-started", propertyId: cmd.propertyId, bid: amount, by: playerId });
    log(state, `${p.name} auctions ${def.name}, opening at ${amount}.`);
    resolveAuctionIfDone(state, rules);
    return null;
  }

  if (cmd.type === "bid") {
    if (auction.propertyId === null) return "no auction is open";
    if (p.auctionBought) return "you already bought a property this round";
    if (p.auctionPassed) return "you already passed this round";
    if (!auction.biddersIn.includes(playerId)) return "you are not in this auction";
    const amount = cmd.amount;
    if (amount === undefined) return "missing bid amount";
    if (amount <= auction.currentBid) return `the bid must exceed the current bid of ${auction.currentBid}`;
    if (amount > p.cash) return "you cannot bid more than your cash";
    auction.currentBid = amount;
    auction.highestBidder = playerId;
    state.events.push({ type: "bid", propertyId: auction.propertyId!, amount, by: playerId });
    log(state, `${p.name} bids ${amount}.`);
    resolveAuctionIfDone(state, rules);
    return null;
  }

  if (cmd.type === "pass-auction") {
    if (auction.propertyId === null) {
      if (state.round === 1) return "in the first round every player must purchase a property";
      if (p.auctionBought) return "you already bought a property this round";
      if (p.auctionPassed) return "you already passed this round";
      p.auctionPassed = true;
      p.auctionEligible = false;
      log(state, `${p.name} passes and takes no further part in the auction this round.`);
      checkAuctionEnd(state, rules);
      return null;
    }
    if (!auction.biddersIn.includes(playerId)) return "you are not in this auction";
    auction.biddersIn = auction.biddersIn.filter((id) => id !== playerId);
    log(state, `${p.name} passes on the current bid.`);
    resolveAuctionIfDone(state, rules);
    checkAuctionEnd(state, rules);
    return null;
  }

  return "unknown auction command";
}

/** If every eligible player has bought or passed, the auction phase is over. */
function checkAuctionEnd(state: GameState, rules: GameRules): void {
  if (state.phase !== "rights-auction" || nextEligibleOfferer(state) !== -1) return;
  // No-sale rule: if nothing was purchased this round, shelf the lowest and replace it.
  if (!state.players.some((p) => p.auctionBought)) {
    shelveLowestAndReplace(state, rules);
  }
  beginTalentMarket(state, rules);
}

function resolveAuctionIfDone(state: GameState, rules: GameRules): void {
  const auction = state.phaseState as AuctionState;
  if (auction.propertyId === null) return;
  if (auction.biddersIn.length > 1) return;
  const winnerId = auction.biddersIn[0] ?? auction.highestBidder!;
  const winner = playerById(state, winnerId);
  const def = propertyDef(rules, auction.propertyId!);
  winner.cash -= auction.currentBid;
  winner.properties.push({ propertyId: auction.propertyId!, contracted: {} });
  winner.auctionBought = true;
  winner.auctionEligible = false;
  state.events.push({ type: "auction-won", propertyId: auction.propertyId!, amount: auction.currentBid, by: winnerId });
  state.events.push({ type: "property-sold", propertyId: auction.propertyId!, by: winnerId });
  log(state, `${winner.name} wins ${def.name} for ${auction.currentBid}.`);
  // Remove the sold property and refresh the market: draw a replacement, re-sort, heed the minimum rule.
  removeFromMarket(state, auction.propertyId!);
  drawReplacement(state, rules);
  sortMarket(state, rules);
  applyMinimumRule(state, rules);
  auction.propertyId = null;
  auction.currentBid = 0;
  auction.highestBidder = null;
  auction.biddersIn = [];
  checkAuctionEnd(state, rules);
  // If the starter won, the next eligible player offers; otherwise the starter may offer again
  // (nextEligibleOfferer naturally skips buyers and passers).
}

function applyTalentCommand(state: GameState, rules: GameRules, playerId: string, cmd: Command): string | null {
  const ts = state.phaseState as { index: number };
  const order = reverseTurnOrder(state);
  if (order[ts.index] !== playerId) return "it is not your turn";

  if (cmd.type === "buy-talent") {
    if (cmd.propertyId === undefined || cmd.track === undefined) return "missing propertyId or track";
    const p = playerById(state, playerId);
    const owned = p.properties.find((o) => o.propertyId === cmd.propertyId);
    if (!owned) return "you do not own that property";
    const def = propertyDef(rules, cmd.propertyId);
    if (cmd.track !== def.talentType) return `${def.name} requires ${rules.talentTracks[def.talentType].name}`;
    if (contractedCount(p, cmd.propertyId, cmd.track) >= storageFor(rules, cmd.propertyId)) {
      return "that property's contracts are full";
    }
    const price = trackPrice(state, rules, cmd.track);
    if (price === null) return "that track is out of talent";
    if (price > p.cash) return "you cannot afford that talent";
    p.cash -= price;
    owned.contracted[cmd.track] = (owned.contracted[cmd.track] ?? 0) + 1;
    const t = state.talent[cmd.track];
    for (let i = 0; i < t.slots.length; i++) {
      if (t.slots[i] > 0) {
        t.slots[i]--;
        break;
      }
    }
    state.events.push({ type: "talent-bought", track: cmd.track, price, by: playerId, propertyId: cmd.propertyId });
    log(state, `${p.name} contracts a ${rules.talentTracks[cmd.track].name} for ${def.name} at ${price}.`);
    return null;
  }

  if (cmd.type === "end-turn") {
    playerById(state, playerId).talentDone = true;
    ts.index += 1;
    while (ts.index < order.length && playerById(state, order[ts.index]).talentDone) ts.index++;
    if (ts.index >= order.length) beginExhibition(state, rules);
    return null;
  }

  return "unknown talent command";
}

function applyExhibitionCommand(state: GameState, rules: GameRules, playerId: string, cmd: Command): string | null {
  const es = state.phaseState as { index: number };
  const order = reverseTurnOrder(state);
  if (order[es.index] !== playerId) return "it is not your turn";

  if (cmd.type === "build") {
    if (cmd.cityId === undefined) return "missing cityId";
    const p = playerById(state, playerId);
    const cost = buildCost(state, rules, playerId, cmd.cityId);
    if (cost === null) return "you cannot build there";
    if (cost > p.cash) return "you cannot afford that theater";
    p.cash -= cost;
    const city = state.cities[cmd.cityId];
    const slot = city.owners.findIndex((o) => o === null);
    city.owners[slot] = playerId;
    p.theaters.push(cmd.cityId);
    state.events.push({ type: "theater-built", cityId: cmd.cityId, cost, by: playerId });
    log(state, `${p.name} builds a theater in ${cityName(rules, cmd.cityId)} for ${cost}.`);
    if (state.era === "silent" && p.theaters.length >= rules.talkiesTrigger) {
      state.talkiesPending = true;
    }
    applyMinimumRule(state, rules);
    return null;
  }

  if (cmd.type === "end-turn") {
    playerById(state, playerId).exhibitionDone = true;
    es.index += 1;
    while (es.index < order.length && playerById(state, order[es.index]).exhibitionDone) es.index++;
    if (es.index >= order.length) endExhibition(state, rules);
    return null;
  }

  return "unknown exhibition command";
}

function beginTalentMarket(state: GameState, rules: GameRules): void {
  if (state.eraCardDrawn) applyGoldenTransition(state, rules);
  state.phase = "talent-market";
  state.phaseState = { index: 0 };
  state.events.push({ type: "phase-changed", phase: "talent-market" });
  log(state, "The talent market opens.");
}

function beginExhibition(state: GameState, rules: GameRules): void {
  if (state.eraCardDrawn) applyGoldenTransition(state, rules);
  state.phase = "exhibition";
  state.phaseState = { index: 0 };
  state.events.push({ type: "phase-changed", phase: "exhibition" });
  log(state, "Exhibition begins — build your theaters.");
}

function endExhibition(state: GameState, rules: GameRules): void {
  const target = rules.endgameTarget[state.players.length];
  const reached = state.players.find((p) => p.theaters.length >= target);
  if (reached) {
    state.ended = true;
    state.winnerId = winnerOf(state, rules);
    state.events.push({ type: "game-ended", winnerId: state.winnerId!, reason: "target-reached" });
    log(state, `${reached.name} built the target number of theaters — the game ends after exhibition.`);
    return;
  }
  state.phase = "opening-night";
  state.phaseState = null;
  state.events.push({ type: "phase-changed", phase: "opening-night" });
  settle(state, rules);
}

/**
 * Run any automatic phases (opening night, moguls assemble) until the game
 * waits for a player action or ends.
 */
export function settle(state: GameState, rules: GameRules): void {
  for (let i = 0; i < 8; i++) {
    if (state.ended) return;
    if (state.phase === "opening-night") {
      runOpeningNight(state, rules);
      recomputeTurnOrder(state, rules);
      continue;
    }
    if (state.phase === "moguls-assemble") {
      if (state.eraCardDrawn) applyGoldenTransition(state, rules);
      if (state.round > 1) recomputeTurnOrder(state, rules);
      state.phase = "rights-auction";
      state.phaseState = {
        propertyId: null,
        currentBid: 0,
        highestBidder: null,
        biddersIn: [],
      } satisfies AuctionState;
      state.events.push({ type: "phase-changed", phase: "rights-auction" });
      return;
    }
    return;
  }
  throw new Error("settle did not converge");
}

export function applyCommand(state: GameState, rules: GameRules, playerId: string, cmd: Command): ActionResult {
  if (state.ended) return { ok: false, reason: "the game has ended" };
  if (cmd.stateVersion !== state.version) {
    return {
      ok: false,
      reason: `stale command: state is version ${state.version}, command targets ${cmd.stateVersion}`,
    };
  }
  settle(state, rules);
  if (state.ended) return { ok: false, reason: "the game has ended" };
  const active = activePlayerId(state, rules);
  if (active !== null && active !== playerId) return { ok: false, reason: "it is not your turn" };
  const reason = applyToPhase(state, rules, playerId, cmd);
  if (reason !== null) return { ok: false, reason };
  state.version += 1;
  return { ok: true, state };
}

function applyToPhase(state: GameState, rules: GameRules, playerId: string, cmd: Command): string | null {
  switch (state.phase) {
    case "rights-auction":
      return applyAuctionCommand(state, rules, playerId, cmd);
    case "talent-market":
      return applyTalentCommand(state, rules, playerId, cmd);
    case "exhibition":
      return applyExhibitionCommand(state, rules, playerId, cmd);
    case "opening-night":
      return "opening night requires no commands";
    case "moguls-assemble":
      return "waiting for the next round";
    default:
      return "unknown phase";
  }
}

/** Active actor for the current phase, or null when the phase needs no input. */
export function activePlayerId(state: GameState, rules: GameRules): string | null {
  settle(state, rules);
  switch (state.phase) {
    case "rights-auction": {
      const auction = state.phaseState as AuctionState;
      if (auction.propertyId !== null) {
        const bidders = auction.biddersIn;
        if (bidders.length <= 1) return null;
        const hi = bidders.indexOf(auction.highestBidder!);
        return bidders[(hi + 1) % bidders.length];
      }
      const idx = nextEligibleOfferer(state);
      return idx === -1 ? null : state.turnOrder[idx];
    }
    case "talent-market": {
      const ts = state.phaseState as { index: number };
      return reverseTurnOrder(state)[ts.index] ?? null;
    }
    case "exhibition": {
      const es = state.phaseState as { index: number };
      return reverseTurnOrder(state)[es.index] ?? null;
    }
    default:
      return null;
  }
}

/** Legal actions for a player in the current state (empty if not their turn). */
export function getLegalActions(state: GameState, rules: GameRules, playerId: string): Action[] {
  settle(state, rules);
  if (state.ended) return [];
  if (activePlayerId(state, rules) !== playerId) return [];
  const actions: Action[] = [];
  const base = { stateVersion: state.version } as const;

  switch (state.phase) {
    case "rights-auction": {
      const auction = state.phaseState as AuctionState;
      const p = playerById(state, playerId);
      if (auction.propertyId !== null) {
        const minBid = auction.currentBid + 1;
        if (minBid <= p.cash) {
          actions.push({
            label: `Bid ${minBid} on ${propertyDef(rules, auction.propertyId).name}`,
            kind: "auction",
            command: { ...base, type: "bid", propertyId: auction.propertyId, amount: minBid } as Command,
          });
        }
        actions.push({
          label: "Pass on this auction",
          kind: "pass",
          command: { ...base, type: "pass-auction" } as Command,
        });
        return actions;
      }
      for (const slot of state.market.current) {
        const def = propertyDef(rules, slot.propertyId);
        if (def.faceValue <= p.cash) {
          actions.push({
            label: `Auction ${def.name} (opening bid ${def.faceValue})`,
            kind: "auction",
            command: { ...base, type: "start-auction", propertyId: slot.propertyId, amount: def.faceValue } as Command,
          });
        }
      }
      if (state.round > 1) {
        actions.push({
          label: "Pass for this round",
          kind: "pass",
          command: { ...base, type: "pass-auction" } as Command,
        });
      }
      return actions;
    }
    case "talent-market": {
      const p = playerById(state, playerId);
      for (const owned of p.properties) {
        const def = propertyDef(rules, owned.propertyId);
        const price = trackPrice(state, rules, def.talentType);
        if (
          contractedCount(p, owned.propertyId, def.talentType) < storageFor(rules, owned.propertyId) &&
          price !== null &&
          price <= p.cash
        ) {
          actions.push({
            label: `Contract a ${rules.talentTracks[def.talentType].name} for ${def.name} (${price})`,
            kind: "talent",
            command: { ...base, type: "buy-talent", propertyId: owned.propertyId, track: def.talentType } as Command,
          });
        }
      }
      actions.push({
        label: "End your talent purchases",
        kind: "end-turn",
        command: { ...base, type: "end-turn" } as Command,
      });
      return actions;
    }
    case "exhibition": {
      const p = playerById(state, playerId);
      for (const cityId of Object.keys(state.cities)) {
        const cost = buildCost(state, rules, playerId, cityId);
        if (cost !== null && cost <= p.cash) {
          actions.push({
            label: `Build in ${cityName(rules, cityId)} (${cost})`,
            kind: "build",
            command: { ...base, type: "build", cityId } as Command,
          });
        }
      }
      actions.push({
        label: "End your building",
        kind: "end-turn",
        command: { ...base, type: "end-turn" } as Command,
      });
      return actions;
    }
    default:
      return [];
  }
}

/** Snapshot for a seat: full state plus the seat's current legal actions. */
export function buildSnapshot(state: GameState, rules: GameRules, seatId: string) {
  settle(state, rules);
  return {
    version: state.version,
    round: state.round,
    phase: state.phase,
    era: state.era,
    ended: state.ended,
    winnerId: state.winnerId,
    activeSeat: activePlayerId(state, rules),
    state,
    actions: getLegalActions(state, rules, seatId),
  };
}

export { litCapacity, propertyDef, buildCost, contractedCount };
