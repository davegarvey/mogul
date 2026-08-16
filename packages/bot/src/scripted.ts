import {
  buildCost,
  getLegalActions,
  playerById,
  propertyDef,
  trackPrice,
} from "@mogul/engine";
import type { Action, Command, GameRules, GameState, TalentTrackId } from "@mogul/engine";
import { mulberry32 } from "@mogul/engine";
import type { Bot } from "./game.js";
import { rankCurrentMarket, valueProperty } from "./auction.js";

const RESERVE = 15;

/**
 * Deterministic rule-based bot:
 * - auction: valuation-driven bids and offers (heuristics in auction.ts, tunable separately)
 * - talent: fill the biggest property's needs first, stock cheap tracks
 * - exhibition: greedy cheapest builds with a cash floor
 * - era-aware: holds a larger reserve in the silent era for talkies expansion
 */
export function scriptedBot(seed: number): Bot {
  const rand = mulberry32(seed);

  function cashFloor(state: GameState): number {
    return state.era === "silent" ? RESERVE : RESERVE - 7;
  }

  function pickOffering(rules: GameRules, state: GameState, playerId: string): Command | null {
    const p = playerById(state, playerId);
    const ranked = rankCurrentMarket(rules, state);
    const mustBuy = state.round === 1;
    for (const v of ranked) {
      if ((mustBuy || v.value > 2) && v.faceValue <= p.cash - cashFloor(state)) {
        return {
          type: "start-auction",
          propertyId: v.propertyId,
          amount: v.faceValue,
          stateVersion: state.version,
        };
      }
    }
    if (mustBuy) {
      // First round: buy whatever is affordable, least-bad first.
      const anyAffordable = ranked.find((v) => v.faceValue <= p.cash);
      if (anyAffordable) {
        return {
          type: "start-auction",
          propertyId: anyAffordable.propertyId,
          amount: anyAffordable.faceValue,
          stateVersion: state.version,
        };
      }
    }
    return { type: "pass-auction", stateVersion: state.version };
  }

  function pickBid(rules: GameRules, state: GameState, playerId: string, actions: Action[]): Command | null {
    const auction = state.phaseState as { propertyId: string | null; currentBid: number };
    if (auction.propertyId === null) return null;
    const p = playerById(state, playerId);
    const def = propertyDef(rules, auction.propertyId);
    const v = valueProperty(rules, state, def);
    const maxBid = Math.min(p.cash - cashFloor(state), v.maxBid);
    const bidAction = actions.find(
      (a) => a.command.type === "bid" && (a.command.amount ?? 0) <= maxBid,
    );
    if (bidAction) return bidAction.command;
    const pass = actions.find((a) => a.command.type === "pass-auction");
    return pass ? pass.command : null;
  }

  function pickTalent(rules: GameRules, state: GameState, playerId: string, actions: Action[]): Command | null {
    const p = playerById(state, playerId);
    if (p.cash < 8) return endTurn(state);
    // Rank owned properties by output; buy for the biggest that still needs talent.
    const candidates = actions
      .filter((a) => a.command.type === "buy-talent")
      .sort((a, b) => {
        const pa = propertyDef(rules, a.command.propertyId!);
        const pb = propertyDef(rules, b.command.propertyId!);
        return pb.output - pa.output;
      });
    if (candidates.length === 0) return endTurn(state);
    const pick = candidates[Math.floor(rand() * Math.min(candidates.length, 3))];
    return pick.command;
  }

  function pickBuild(rules: GameRules, state: GameState, playerId: string, actions: Action[]): Command | null {
    const p = playerById(state, playerId);
    const builds = actions
      .filter((a) => a.command.type === "build")
      .map((a) => ({
        action: a,
        cost: buildCost(state, rules, playerId, a.command.cityId!) ?? Infinity,
      }))
      .sort((a, b) => a.cost - b.cost);
    const floor = cashFloor(state);
    for (const { action, cost } of builds) {
      if (p.cash - cost >= floor) return action.command;
    }
    return endTurn(state);
  }

  function endTurn(state: GameState): Command {
    return { type: "end-turn", stateVersion: state.version };
  }

  return {
    chooseAction(state: GameState, rules: GameRules, playerId: string): Command | null {
      const actions = getLegalActions(state, rules, playerId);
      if (actions.length === 0) return null;
      if (state.phase === "rights-auction") {
        const auction = state.phaseState as { propertyId: string | null };
        if (auction.propertyId === null) {
          return pickOffering(rules, state, playerId);
        }
        return pickBid(rules, state, playerId, actions);
      }
      if (state.phase === "talent-market") {
        return pickTalent(rules, state, playerId, actions);
      }
      if (state.phase === "exhibition") {
        return pickBuild(rules, state, playerId, actions);
      }
      return actions[0].command;
    },
  };
}

export { trackPrice };
export type { TalentTrackId };
