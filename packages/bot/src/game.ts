import {
  activePlayerId,
  applyCommand,
  buildSnapshot,
  createGame,
  getLegalActions,
  playerById,
  propertyDef,
  settle,
  trackPrice,
} from "@mogul/engine";
import type { Action, Command, GameRules, GameState } from "@mogul/engine";

export interface Bot {
  /** Choose a legal command for the player's turn, or null to decline (server then uses fallbacks). */
  chooseAction(state: GameState, rules: GameRules, playerId: string): Command | null;
}

export function createGameForBot(rules: GameRules, seed: number): GameState {
  const names = ["Red", "Gold", "Blue", "Green"];
  return createGame(
    names.map((name, i) => ({ id: `p${i}`, name })),
    rules,
    seed,
  );
}

export function playOneTurn(state: GameState, rules: GameRules, bot: Bot): string | null {
  const pid = activePlayerId(state, rules);
  if (pid === null) return null;
  const cmd = bot.chooseAction(state, rules, pid);
  if (cmd === null) return null;
  const res = applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
  return res.ok ? null : res.reason;
}

export function playGame(
  rules: GameRules,
  bots: Bot[],
  seed: number,
  maxRounds = 40,
): { state: GameState; rounds: number; incomplete: boolean } {
  const state = createGameForBot(rules, seed);
  for (let r = 0; r < maxRounds && !state.ended; r++) {
    let guard = 0;
    while (!state.ended && guard++ < 400) {
      const before = state.version;
      const pid = activePlayerId(state, rules);
      if (pid === null) break;
      const bot = bots[state.players.findIndex((p) => p.id === pid)];
      const cmd = bot.chooseAction(state, rules, pid);
      if (cmd === null) break;
      applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
      if (state.version === before) throw new Error("game stalled");
    }
  }
  const incomplete = !state.ended;
  return { state, rounds: state.round, incomplete };
}

export function winnerName(state: GameState): string | null {
  if (!state.winnerId) return null;
  return playerById(state, state.winnerId).name;
}

export { activePlayerId, applyCommand, buildSnapshot, getLegalActions, propertyDef, settle, trackPrice };
export type { Action, Command, GameRules, GameState };
