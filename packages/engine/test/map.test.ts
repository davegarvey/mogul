import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  activeCities,
  applyCommand,
  activePlayerId,
  buildCost,
  createGame,
  getLegalActions,
} from "../src/index.js";
import { mkGame } from "./driver.js";

const R = DEFAULT_RULES;

function forceExhibition(g: ReturnType<typeof mkGame>, playerId: string) {
  g.phase = "exhibition";
  g.phaseState = { index: 0 } as never;
  for (const p of g.players) {
    p.exhibitionDone = false;
    p.talentDone = true;
  }
  // Make `playerId` the active player by building a reverse order where they go first.
  const order = [...g.turnOrder].reverse();
  const idx = order.indexOf(playerId);
  g.phaseState = { index: idx } as never;
}

describe("map structure", () => {
  it("selects regions by player count", () => {
    const two = activeCities(R.map, 2);
    const four = activeCities(R.map, 4);
    expect(two.length).toBe(15);
    expect(four.length).toBe(30);
    expect(four.length).toBeGreaterThan(two.length);
  });
});

describe("expansion", () => {
  it("rejects building in an unconnected city (contiguity)", () => {
    const g = mkGame();
    // Argonne (hw5) is a leaf reached only via hw4; cut every edge into hw4.
    const cut = new Set(["hw3-hw4", "cn5-hw4", "hw4-hw5"]);
    const cutRules = {
      ...R,
      map: {
        ...R.map,
        edges: R.map.edges.filter((e) => !cut.has(`${e.from}-${e.to}`) && !cut.has(`${e.to}-${e.from}`)),
      },
    };
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    alice.cash = 500;
    forceExhibition(g, "a");
    expect(buildCost(g, cutRules, "a", "hw5")).toBeNull();
    expect(buildCost(g, cutRules, "a", "hw4")).toBeNull();
    // hw3 is still reachable through the heartland.
    expect(buildCost(g, cutRules, "a", "hw3")).not.toBeNull();
    const actions = getLegalActions(g, cutRules, "a");
    expect(actions.every((a) => a.command.cityId !== "hw5")).toBe(true);
  });

  it("allows building in any reachable city with an open slot", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    alice.cash = 500;
    forceExhibition(g, "a");
    // cn2 is adjacent (cost 2) + slot cost 10 = 12.
    expect(buildCost(g, R, "a", "cn2")).toBe(12);
    const res = applyCommand(g, R, "a", { type: "build", cityId: "cn2", stateVersion: g.version });
    expect(res.ok).toBe(true);
    expect(alice.theaters).toContain("cn2");
  });

  it("each player pays shared edge costs independently", () => {
    const g = mkGame();
    const alice = g.players[0];
    const bob = g.players[1];
    alice.theaters = ["cn1"];
    bob.theaters = ["cn1"];
    alice.cash = 500;
    bob.cash = 500;
    // Both pay the full cn1->cn2 edge + slot cost.
    expect(buildCost(g, R, "a", "cn2")).toBe(12);
    expect(buildCost(g, R, "b", "cn2")).toBe(12);
  });

  it("blocks building into a full city", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    alice.cash = 500;
    // Fill cn1's first slot is Alice's; fill the rest.
    g.cities["cn1"].owners = ["a", "b", "c"]; // 3 slots all taken (silent era allows 1, but force it)
    g.era = "golden";
    g.players[1].theaters = ["cn1"];
    g.players[2].theaters = ["cn1"];
    forceExhibition(g, "a");
    expect(buildCost(g, R, "a", "cn1")).toBeNull();
  });

  it("allows at most one theater per player per city", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    g.cities["cn1"].owners[0] = "a";
    forceExhibition(g, "a");
    expect(buildCost(g, R, "a", "cn1")).toBeNull();
  });

  it("allows passing through cities without building there", () => {
    const g = mkGame();
    const alice = g.players[0];
    // Alice's network is cn1; she may build cn4 via cn2/cn3 without owning cn2/cn3.
    alice.theaters = ["cn1"];
    alice.cash = 500;
    forceExhibition(g, "a");
    const cost = buildCost(g, R, "a", "cn4");
    // cn1->cn2 (2) + cn2->cn3 (1) + cn3->cn4 (4) + slot 10 = 17
    expect(cost).toBe(17);
  });

  it("empty-city slot cost stays 10 in every era", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    alice.cash = 500;
    forceExhibition(g, "a");
    // Talkies era: first theater in cn2 still costs 10 + edge.
    g.era = "talkies";
    expect(buildCost(g, R, "a", "cn2")).toBe(12);
  });
});

describe("theater slots", () => {
  it("unlocks the second slot only in talkies and the third in golden age", () => {
    const g = mkGame();
    const alice = g.players[0];
    const bob = g.players[1];
    alice.theaters = ["cn1"];
    bob.theaters = ["cn1"];
    g.cities["cn1"].owners = ["a", null, null];
    alice.cash = 500;
    bob.cash = 500;
    forceExhibition(g, "b");
    // Silent: second slot unavailable.
    expect(buildCost(g, R, "b", "cn1")).toBeNull();
    // Talkies: second slot costs 15 + edge 0 = 15.
    g.era = "talkies";
    expect(buildCost(g, R, "b", "cn1")).toBe(15);
    // Golden: third slot costs 20.
    g.era = "golden";
    g.cities["cn1"].owners = ["a", "b", null];
    g.players[2].theaters = ["cn1"];
    forceExhibition(g, "c");
    expect(buildCost(g, R, "c", "cn1")).toBe(20);
  });
});
