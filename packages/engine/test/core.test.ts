import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  activePlayerId,
  applyCommand,
  applyGoldenTransition,
  applyTalkiesTransition,
  buildSnapshot,
  getLegalActions,
  incomeFor,
  litCapacity,
  propertyDef,
  recomputeTurnOrder,
  runOpeningNight,
} from "../src/index.js";
import { driveExhibition, driveRound1, mkGame } from "./driver.js";

const R = DEFAULT_RULES;

/** Force the game into a player phase so tests can drive specific scenarios. */
function forcePhase(g: ReturnType<typeof mkGame>, phase: "rights-auction" | "talent-market" | "exhibition", phaseState: unknown): void {
  g.phase = phase;
  g.phaseState = phaseState as never;
  for (const p of g.players) {
    p.talentDone = false;
    p.exhibitionDone = false;
    p.auctionBought = false;
    p.auctionPassed = false;
    p.auctionEligible = true;
  }
}

describe("round phases", () => {
  it("runs the five phases in fixed order and only advances after opening night", () => {
    const g = mkGame();
    const pid = activePlayerId(g, R);
    expect(pid).not.toBeNull();
    expect(g.phase).toBe("rights-auction");
    const seen: string[] = [g.phase];
    for (let i = 0; i < 6 && !g.ended; i++) {
      while (g.phase === "rights-auction") {
        const pid = activePlayerId(g, R)!;
        const actions = getLegalActions(g, R, pid);
        applyCommand(g, R, pid, actions[0].command);
      }
      if (g.phase === "talent-market") seen.push("talent-market");
      while (g.phase === "talent-market") {
        const pid = activePlayerId(g, R)!;
        applyCommand(g, R, pid, { type: "end-turn", stateVersion: g.version });
      }
      if (g.phase === "exhibition") seen.push("exhibition");
      while (g.phase === "exhibition") {
        const pid = activePlayerId(g, R)!;
        applyCommand(g, R, pid, { type: "end-turn", stateVersion: g.version });
      }
    }
    // Opening night is automatic; the event log records it.
    expect(g.events.some((e) => e.type === "phase-changed" && e.phase === "opening-night")).toBe(true);
    expect(g.events.filter((e) => e.type === "phase-changed" && e.phase === "rights-auction").length).toBeGreaterThan(1);
    expect(seen[0]).toBe("rights-auction");
  });

  it("advances to the next round after opening night", () => {
    const g = mkGame();
    driveRound1(g);
    expect(g.round).toBe(2);
    expect(g.phase).toBe("rights-auction");
  });
});

describe("turn order", () => {
  it("orders by theaters built, ties by highest-output property", () => {
    const g = mkGame();
    const alice = g.players[0];
    const bob = g.players[1];
    alice.properties = [{ propertyId: "p36", contracted: {} }]; // output 20
    bob.properties = [{ propertyId: "p01", contracted: {} }]; // output 2
    alice.theaters = ["cn1", "cn2"];
    bob.theaters = ["cn1", "cs1"];
    recomputeTurnOrder(g, R);
    expect(g.turnOrder[0]).toBe("a");
    expect(g.turnOrder[1]).toBe("b");
  });

  it("talent market and exhibition run in reverse turn order", () => {
    const g = mkGame();
    driveRound1(g);
    forcePhase(g, "talent-market", { index: 0 });
    expect(activePlayerId(g, R)).toBe(g.turnOrder[g.turnOrder.length - 1]);
    forcePhase(g, "exhibition", { index: 0 });
    expect(activePlayerId(g, R)).toBe(g.turnOrder[g.turnOrder.length - 1]);
  });
});

