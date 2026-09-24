import {
  buildCost,
  getLegalActions,
  playerById,
  propertyDef,
  propertyLitCapacity,
  trackPrice,
} from "@mogul/engine";
import type { Action, Command, GameRules, GameState, PlayerState, TalentTrackId } from "@mogul/engine";
import type { Bot } from "./game.js";
import { rankCurrentMarket, valueProperty } from "./auction.js";

const RESERVE = 15;

/**
 * Deterministic rule-based bot that budgets a round as a whole:
 * - auction: valuation-driven bids and offers (heuristics in auction.ts, tunable separately),
 *   never bidding into the money needed for a theatre and a unit of talent
 * - talent: buy only what the theatres it will have after this round's build can light,
 *   keeping the build money back
 * - exhibition: build whatever tonight's talent can light; build further ahead only above a
 *   cash floor
 * - era-aware: holds a larger floor in the silent era for talkies expansion
 */
export function scriptedBot(_seed: number): Bot {
  function cashFloor(state: GameState): number {
    return state.era === "silent" ? RESERVE : RESERVE - 7;
  }

  /** Cheapest theatre the player could build next, or null if none is reachable. */
  function nextBuildCost(rules: GameRules, state: GameState, playerId: string): number | null {
    let best: number | null = null;
    for (const c of rules.map.cities) {
      const cost = buildCost(state, rules, playerId, c.id);
      if (cost !== null && (best === null || cost < best)) best = cost;
    }
    return best;
  }

  /** Theatres the player's contracted talent can supply, ignoring how many theatres it has. */
  function talentCapacity(rules: GameRules, p: PlayerState): number {
    return p.properties.reduce((sum, o) => sum + propertyLitCapacity(rules, o), 0);
  }

  function totalOutput(rules: GameRules, p: PlayerState): number {
    return p.properties.reduce((sum, o) => sum + propertyDef(rules, o.propertyId).output, 0);
  }

  /** Cash to keep back during the auction: one more theatre and a unit of talent to light it. */
  function auctionReserve(rules: GameRules, state: GameState, playerId: string, unitTalent: number): number {
    return (nextBuildCost(rules, state, playerId) ?? 10) + unitTalent;
  }

  function pickOffering(rules: GameRules, state: GameState, playerId: string): Command | null {
    const p = playerById(state, playerId);
    const ranked = rankCurrentMarket(rules, state, p);
    const mustBuy = state.round === 1;
    for (const v of ranked) {
      const reserve = auctionReserve(rules, state, playerId, (v.talentPrice ?? 10) * propertyDef(rules, v.propertyId).perPicture);
      if ((mustBuy || v.value > 2) && v.faceValue <= p.cash - reserve) {
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
    const v = valueProperty(rules, state, def, p);
    const reserve = auctionReserve(rules, state, playerId, (v.talentPrice ?? 10) * def.perPicture);
    const maxBid = Math.min(p.cash - reserve, v.maxBid);
    const bidAction = actions.find(
      (a) => a.command.type === "bid" && (a.command.amount ?? 0) <= maxBid,
    );
    if (bidAction) return bidAction.command;
    const pass = actions.find((a) => a.command.type === "pass-auction");
    return pass ? pass.command : null;
  }

  function pickTalent(rules: GameRules, state: GameState, playerId: string, actions: Action[]): Command | null {
    const p = playerById(state, playerId);
    // Plan this round's builds first: one more theatre, two when cash is plentiful.
    const cost = nextBuildCost(rules, state, playerId);
    const planned = cost === null ? 0 : p.cash >= 60 ? 2 : 1;
    const target = Math.min(totalOutput(rules, p), p.theaters.length + planned);
    if (talentCapacity(rules, p) >= target) return endTurn(state);
    const reserve = planned * (cost ?? 0);
    // Buy for the biggest property that can still use more talent tonight.
    const candidates = actions
      .filter((a) => a.command.type === "buy-talent")
      .map((a) => {
        const owned = p.properties.find((o) => o.propertyId === a.command.propertyId)!;
        const def = propertyDef(rules, owned.propertyId);
        return { a, def, short: propertyLitCapacity(rules, owned) < def.output };
      })
      .filter((c) => c.short)
      .sort((x, y) => y.def.output - x.def.output);
    for (const c of candidates) {
      const price = trackPrice(state, rules, c.def.talentType);
      if (price !== null && p.cash - price >= reserve) return c.a.command;
    }
    return endTurn(state);
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
    // A theatre the talent can light tonight pays for itself at opening night, so build it
    // with any cash; building further ahead keeps the cash floor.
    const litTonight = p.theaters.length < talentCapacity(rules, p);
    const floor = litTonight ? 0 : cashFloor(state);
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
