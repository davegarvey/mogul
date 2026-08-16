import { log, playerById, propertyDef } from "./state.js";import type { GameRules, GameState } from "./types.js";

/** Pop the top card of the deck. Returns the property id, or null if the era card (or empty). */
function drawTop(state: GameState, rules: GameRules): string | null {
  while (state.market.deck.length > 0) {
    const card = state.market.deck.shift()!;
    if (card === rules.eraCardId) {
      if (!state.eraCardDrawn) {
        state.eraCardDrawn = true;
        log(state, "The era card is drawn — the golden age approaches.");
      }
      return null;
    }
    return card;
  }
  return null;
}

export function sortMarket(state: GameState, rules: GameRules): void {
  const all = [...state.market.current, ...state.market.future].map((s) => s.propertyId);
  const sorted = [...all].sort(
    (a, b) =>
      propertyDef(rules, a).faceValue - propertyDef(rules, b).faceValue ||
      a.localeCompare(b),
  );
  if (state.era === "golden") {
    state.market.current = sorted.map((propertyId) => ({ propertyId }));
    state.market.future = [];
  } else {
    state.market.current = sorted.slice(0, 4).map((propertyId) => ({ propertyId }));
    state.market.future = sorted.slice(4).map((propertyId) => ({ propertyId }));
  }
}

/** Draw a replacement into the market and re-sort. Returns the drawn property id, if any. */
export function drawReplacement(state: GameState, rules: GameRules): string | null {
  const card = drawTop(state, rules);
  if (card) {
    const m = state.market;
    (m.future ?? []).push({ propertyId: card });
    sortMarket(state, rules);
  }
  return card;
}

export function removeFromMarket(state: GameState, propertyId: string): void {
  const m = state.market;
  m.current = m.current.filter((s) => s.propertyId !== propertyId);
  m.future = m.future.filter((s) => s.propertyId !== propertyId);
}

/** Minimum rule: any market property with output <= leader's built theaters is removed and replaced. */
export function applyMinimumRule(state: GameState, rules: GameRules): void {
  let leaderBuilt = 0;
  for (const p of state.players) leaderBuilt = Math.max(leaderBuilt, p.theaters.length);
  let removed = true;
  while (removed) {
    removed = false;
    const all = [...state.market.current, ...state.market.future];
    const dud = all.find((s) => propertyDef(rules, s.propertyId).output <= leaderBuilt);
    if (dud) {
      removeFromMarket(state, dud.propertyId);
      state.events.push({ type: "property-shelved", propertyId: dud.propertyId, reason: "minimum-rule" });
      log(state, `The ${propertyDef(rules, dud.propertyId).name} is too small for the leader's network and is shelved.`);
      drawReplacement(state, rules);
      removed = true;
    }
  }
  sortMarket(state, rules);
}

/** Talkies transition: remove the lowest-valued market property and replace it. */
export function applyTalkiesTransition(state: GameState, rules: GameRules): void {
  state.era = "talkies";
  state.events.push({ type: "era-changed", era: "talkies" });
  log(state, "The talkies begin! The market shelves its weakest property.");
  const all = [...state.market.current, ...state.market.future].sort(
    (a, b) => propertyDef(rules, a.propertyId).faceValue - propertyDef(rules, b.propertyId).faceValue,
  );
  if (all.length > 0) {
    removeFromMarket(state, all[0].propertyId);
    state.events.push({ type: "property-shelved", propertyId: all[0].propertyId, reason: "talkies" });
    log(state, `The ${propertyDef(rules, all[0].propertyId).name} is shelved for the talkies era.`);
    drawReplacement(state, rules);
  }
  sortMarket(state, rules);
  applyMinimumRule(state, rules);
}

/** Golden age transition: remove the lowest-valued property and the era card, no replacements. */
export function applyGoldenTransition(state: GameState, rules: GameRules): void {
  state.era = "golden";
  state.eraCardDrawn = false;
  state.talkiesPending = false;
  state.events.push({ type: "era-changed", era: "golden" });
  log(state, "The golden age dawns! The market shrinks.");
  const all = [...state.market.current, ...state.market.future].sort(
    (a, b) => propertyDef(rules, a.propertyId).faceValue - propertyDef(rules, b.propertyId).faceValue,
  );
  if (all.length > 0) {
    removeFromMarket(state, all[0].propertyId);
    state.events.push({ type: "property-shelved", propertyId: all[0].propertyId, reason: "golden" });
    log(state, `The ${propertyDef(rules, all[0].propertyId).name} is shelved as the market shrinks.`);
  }
  sortMarket(state, rules);
  applyMinimumRule(state, rules);
}

/** Opening-night market update: move the highest future-market property to the deck bottom, draw a replacement. */
export function applyMarketUpdate(state: GameState, rules: GameRules): void {
  const m = state.market;
  if (m.future.length > 0) {
    const highest = m.future[m.future.length - 1];
    m.future = m.future.slice(0, -1);
    m.deck.push(highest.propertyId);
  }
  if (state.era === "golden") {
    // Remove the lowest current-market property and draw a replacement.
    const all = m.current.sort(
      (a, b) => propertyDef(rules, a.propertyId).faceValue - propertyDef(rules, b.propertyId).faceValue,
    );
    if (all.length > 0) {
      removeFromMarket(state, all[0].propertyId);
      state.events.push({ type: "property-shelved", propertyId: all[0].propertyId, reason: "golden-update" });
    }
    drawReplacement(state, rules);
  } else {
    drawReplacement(state, rules);
  }
  sortMarket(state, rules);
  applyMinimumRule(state, rules);
}

/** Leader is the first player in turn order. */
export function leader(state: GameState): string {
  return state.turnOrder[0];
}

export function leaderBuilt(state: GameState): number {
  return playerById(state, leader(state)).theaters.length;
}

/** No-sale rule: remove the lowest-valued market property and draw a replacement. */
export function shelveLowestAndReplace(state: GameState, rules: GameRules): void {
  const all = [...state.market.current, ...state.market.future].sort(
    (a, b) => propertyDef(rules, a.propertyId).faceValue - propertyDef(rules, b.propertyId).faceValue,
  );
  if (all.length === 0) return;
  const lowest = all[0].propertyId;
  removeFromMarket(state, lowest);
  state.events.push({ type: "property-shelved", propertyId: lowest, reason: "no-sale" });
  log(state, `No property sold — the ${propertyDef(rules, lowest).name} is removed and replaced.`);
  drawReplacement(state, rules);
  sortMarket(state, rules);
  applyMinimumRule(state, rules);
}
