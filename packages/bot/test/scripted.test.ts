import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, activePlayerId, applyCommand, createGame } from "@mogul/engine";
import { createGameForBot, scriptedBot, naiveBot } from "../src/index.js";

describe("scripted bot legality", () => {
  it("always submits a legal move in every phase", () => {
    const rules = DEFAULT_RULES;
    for (let seed = 1; seed <= 5; seed++) {
      const state = createGameForBot(rules, seed);
      const bots = ["Red", "Gold", "Blue", "Green"].map((_, i) => scriptedBot(seed * 10 + i));
      let rejections = 0;
      let guard = 0;
      while (!state.ended && guard++ < 2000) {
        const pid = activePlayerId(state, rules);
        if (pid === null) break;
        const bot = bots[state.players.findIndex((p) => p.id === pid)];
        const cmd = bot.chooseAction(state, rules, pid);
        if (cmd === null) break;
        const res = applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
        if (!res.ok) rejections++;
      }
      expect(rejections).toBe(0);
    }
  });

  it("deterministic given the same seed", () => {
    const rules = DEFAULT_RULES;
    const run = (seed: number) => {
      const state = createGameForBot(rules, seed);
      const bots = ["Red", "Gold", "Blue", "Green"].map((_, i) => scriptedBot(seed * 10 + i));
      let guard = 0;
      while (!state.ended && guard++ < 2000) {
        const pid = activePlayerId(state, rules);
        if (pid === null) break;
        const bot = bots[state.players.findIndex((p) => p.id === pid)];
        const cmd = bot.chooseAction(state, rules, pid);
        if (cmd === null) break;
        applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
      }
      return { winner: state.winnerId, rounds: state.round };
    };
    expect(run(7)).toEqual(run(7));
  });

  it("naive bot also plays legally", () => {
    const rules = DEFAULT_RULES;
    const state = createGameForBot(rules, 3);
    const bots = ["Red", "Gold", "Blue", "Green"].map((_, i) => naiveBot(i + 1));
    let rejections = 0;
    let guard = 0;
    while (!state.ended && guard++ < 4000) {
      const pid = activePlayerId(state, rules);
      if (pid === null) break;
      const bot = bots[state.players.findIndex((p) => p.id === pid)];
      const cmd = bot.chooseAction(state, rules, pid);
      if (cmd === null) break;
      const res = applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
      if (!res.ok) rejections++;
    }
    expect(rejections).toBe(0);
  });

  it("keeps enough cash in round 1 to build and light a theatre", () => {
    const rules = DEFAULT_RULES;
    const failures: string[] = [];
    for (const count of [3, 4]) {
      for (let seed = 1; seed <= 20; seed++) {
        const names = ["Red", "Gold", "Blue", "Green"].slice(0, count);
        const state = createGame(names.map((name, i) => ({ id: `p${i}`, name })), rules, seed);
        const bots = names.map((_, i) => scriptedBot(seed * 10 + i));
        let guard = 0;
        while (state.round === 1 && !state.ended && guard++ < 500) {
          const pid = activePlayerId(state, rules)!;
          const cmd = bots[state.players.findIndex((p) => p.id === pid)].chooseAction(state, rules, pid)!;
          applyCommand(state, rules, pid, { ...cmd, stateVersion: state.version });
        }
        for (const p of state.players) {
          if (p.theaters.length < 1 || p.litLastNight < 1) {
            failures.push(`${count}p seed ${seed} ${p.name}: built ${p.theaters.length}, lit ${p.litLastNight}, cash ${p.cash}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
