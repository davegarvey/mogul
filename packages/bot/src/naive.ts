import { getLegalActions } from "@mogul/engine";
import type { Command, GameRules, GameState } from "@mogul/engine";
import { mulberry32 } from "@mogul/engine";
import type { Bot } from "./game.js";

/** Minimal deterministic bot: always submits a legal move, chosen at random. */
export function naiveBot(seed: number): Bot {
  const rand = mulberry32(seed);
  return {
    chooseAction(state: GameState, rules: GameRules, playerId: string): Command | null {
      const actions = getLegalActions(state, rules, playerId);
      if (actions.length === 0) return null;
      return actions[Math.floor(rand() * actions.length)].command;
    },
  };
}
