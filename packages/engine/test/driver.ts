import { DEFAULT_RULES, applyCommand, activePlayerId, createGame, getLegalActions } from "../src/index.js";
import type { Action, Command, GameRules, GameState } from "../src/index.js";

export function mkGame(seed = 42, count = 4): GameState {
  const names = ["Alice", "Bob", "Cara", "Dave"];
  return createGame(
    names.slice(0, count).map((name, i) => ({ id: String.fromCharCode(97 + i), name })),
    DEFAULT_RULES,
    seed,
  );
}

/** Apply a command as the active player (must be theirs). */
export function act(state: GameState, cmd: Partial<Command> & { type: Command["type"] }, playerId?: string): string | null {
  const pid = playerId ?? activePlayerId(state, DEFAULT_RULES)!;
  const result = applyCommand(state, DEFAULT_RULES, pid, {
    ...cmd,
    stateVersion: state.version,
  } as Command);
  return result.ok ? null : result.reason;
}

/** Pick a legal action by predicate (or first), execute it for the active player. */
export function actBy(
  state: GameState,
  pick: (a: Action[]) => Action | undefined = (a) => a[0],
): string | null {
  const pid = activePlayerId(state, DEFAULT_RULES);
  if (pid === null) return "no active player";
  const actions = getLegalActions(state, DEFAULT_RULES, pid);
  const chosen = pick(actions);
  if (!chosen) return "no action available";
  return act(state, chosen.command, pid);
}

/** Drive through the talent market with end-turn for every player. */
export function driveTalent(state: GameState): void {
  while (state.phase === "talent-market" && !state.ended) {
    act(state, { type: "end-turn" });
  }
}

/** Drive through the exhibition with end-turn for every player. */
export function driveExhibition(state: GameState): void {
  while (state.phase === "exhibition" && !state.ended) {
    act(state, { type: "end-turn" });
  }
}

/** Round 1: everyone buys a property at face value, then skip talent/exhibition. */
export function driveRound1(state: GameState): void {
  actBy(state); // settles moguls-assemble -> rights-auction
  while (state.phase === "rights-auction") {
    actBy(state);
  }
  driveTalent(state);
  driveExhibition(state);
}

export { DEFAULT_RULES, activePlayerId };
export type { Action, GameRules, GameState, Command };
