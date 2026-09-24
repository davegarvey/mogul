/**
 * Stage view models: pure functions from a snapshot to what each phase stage shows
 * and which legal actions its controls carry. No DOM here, so the matching of legal
 * actions to on-screen controls can be tested headless.
 */
import { contractedCount, playerById, propertyDef, storageFor } from "@mogul/engine";
import type { Action, AuctionState, GameRules, GameState, Phase, TalentTrackId } from "@mogul/engine";

export type StageId = "auction" | "talent" | "map";

/** The stage a phase shows; automatic phases keep whatever stage was showing. */
export function stageForPhase(phase: Phase, previous: StageId): StageId {
  switch (phase) {
    case "rights-auction":
      return "auction";
    case "talent-market":
      return "talent";
    case "exhibition":
      return "map";
    default:
      return previous;
  }
}

export const STEPS: { phase: Phase; label: string }[] = [
  { phase: "rights-auction", label: "Rights auction" },
  { phase: "talent-market", label: "Talent" },
  { phase: "exhibition", label: "Build" },
  { phase: "opening-night", label: "Opening night" },
];

const find = (actions: Action[], type: string, pred: (a: Action) => boolean = () => true): Action | undefined =>
  actions.find((a) => a.command.type === type && pred(a));

// ---------------- auction ----------------

export interface AuctionCard {
  propertyId: string;
  name: string;
  faceValue: number;
  output: number;
  talentType: TalentTrackId;
  talentName: string;
  future: boolean;
  onBlock: boolean;
  /** Legal start-auction action for this card, when the viewer may open it now. */
  start?: Action;
}

export interface AuctionModel {
  cards: AuctionCard[];
  open: {
    propertyId: string;
    name: string;
    output: number;
    talentName: string;
    currentBid: number;
    highestBidder: string | null;
    biddersIn: string[];
  } | null;
  /** The viewer's bid options in an open auction: range and the legal bid to substitute into. */
  bid: { min: number; max: number; action: Action } | null;
  dropOut?: Action;
  passRound?: Action;
}

export function auctionModel(state: GameState, rules: GameRules, actions: Action[], viewerId: string | null): AuctionModel {
  const auction = state.phase === "rights-auction" ? (state.phaseState as AuctionState) : null;
  const openId = auction?.propertyId ?? null;
  const card = (propertyId: string, future: boolean): AuctionCard => {
    const def = propertyDef(rules, propertyId);
    return {
      propertyId,
      name: def.name,
      faceValue: def.faceValue,
      output: def.output,
      talentType: def.talentType,
      talentName: rules.talentTracks[def.talentType].name,
      future,
      onBlock: propertyId === openId,
      start: future ? undefined : find(actions, "start-auction", (a) => a.command.propertyId === propertyId),
    };
  };
  const cards = [
    ...state.market.current.map((slot) => card(slot.propertyId, false)),
    ...state.market.future.map((slot) => card(slot.propertyId, true)),
  ];

  let open: AuctionModel["open"] = null;
  if (auction && openId) {
    const def = propertyDef(rules, openId);
    open = {
      propertyId: openId,
      name: def.name,
      output: def.output,
      talentName: rules.talentTracks[def.talentType].name,
      currentBid: auction.currentBid,
      highestBidder: auction.highestBidder,
      biddersIn: [...auction.biddersIn],
    };
  }

  const bidAction = find(actions, "bid");
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const bid =
    bidAction && viewer && bidAction.command.amount !== undefined
      ? { min: bidAction.command.amount, max: viewer.cash, action: bidAction }
      : null;
  const pass = find(actions, "pass-auction");
  return {
    cards,
    open,
    bid,
    dropOut: open ? pass : undefined,
    passRound: open ? undefined : pass,
  };
}

/** A copy of a legal bid or start-auction command with a different amount. */
export function withAmount(action: Action, amount: number): Action["command"] {
  return { ...action.command, amount };
}

// ---------------- talent ----------------

export interface TalentTrackView {
  id: TalentTrackId;
  name: string;
  slots: { price: number; count: number }[];
  supply: number;
}

export interface TalentPropertyView {
  propertyId: string;
  name: string;
  track: TalentTrackId;
  trackName: string;
  output: number;
  /** Units needed for a full opening night, before counting contracts. */
  fullNight: number;
  contracted: number;
  storage: number;
  /** Units still missing for a full night (never negative). */
  short: number;
  /** Most units the viewer can buy now (0 when not their turn or nothing is buyable). */
  maxBuy: number;
  buy?: Action;
}