describe("money loop", () => {
  it("only starting cash and box office add money; purchases deduct", () => {
    const g = mkGame();
    const alice = g.players[0];
    expect(alice.cash).toBe(50);
    driveRound1(g);
    expect(alice.properties.length).toBe(1);
    const won = g.events.find((e) => e.type === "auction-won" && e.by === "a") as { amount: number } | undefined;
    expect(won).toBeDefined();
    // 50 start - bid + minimum income of 10 for lighting nothing.
    expect(alice.cash).toBe(50 - won!.amount + 10);
  });

  it("rejects unaffordable purchases", () => {
    const g = mkGame();
    g.players[0].cash = 5;
    const res = applyCommand(g, R, "a", {
      type: "start-auction",
      propertyId: g.market.current[0].propertyId,
      amount: 50,
      stateVersion: g.version,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("cash");
  });
});

describe("box office income", () => {
  it("pays per the income table and caps at the table's last value", () => {
    expect(incomeFor(R, 0)).toBe(10);
    expect(incomeFor(R, 3)).toBe(44);
    expect(incomeFor(R, 4)).toBe(54);
    expect(incomeFor(R, 5)).toBe(64);
    expect(incomeFor(R, 20)).toBe(150);
    expect(incomeFor(R, 99)).toBe(150);
  });

  it("guarantees the minimum of 10 for no lit theaters", () => {
    const g = mkGame();
    const income = runOpeningNight(g, R);
    expect(income.a).toBe(10);
  });
});

describe("era clock", () => {
  it("begins the talkies era at the start of opening night after the 7th theater is built", () => {
    const g = mkGame();
    g.players[0].theaters = Array.from({ length: 7 }, (_, i) => `c${i}`);
    g.talkiesPending = true;
    runOpeningNight(g, R);
    expect(g.era).toBe("talkies");
  });

  it("applies the golden age transition when the era card is drawn", () => {
    const g = mkGame();
    // The era card is drawn instead of a replacement, so the market is already down one.
    g.market.future.pop();
    g.eraCardDrawn = true;
    applyGoldenTransition(g, R);
    expect(g.era).toBe("golden");
    expect(g.market.current.length + g.market.future.length).toBe(6);
    expect(g.market.future.length).toBe(0);
  });

  it("talkies shelves the weakest property and replaces it", () => {
    const g = mkGame();
    const before = g.market.current.length + g.market.future.length;
    applyTalkiesTransition(g, R);
    expect(g.era).toBe("talkies");
    expect(g.market.current.length + g.market.future.length).toBe(before);
  });
});

describe("victory condition", () => {
  it("ends the game after exhibition when a player builds the target count, no final opening night", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = Array.from({ length: 17 }, (_, i) => `c${i}`);
    alice.properties = [{ propertyId: "p36", contracted: { "a-listers": 40 } }];
    forcePhase(g, "exhibition", { index: 0 });
    driveExhibition(g);
    expect(g.ended).toBe(true);
    expect(g.phase).not.toBe("opening-night");
    expect(g.winnerId).toBe("a");
  });

  it("ties break on money then theaters built", () => {
    const g = mkGame();
    const alice = g.players[0];
    const bob = g.players[1];
    alice.theaters = Array.from({ length: 17 }, (_, i) => `c${i}`);
    bob.theaters = Array.from({ length: 17 }, (_, i) => `d${i}`);
    alice.properties = [{ propertyId: "p36", contracted: { "a-listers": 40 } }];
    bob.properties = [{ propertyId: "p35", contracted: { stars: 40 } }];
    alice.cash = 100;
    bob.cash = 200;
    forcePhase(g, "exhibition", { index: 0 });
    driveExhibition(g);
    expect(g.ended).toBe(true);
    expect(g.winnerId).toBe("b");
  });
});

describe("legal actions and snapshots", () => {
  it("snapshot carries the full open-information state and a version", () => {
    const g = mkGame();
    const snap = buildSnapshot(g, R, "a");
    expect(snap.version).toBe(g.version);
    expect(snap.state.players).toHaveLength(4);
    expect(snap.actions.length).toBeGreaterThan(0);
  });

  it("rejects stale commands", () => {
    const g = mkGame();
    const res = applyCommand(g, R, "a", { type: "pass-auction", stateVersion: g.version - 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("stale");
  });

  it("rejects commands from non-active players", () => {
    const g = mkGame();
    const res = applyCommand(g, R, "b", { type: "pass-auction", stateVersion: g.version });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("not your turn");
  });

  it("gives legal actions only to the active player", () => {
    const g = mkGame();
    expect(getLegalActions(g, R, "a").length).toBeGreaterThan(0);
    expect(getLegalActions(g, R, "b").length).toBe(0);
  });

  it("lit capacity is capped by theaters built", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1", "cn2", "cn3"];
    alice.properties = [{ propertyId: "p36", contracted: { "a-listers": 40 } }];
    expect(litCapacity(R, alice)).toBe(3);
  });
});
