import { DEFAULT_RULES } from "@mogul/engine";
import type { GameRules } from "@mogul/engine";
import { playGame, winnerName } from "./game.js";
import { scriptedBot } from "./scripted.js";
import { naiveBot } from "./naive.js";

export interface HarnessResult {
  games: number;
  wins: Record<string, number>;
  incomplete: number;
  avgRounds: number;
  endEras: Record<string, number>;
  avgLitAtEnd: Record<string, number>;
  avgCashAtEnd: Record<string, number>;
  endgameReachedPct: number;
  gamesDetail: { seed: number; winner: string | null; rounds: number; era: string; lit: number; cash: number }[];
}

export function runHarness(
  rules: GameRules = DEFAULT_RULES,
  games = 20,
  botFactory: (seed: number) => ReturnType<typeof scriptedBot> = scriptedBot,
): HarnessResult {
  const wins: Record<string, number> = {};
  const endEras: Record<string, number> = {};
  const litTotal: Record<string, number> = {};
  const cashTotal: Record<string, number> = {};
  const detail: HarnessResult["gamesDetail"] = [];
  let incomplete = 0;
  let roundsTotal = 0;

  for (let seed = 1; seed <= games; seed++) {
    const bots = ["Red", "Gold", "Blue", "Green"].map((_, i) => botFactory(seed * 10 + i));
    const { state, rounds, incomplete: inc } = playGame(rules, bots, seed);
    if (inc) incomplete++;
    roundsTotal += rounds;
    endEras[state.era] = (endEras[state.era] ?? 0) + 1;
    const winner = winnerName(state);
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    for (const p of state.players) {
      litTotal[p.name] = (litTotal[p.name] ?? 0) + p.theaters.length;
      cashTotal[p.name] = (cashTotal[p.name] ?? 0) + p.cash;
    }
    const target = rules.endgameTarget[state.players.length];
    const reached = state.players.some((p) => p.theaters.length >= target);
    detail.push({
      seed,
      winner,
      rounds,
      era: state.era,
      lit: state.players[0].theaters.length,
      cash: state.players[0].cash,
    });
    void reached;
  }

  const names = ["Red", "Gold", "Blue", "Green"];
  return {
    games,
    wins,
    incomplete,
    avgRounds: Math.round((roundsTotal / games) * 10) / 10,
    endEras,
    avgLitAtEnd: Object.fromEntries(names.map((n) => [n, Math.round((litTotal[n] / games) * 10) / 10])),
    avgCashAtEnd: Object.fromEntries(names.map((n) => [n, Math.round((cashTotal[n] / games) * 10) / 10])),
    endgameReachedPct: Math.round(((games - incomplete) / games) * 100),
    gamesDetail: detail,
  };
}

function report(r: HarnessResult): void {
  console.log(`Games: ${r.games}  Incomplete: ${r.incomplete}  Avg rounds: ${r.avgRounds}`);
  console.log(`Endgame reached: ${r.endgameReachedPct}%  End eras: ${JSON.stringify(r.endEras)}`);
  console.log(`Wins: ${JSON.stringify(r.wins)}`);
  console.log(`Avg theaters at end: ${JSON.stringify(r.avgLitAtEnd)}`);
  console.log(`Avg cash at end: ${JSON.stringify(r.avgCashAtEnd)}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("harness.ts")) {
  const games = Number(process.argv[2] ?? 20);
  const which = process.argv[3] ?? "scripted";
  const r = which === "naive" ? runHarness(DEFAULT_RULES, games, (s) => naiveBot(s)) : runHarness(DEFAULT_RULES, games);
  report(r);
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/mogul-harness.json", JSON.stringify(r, null, 2));
}

export function runNaiveHarness(rules: GameRules, games: number): HarnessResult {
  return runHarness(rules, games, (s) => naiveBot(s));
}
