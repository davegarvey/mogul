import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  applyCommand,
  applyGoldenTransition,
  applyMinimumRule,
  applyTalkiesTransition,
  activePlayerId,
  contractedCount,
  getLegalActions,
  lightProperty,
  propertyDef,
  restockTrack,
  shelveLowestAndReplace,
  storageFor,
  trackPrice,
} from "../src/index.js";
import { mkGame } from "./driver.js";

const R = DEFAULT_RULES;

function openAuction(g: ReturnType<typeof mkGame>, starter: string, propertyId: string, bid: number) {
  g.phase = "rights-auction";
  g.phaseState = { propertyId: null, currentBid: 0, highestBidder: null, biddersIn: [] } as never;
  for (const p of g.players) {
    p.auctionBought = false;
    p.auctionPassed = false;
    p.auctionEligible = true;
  }
  const res = applyCommand(g, R, starter, { type: "start-auction", propertyId, amount: bid, stateVersion: g.version });
  expect(res.ok).toBe(true);
}

describe("rights auction", () => {
  it("rejects an opening bid below face value", () => {
    const g = mkGame();
    const p = g.market.current[0].propertyId;
    const res = applyCommand(g, R, "a", { type: "start-auction", propertyId: p, amount: propertyDef(R, p).faceValue - 1, stateVersion: g.version });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("face value");
  });

  it("passing on start is final for the round", () => {
    const g = mkGame();
    // Round 2 so passing is allowed; make Alice the active offerer.
    g.round = 2;
    const res = applyCommand(g, R, "a", { type: "pass-auction", stateVersion: g.version });
    expect(res.ok).toBe(true);
    expect(g.players[0].auctionPassed).toBe(true);
    expect(g.players[0].auctionEligible).toBe(false);
  });

  it("passing on a bid only ends that auction", () => {
    const g = mkGame();
    openAuction(g, "a", g.market.current[0].propertyId, 10);
    // Bob passes on the bid...
    const res = applyCommand(g, R, "b", { type: "pass-auction", stateVersion: g.version });
    expect(res.ok).toBe(true);
    expect((g.phaseState as { biddersIn: string[] }).biddersIn).not.toContain("b");
    // ...but Bob may still start an auction later.
    expect(g.players[1].auctionPassed).toBe(false);
    expect(g.players[1].auctionEligible).toBe(true);
  });

  it("requires strictly higher bids", () => {
    const g = mkGame();
    openAuction(g, "a", g.market.current[0].propertyId, 10);
    const res = applyCommand(g, R, "b", { type: "bid", amount: 10, stateVersion: g.version });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("exceed");
  });

  it("a player can buy at most one property per round", () => {
    const g = mkGame();
    openAuction(g, "a", g.market.current[0].propertyId, 10);
    // Resolve: everyone else passes, Alice wins.
    applyCommand(g, R, "b", { type: "pass-auction", stateVersion: g.version });
    applyCommand(g, R, "c", { type: "pass-auction", stateVersion: g.version });
    applyCommand(g, R, "d", { type: "pass-auction", stateVersion: g.version });
    expect(g.players[0].properties).toHaveLength(1);
    expect(g.players[0].auctionBought).toBe(true);
    // Alice cannot start another auction.
    const actions = getLegalActions(g, R, "a");
    expect(actions.every((a) => a.command.type !== "start-auction")).toBe(true);
  });

  it("refuses passes in the first round", () => {
    const g = mkGame();
    const res = applyCommand(g, R, "a", { type: "pass-auction", stateVersion: g.version });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("first round");
  });

  it("refreshes the market after a purchase, cheapest four in the current market", () => {
    const g = mkGame();
    const sold = g.market.current[0].propertyId;
    openAuction(g, "a", sold, 10);
    applyCommand(g, R, "b", { type: "pass-auction", stateVersion: g.version });
    applyCommand(g, R, "c", { type: "pass-auction", stateVersion: g.version });
    applyCommand(g, R, "d", { type: "pass-auction", stateVersion: g.version });
    expect(g.market.current.some((s) => s.propertyId === sold)).toBe(false);
    const all = [...g.market.current, ...g.market.future];
    expect(all.length).toBe(8);
    const values = all.map((s) => propertyDef(R, s.propertyId).faceValue);
    const currentVals = g.market.current.map((s) => propertyDef(R, s.propertyId).faceValue);
    expect(Math.max(...currentVals)).toBeLessThanOrEqual(Math.min(...g.market.future.map((s) => propertyDef(R, s.propertyId).faceValue)));
    void values;
  });

  it("shelves the lowest property and replaces it when no sale happens in a round", () => {
    const g = mkGame();
    const before = g.market.current.length + g.market.future.length;
    const lowestBefore = g.market.current[0].propertyId;
    shelveLowestAndReplace(g, R);
    expect(g.market.current.length + g.market.future.length).toBe(before);
    expect(g.market.current.some((s) => s.propertyId === lowestBefore)).toBe(false);
  });
});

