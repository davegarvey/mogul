import { applyGoldenTransition, applyMarketUpdate, applyTalkiesTransition } from "../market.js";
import { incomeFor, litCapacity, log, playerById, propertyDef } from "../state.js";
import type { GameRules, GameState, OwnedProperty, TalentTrackId } from "../types.js";

/** Theaters lit per property this night (greedy, deterministic), consuming contracted talent. */
export function lightProperty(
  rules: GameRules,
  owned: OwnedProperty,
  remaining: number,
): { lit: number; consumed: number } {
  const d = propertyDef(rules, owned.propertyId);
  const have = owned.contracted[d.talentType] ?? 0;
  const cap = Math.min(d.output, Math.floor(have / d.perPicture));
  const lit = Math.min(cap, remaining);
  const consumed = lit * d.perPicture;
  owned.contracted[d.talentType] = have - consumed;
  return { lit, consumed };
}

/** Total talent on a track (for the log). */
export function trackSupply(state: GameState, track: TalentTrackId): number {
  return state.talent[track].slots.reduce((a, b) => a + b, 0);
}

/** Restock a talent track for the era: fill most expensive slots first, up to max. */
export function restockTrack(state: GameState, rules: GameRules, track: TalentTrackId): void {
  const def = rules.talentTracks[track];
  const amount = def.restock[state.era];
  const t = state.talent[track];
  const order = def.slots
    .map((s, i) => ({ i, max: s.max }))
    .sort((a, b) => def.slots[b.i].price - def.slots[a.i].price);
  let remaining = amount;
  for (const { i, max } of order) {
    if (remaining <= 0) break;
    const add = Math.min(max - t.slots[i], remaining);
    t.slots[i] += add;
    remaining -= add;
  }
}

/**
 * Run the full opening night: light theaters, pay income, consume talent,
 * restock talent, update the market, and apply era transitions.
 * Returns income per player.
 */
export function runOpeningNight(state: GameState, rules: GameRules): Record<string, number> {
  // Talkies begin at the start of the opening night phase if triggered during exhibition.
  if (state.talkiesPending && state.era === "silent") {
    applyTalkiesTransition(state, rules);
  }

  const income: Record<string, number> = {};
  for (const p of state.players) {
    let remaining = p.theaters.length;
    let litTotal = 0;
    for (const owned of p.properties) {
      if (remaining <= 0) break;
      const { lit } = lightProperty(rules, owned, remaining);
      litTotal += lit;
      remaining -= lit;
    }
    const incomeAmount = incomeFor(rules, litTotal);
    p.cash += incomeAmount;
    p.litLastNight = litTotal;
    income[p.id] = incomeAmount;
    log(state, `${p.name} lights ${litTotal} theater(s) and earns ${incomeAmount}.`);
  }
  state.events.push({ type: "opening-night", lit: Object.fromEntries(state.players.map((p) => [p.id, p.litLastNight])), income });

  for (const track of Object.keys(rules.talentTracks) as TalentTrackId[]) {
    restockTrack(state, rules, track);
  }

  applyMarketUpdate(state, rules);

  // Era card drawn during the round: golden age applies at the next phase boundary.
  if (state.eraCardDrawn) {
    applyGoldenTransition(state, rules);
  }

  // Start the next round.
  state.round += 1;
  for (const p of state.players) {
    p.auctionBought = false;
    p.auctionPassed = false;
    p.auctionEligible = true;
    p.talentDone = false;
    p.exhibitionDone = false;
  }
  state.phase = "moguls-assemble";
  state.phaseState = null;
  state.events.push({ type: "phase-changed", phase: "moguls-assemble" });
  return income;
}

/** Recompute turn order: most theaters built, ties by highest-output property. */
export function recomputeTurnOrder(state: GameState, rules: GameRules): void {
  const order = [...state.players].sort((a, b) => {
    if (b.theaters.length !== a.theaters.length) return b.theaters.length - a.theaters.length;
    const hb = a.properties.reduce((m, o) => Math.max(m, propertyDef(rules, o.propertyId).output), 0);
    const ha = b.properties.reduce((m, o) => Math.max(m, propertyDef(rules, o.propertyId).output), 0);
    if (ha !== hb) return ha - hb;
    return a.id.localeCompare(b.id);
  });
  state.turnOrder = order.map((p) => p.id);
}

export function reverseTurnOrder(state: GameState): string[] {
  return [...state.turnOrder].reverse();
}

export function winnerOf(state: GameState, rules: GameRules): string | null {
  if (!state.ended) return null;
  const sorted = [...state.players].sort((a, b) => {
    const la = litCapacity(rules, a);
    const lb = litCapacity(rules, b);
    if (lb !== la) return lb - la;
    if (b.cash !== a.cash) return b.cash - a.cash;
    return b.theaters.length - a.theaters.length;
  });
  return sorted[0].id;
}

export { playerById };
