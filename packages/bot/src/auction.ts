import { propertyDef, trackPrice } from "@mogul/engine";
import type { GameRules, GameState, PropertyDef, TalentTrackId } from "@mogul/engine";

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

export function valueProperty(
  rules: GameRules,
  state: GameState,
  def: PropertyDef,
): AuctionValuation {
  const talentPrice = trackPrice(state, rules, def.talentType);
  const nightlyIncome = def.output * 6; // rough average marginal income per theater
  const nightlyCost = def.output * def.perPicture * (talentPrice ?? 10);
  const value = nightlyIncome - nightlyCost - def.faceValue * 0.8;
  const maxBid = Math.max(def.faceValue, Math.round(nightlyIncome - nightlyCost + def.faceValue * 0.2));
  return {
    propertyId: def.id,
    faceValue: def.faceValue,
    output: def.output,
    talentType: def.talentType,
    talentPrice,
    nightlyCost,
    nightlyIncome,
    value,
    maxBid,
  };
}

/** Rank the current market for the player, best first. */
export function rankCurrentMarket(rules: GameRules, state: GameState): AuctionValuation[] {
  return state.market.current
    .map((s) => valueProperty(rules, state, propertyDef(rules, s.propertyId)))
    .sort((a, b) => b.value - a.value);
}