describe("property deck and eras", () => {
  it("talkies transition removes the lowest property and draws a replacement", () => {
    const g = mkGame();
    const before = g.market.current.length + g.market.future.length;
    applyTalkiesTransition(g, R);
    expect(g.era).toBe("talkies");
    expect(g.market.current.length + g.market.future.length).toBe(before);
  });

  it("golden age shrinks the market to six, all available", () => {
    const g = mkGame();
    // The era card was drawn in place of a replacement, then golden removes the lowest.
    g.market.future.pop();
    applyGoldenTransition(g, R);
    expect(g.era).toBe("golden");
    expect(g.market.future.length).toBe(0);
    expect(g.market.current.length).toBe(6);
  });

  it("minimum rule removes market properties whose output is at or below the leader's built count", () => {
    const g = mkGame();
    g.turnOrder = ["a", "b", "c", "d"];
    g.players[0].theaters = Array.from({ length: 6 }, (_, i) => `c${i}`);
    // Find a market property with output <= 6 and verify it is removed.
    applyMinimumRule(g, R);
    const all = [...g.market.current, ...g.market.future];
    expect(all.every((s) => propertyDef(R, s.propertyId).output > 6)).toBe(true);
  });
});

describe("talent market", () => {
  it("buying raises the price for everyone", () => {
    const g = mkGame();
    g.phase = "talent-market";
    g.phaseState = { index: 0 } as never;
    // Make Alice the active player: reverse turn order [d, c, b, a].
    g.turnOrder = ["d", "c", "b", "a"];
    const alice = g.players[0];
    alice.properties = [{ propertyId: "p02", contracted: {} }];
    expect(trackPrice(g, R, "character-actors")).toBe(3);
    for (let i = 0; i < 3; i++) {
      const res = applyCommand(g, R, "a", { type: "buy-talent", propertyId: "p02", track: "character-actors", stateVersion: g.version });
      expect(res.ok).toBe(true);
    }
    expect(trackPrice(g, R, "character-actors")).toBe(4);
    expect(contractedCount(alice, "p02", "character-actors")).toBe(3);
  });

  it("restock fills the most expensive slots first", () => {
    const g = mkGame();
    g.talent["character-actors"].slots = [0, 0, 0, 3];
    restockTrack(g, R, "character-actors");
    // 3 added: the price-6 slot is already full, so all 3 fill the price-5 slot.
    expect(g.talent["character-actors"].slots).toEqual([0, 0, 3, 3]);
  });

  it("enforces contract storage limits", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.properties = [{ propertyId: "p01", contracted: {} }]; // output 2, perPicture 1 -> storage 4
    expect(storageFor(R, "p01")).toBe(4);
    g.phase = "talent-market";
    g.phaseState = { index: 0 } as never;
    g.turnOrder = ["d", "c", "b", "a"];
    for (let i = 0; i < 4; i++) {
      const res = applyCommand(g, R, "a", { type: "buy-talent", propertyId: "p01", track: "extras", stateVersion: g.version });
      expect(res.ok).toBe(true);
    }
    const full = applyCommand(g, R, "a", { type: "buy-talent", propertyId: "p01", track: "extras", stateVersion: g.version });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toContain("full");
  });

  it("rejects talent of the wrong type for a property", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.properties = [{ propertyId: "p02", contracted: {} }]; // character-actors
    g.phase = "talent-market";
    g.phaseState = { index: 0 } as never;
    g.turnOrder = ["d", "c", "b", "a"];
    const res = applyCommand(g, R, "a", { type: "buy-talent", propertyId: "p02", track: "stars", stateVersion: g.version });
    expect(res.ok).toBe(false);
  });
});

describe("exclusive contracts", () => {
  it("contracts insulate: two pictures' worth supplies full output for two nights", () => {
    const g = mkGame();
    // The One-Reel Nickelodeon (p37): output 1, needs one per picture; storage 2.
    const alice = g.players[0];
    alice.theaters = ["cn1"];
    const owned = { propertyId: "p37", contracted: { extras: 2 } };
    alice.properties = [owned];
    const night1 = lightProperty(R, owned, 1);
    const night2 = lightProperty(R, owned, 1);
    expect(night1.lit).toBe(1);
    expect(night2.lit).toBe(1);
  });

  it("a starved property lights only as many theaters as its talent allows", () => {
    const g = mkGame();
    const alice = g.players[0];
    const owned = { propertyId: "p13", contracted: { extras: 3 } }; // output 6
    alice.properties = [owned];
    const { lit } = lightProperty(R, owned, 6);
    expect(lit).toBe(3);
  });

  it("consumes per-picture talent per theater lit on opening night", () => {
    const g = mkGame();
    const alice = g.players[0];
    alice.theaters = ["cn1", "cn2", "cn3", "cn4"];
    const owned = { propertyId: "p13", contracted: { extras: 6 } }; // output 6, perPicture 1
    alice.properties = [owned];
    lightProperty(R, owned, 4);
    expect(owned.contracted.extras).toBe(2);
  });
});
