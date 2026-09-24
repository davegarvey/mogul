import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, activePlayerId, applyCommand, createGame, getLegalActions } from "@mogul/engine";
import type { Action, Command, GameState } from "@mogul/engine";
import {
  auctionModel,
  buildModel,
  openingNightSummary,
  stageForPhase,
  talentCost,
  talentModel,
  unmatchedActions,
  withAmount,
} from "../src/stage-model.js";

const R = DEFAULT_RULES;

function mkGame(count = 3, seed = 7): GameState {
  const names = ["Alice", "Bob", "Cara", "Dave"];
  return createGame(
    names.slice(0, count).map((name, i) => ({ id: String.fromCharCode(97 + i), name })),
    R,
    seed,
  );
}

const active = (s: GameState): string => activePlayerId(s, R)!;
const legal = (s: GameState): Action[] => getLegalActions(s, R, active(s));
function apply(s: GameState, command: Command): void {
  const res = applyCommand(s, R, active(s), { ...command, stateVersion: s.version });
  if (!res.ok) throw new Error(res.reason);
}
/** Pass or end the turn where legal, otherwise take the first legal action. */
function passive(s: GameState): void {
  const a = legal(s);
  apply(s, (a.find((x) => x.command.type === "pass-auction" || x.command.type === "end-turn") ?? a[0]).command);
}
function driveTo(s: GameState, phase: GameState["phase"]): void {
  let guard = 0;
  while (s.phase !== phase && !s.ended && guard++ < 500) passive(s);
  expect(s.phase).toBe(phase);
}

describe("stage model", () => {
  it("maps phases to stages and keeps the previous stage for automatic phases", () => {
    expect(stageForPhase("rights-auction", "map")).toBe("auction");
    expect(stageForPhase("talent-market", "auction")).toBe("talent");
    expect(stageForPhase("exhibition", "talent")).toBe("map");
    expect(stageForPhase("opening-night", "map")).toBe("map");
    expect(stageForPhase("moguls-assemble", "talent")).toBe("talent");
  });

  it("puts a start-auction control on every affordable current-market card", () => {
    const s = mkGame();
    const actions = legal(s);
    const m = auctionModel(s, R, actions, active(s));
    const starts = actions.filter((a) => a.command.type === "start-auction");
    expect(m.cards.filter((c) => c.start).length).toBe(starts.length);
    expect(m.cards.filter((c) => c.future).every((c) => !c.start)).toBe(true);
    expect(m.open).toBeNull();
    expect(m.passRound).toBeUndefined(); // round 1: everyone must buy
  });

  it("shows the open auction to everyone and lets the bidder jump", () => {
    const s = mkGame();
    const opener = active(s);
    apply(s, legal(s).find((a) => a.command.type === "start-auction")!.command);
    const bidder = active(s);
    expect(bidder).not.toBe(opener);

    const watcher = auctionModel(s, R, [], opener);
    expect(watcher.open?.highestBidder).toBe(opener);
    expect(watcher.open?.biddersIn).toContain(bidder);
    expect(watcher.bid).toBeNull();

    const m = auctionModel(s, R, legal(s), bidder);
    expect(m.bid!.min).toBe(m.open!.currentBid + 1);
    expect(m.bid!.max).toBe(s.players.find((p) => p.id === bidder)!.cash);
    expect(m.dropOut).toBeDefined();
    const jump = m.bid!.min + 4;
    apply(s, withAmount(m.bid!.action, jump) as Command);
    expect(auctionModel(s, R, [], bidder).open!.currentBid).toBe(jump);
  });

  it("prices multi-unit talent purchases exactly as the engine charges them", () => {
    const s = mkGame();
    driveTo(s, "talent-market");
    const buyer = active(s);
    const m = talentModel(s, R, legal(s), buyer);
    const prop = m.properties.find((p) => p.buy)!;
    expect(prop).toBeDefined();
    expect(prop.short).toBe(Math.max(0, prop.fullNight - prop.contracted));
    const n = Math.min(3, prop.maxBuy);
    const expected = talentCost(s, R, prop.track, n)!;
    const cashBefore = s.players.find((p) => p.id === buyer)!.cash;
    for (let i = 0; i < n; i++) apply(s, legal(s).find((a) => a.command.propertyId === prop.propertyId)!.command);
    expect(cashBefore - s.players.find((p) => p.id === buyer)!.cash).toBe(expected);
    expect(talentModel(s, R, legal(s), buyer).endTurn).toBeDefined();
  });

  it("marks buildable cities and the end-turn control in the build stage", () => {
    const s = mkGame();
    driveTo(s, "exhibition");
    const m = buildModel(s, legal(s));
    expect(m.buildable.size).toBeGreaterThan(0);
    expect(m.endTurn).toBeDefined();
  });

  it("summarises the last opening night", () => {
    const s = mkGame();
    expect(openingNightSummary(s)).toBeNull();
    driveTo(s, "exhibition");
    driveTo(s, "rights-auction");
    const summary = openingNightSummary(s)!;
    expect(summary.night).toBe(1);
    expect(summary.rows).toHaveLength(3);
    expect(summary.rows.every((r) => r.income >= R.incomeTable[0])).toBe(true);
  });

  it("renders every legal action as a stage control throughout a game", () => {
    for (const count of [2, 3, 4]) {
      const s = mkGame(count, 11 + count);
      let stage = stageForPhase(s.phase, "auction");
      let guard = 0;
      while (!s.ended && guard++ < 3000) {
        stage = stageForPhase(s.phase, stage);
        const actions = legal(s);
        expect(unmatchedActions(stage, actions), `${s.phase} round ${s.round}`).toEqual([]);
        // Play a little: build and buy where possible so every phase is exercised.
        const pick =
          actions.find((a) => a.command.type === "build") ??
          (s.round % 2 === 0 ? actions.find((a) => a.command.type === "buy-talent") : undefined) ??
          actions.find((a) => a.command.type === "pass-auction" || a.command.type === "end-turn") ??
          actions[0];
        apply(s, pick.command);
      }
      expect(s.ended).toBe(true);
    }
  });
});
