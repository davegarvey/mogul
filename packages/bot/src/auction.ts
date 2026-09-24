import { propertyDef, trackPrice } from "@mogul/engine";
import type { GameRules, GameState, PlayerState, PropertyDef, TalentTrackId } from "@mogul/engine";

/** Theatres beyond today's network a property is valued for: what a studio can grow into soon. */
const GROWTH_HORIZON = 3;

/**
 * Separable auction heuristics: how much a property is worth to a player
 * right now. Tuned independently of the rest of the bot.
 */
export interface AuctionValuation {
  propertyId: string;
  faceValue: number;
  output: number;
  talentType: TalentTrackId;
  talentPrice: number | null;
  nightlyCost: number;
  nightlyIncome: number;
  /** Theatres this property can realistically light soon for this player. */
  usefulOutput: number;
  /** Rough net value: income potential minus talent burn minus the asking price. */
  value: number;
  /** Highest bid the player should consider (cash reserve excluded). */
  maxBid: number;
}

/** Marginal income per theater at a given lit count (diminishing returns of the table). */
export function marginalIncome(rules: GameRules, lit: number): number {
  const table = rules.incomeTable;
  const i = Math.min(lit, table.length - 2);
  return table[i + 1] - table[i];
}

/**
 * Value a property for a player. Output only earns money in theatres the player has, so a
 * property is valued for the theatres the player can light soon (today's network plus a few
 * builds), not its full output. A studio with no theatres gains little from a 10-theatre saga.
 */
export function valueProperty(
  rules: GameRules,
  state: GameState,
  def: PropertyDef,
  player?: PlayerState,
): AuctionValuation {
  const talentPrice = trackPrice(state, rules, def.talentType);
  const usefulOutput = player ? Math.min(def.output, player.theaters.length + GROWTH_HORIZON) : def.output;
  const nightlyIncome = usefulOutput * 6; // rough average marginal income per theater
  const nightlyCost = usefulOutput * def.perPicture * (talentPrice ?? 10);
  const net = nightlyIncome - nightlyCost;
  const value = net - def.faceValue * 0.8;
  // Pay at most face value plus half of one good night's net takings.
  const maxBid = Math.max(def.faceValue, Math.round(def.faceValue + Math.max(0, net) * 0.5));
  return {
    propertyId: def.id,
    faceValue: def.faceValue,
    output: def.output,
    talentType: def.talentType,
    talentPrice,
    nightlyCost,
    nightlyIncome,
    usefulOutput,
    value,
    maxBid,
  };
}

/** Rank the current market for the player, best first. */
export function rankCurrentMarket(rules: GameRules, state: GameState, player?: PlayerState): AuctionValuation[] {
  return state.market.current
    .map((s) => valueProperty(rules, state, propertyDef(rules, s.propertyId), player))
    .sort((a, b) => b.value - a.value);
}
