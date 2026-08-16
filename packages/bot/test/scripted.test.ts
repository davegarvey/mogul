import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, activePlayerId, applyCommand } from "@mogul/engine";
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
});