export interface TalentModel {
  tracks: TalentTrackView[];
  properties: TalentPropertyView[];
  endTurn?: Action;
}

/** Total price of buying n units from a track now, cheapest slots first; null if supply runs out. */
export function talentCost(state: GameState, rules: GameRules, track: TalentTrackId, n: number): number | null {
  const counts = [...state.talent[track].slots];
  const prices = rules.talentTracks[track].slots.map((s) => s.price);
  let total = 0;
  for (let unit = 0; unit < n; unit++) {
    const i = counts.findIndex((c) => c > 0);
    if (i < 0) return null;
    counts[i]--;
    total += prices[i];
  }
  return total;
}

export function talentModel(state: GameState, rules: GameRules, actions: Action[], viewerId: string | null): TalentModel {
  const tracks = (Object.keys(state.talent) as TalentTrackId[]).map((id) => {
    const def = rules.talentTracks[id];
    const slots = def.slots.map((s, i) => ({ price: s.price, count: state.talent[id].slots[i] }));
    return { id, name: def.name, slots, supply: slots.reduce((a, s) => a + s.count, 0) };
  });

  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const properties: TalentPropertyView[] = (viewer?.properties ?? []).map((owned) => {
    const def = propertyDef(rules, owned.propertyId);
    const contracted = contractedCount(viewer!, owned.propertyId, def.talentType);
    const storage = storageFor(rules, owned.propertyId);
    const fullNight = def.output * def.perPicture;
    const buy = find(actions, "buy-talent", (a) => a.command.propertyId === owned.propertyId);
    let maxBuy = 0;
    if (buy) {
      const headroom = storage - contracted;
      while (maxBuy < headroom) {
        const cost = talentCost(state, rules, def.talentType, maxBuy + 1);
        if (cost === null || cost > viewer!.cash) break;
        maxBuy++;
      }
    }
    return {
      propertyId: owned.propertyId,
      name: def.name,
      track: def.talentType,
      trackName: rules.talentTracks[def.talentType].name,
      output: def.output,
      fullNight,
      contracted,
      storage,
      short: Math.max(0, fullNight - contracted),
      maxBuy,
      buy: maxBuy > 0 ? buy : undefined,
    };
  });

  return {
    tracks,
    properties,
    endTurn: state.phase === "talent-market" ? find(actions, "end-turn") : undefined,
  };
}

// ---------------- build ----------------

export interface BuildModel {
  buildable: Set<string>;
  endTurn?: Action;
}

export function buildModel(state: GameState, actions: Action[]): BuildModel {
  const buildable = new Set<string>();
  for (const a of actions) {
    if (a.command.type === "build" && a.command.cityId !== undefined) buildable.add(a.command.cityId);
  }
  return { buildable, endTurn: state.phase === "exhibition" ? find(actions, "end-turn") : undefined };
}

// ---------------- opening night summary ----------------

export interface OpeningNightSummary {
  /** 1-based count of opening nights so far; identifies this summary for dismissal. */
  night: number;
  rows: { playerId: string; name: string; lit: number; income: number }[];
}

export function openingNightSummary(state: GameState): OpeningNightSummary | null {
  let night = 0;
  let last: { lit: Record<string, number>; income: Record<string, number> } | null = null;
  for (const e of state.events) {
    if (e.type === "opening-night") {
      night++;
      last = e;
    }
  }
  if (!last) return null;
  const rows = state.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    lit: last!.lit[p.id] ?? 0,
    income: last!.income[p.id] ?? 0,
  }));
  return { night, rows };
}

// ---------------- action coverage ----------------

/** Command types each stage renders as controls on its objects. */
const HANDLED: Record<StageId, string[]> = {
  auction: ["start-auction", "bid", "pass-auction"],
  talent: ["buy-talent", "end-turn"],
  map: ["build", "end-turn"],
};

/**
 * Legal actions the stage does not render as a control. The client shows these in a
 * fallback list so that no legal move is ever hidden.
 */
export function unmatchedActions(stage: StageId, actions: Action[]): Action[] {
  return actions.filter((a) => !HANDLED[stage].includes(a.command.type));
}

export function playerName(state: GameState, id: string | null): string {
  if (id === null) return "";
  return playerById(state, id)?.name ?? id;
}
