import { DEFAULT_RULES, validateRules } from "./rules.js";
import { hashString, minPathCosts, mulberry32, shuffle } from "./util.js";
import type {
  CityState,
  GameRules,
  GameState,
  MapDef,
  MarketState,
  PlayerState,
  TalentTrackId,
  TalentTrackState,
} from "./types.js";

/** Cities in play for a player count: all cities in regions with minPlayers <= count. */
export function activeCities(map: MapDef, playerCount: number): string[] {
  const activeRegions = map.regions
    .filter((r) => r.minPlayers <= playerCount)
    .map((r) => r.id);
  return map.cities.filter((c) => activeRegions.includes(c.region)).map((c) => c.id);
}

export function playerById(state: GameState, id: string): PlayerState {
  const p = state.players.find((p) => p.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function propertyDef(rules: GameRules, id: string) {
  const d = rules.properties.find((p) => p.id === id);
  if (!d) throw new Error(`unknown property ${id}`);
  return d;
}

/** Contract storage: twice the per-picture talent need of the property. */
export function storageFor(rules: GameRules, propertyId: string): number {
  const d = propertyDef(rules, propertyId);
  return 2 * d.perPicture * d.output;
}

export function contractedCount(
  p: PlayerState,
  propertyId: string,
  track: TalentTrackId,
): number {
  const owned = p.properties.find((o) => o.propertyId === propertyId);
  return owned ? (owned.contracted[track] ?? 0) : 0;
}

/** Theaters a property can light this opening night given contracted talent. */
export function propertyLitCapacity(
  rules: GameRules,
  owned: { propertyId: string; contracted: Partial<Record<TalentTrackId, number>> },
): number {
  const d = propertyDef(rules, owned.propertyId);
  const have = owned.contracted[d.talentType] ?? 0;
  return Math.min(d.output, Math.floor(have / d.perPicture));
}

/** Total theaters a player could light right now, capped by theaters built. */
export function litCapacity(rules: GameRules, p: PlayerState): number {
  const cap = p.properties.reduce((sum, o) => sum + propertyLitCapacity(rules, o), 0);
  return Math.min(p.theaters.length, cap);
}

export function incomeFor(rules: GameRules, lit: number): number {
  const table = rules.incomeTable;
  return table[Math.min(lit, table.length - 1)];
}

/** Highest-output property owned (turn-order tie-break, per PG's plant number). */
export function highestOutput(rules: GameRules, p: PlayerState): number {
  return p.properties.reduce(
    (max, o) => Math.max(max, propertyDef(rules, o.propertyId).output),
    0,
  );
}

export function slotsForEra(era: "silent" | "talkies" | "golden"): number {
  return era === "silent" ? 1 : era === "talkies" ? 2 : 3;
}

export function slotCost(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  const occupied = city.owners.filter((o) => o !== null).length;
  return occupied === 0 ? 10 : occupied === 1 ? 15 : 20;
}

/** Cheapest-path connection costs from the player's network to every city. */
export function pathCosts(
  rules: GameRules,
  p: PlayerState,
): Map<string, number> {
  return minPathCosts(
    rules.map.edges,
    p.theaters.length === 0 ? [] : p.theaters,
    rules.map.cities.map((c) => c.id),
  );
}

/** Cost to build into a city: connection cost + slot cost, or null if illegal. */
export function buildCost(
  state: GameState,
  rules: GameRules,
  playerId: string,
  cityId: string,
): number | null {
  const p = playerById(state, playerId);
  const city = state.cities[cityId];
  if (!city) return null;
  const occupied = city.owners.filter((o) => o !== null).length;
  if (occupied >= slotsForEra(state.era)) return null;
  if (city.owners.includes(playerId)) return null;
  if (p.theaters.length === 0) return 10;
  const edge = pathCosts(rules, p).get(cityId);
  if (edge === undefined || edge === Infinity) return null;
  return edge + slotCost(state, cityId);
}

export function createMarket(rules: GameRules, seed: number): MarketState {
  const rand = mulberry32(hashString(`deck:${seed}`));
  const deck = shuffle(rules.properties.map((p) => p.id), rand);
  deck.push(rules.eraCardId);
  const drawn = deck.splice(0, 8);
  const sorted = [...drawn].sort(
    (a, b) =>
      propertyDef(rules, a).faceValue - propertyDef(rules, b).faceValue ||
      a.localeCompare(b),
  );
  return {
    current: sorted.slice(0, 4).map((propertyId) => ({ propertyId })),
    future: sorted.slice(4, 8).map((propertyId) => ({ propertyId })),
    deck,
  };
}

export function createTalentMarket(
  rules: GameRules,
): Record<TalentTrackId, TalentTrackState> {
  const out = {} as Record<TalentTrackId, TalentTrackState>;
  for (const trackId of Object.keys(rules.talentTracks) as TalentTrackId[]) {
    out[trackId] = {
      slots: rules.talentTracks[trackId].slots.map((s) => s.max),
    };
  }
  return out;
}

export function createCities(rules: GameRules, playerCount: number): Record<string, CityState> {
  const out: Record<string, CityState> = {};
  for (const id of activeCities(rules.map, playerCount)) {
    const def = rules.map.cities.find((c) => c.id === id)!;
    out[id] = { owners: new Array(def.slots).fill(null) };
  }
  return out;
}

export function createGame(
  players: { id: string; name: string }[],
  rules: GameRules = DEFAULT_RULES,
  seed = 1,
): GameState {
  validateRules(rules);
  if (players.length < 2) throw new Error("need at least 2 players");
  if (players.length > 4) throw new Error("need at most 4 players");
  return {
    version: 1,
    round: 1,
    phase: "moguls-assemble",
    phaseState: null,
    era: "silent",
    eraCardDrawn: false,
    talkiesPending: false,
    turnOrder: players.map((p) => p.id),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: rules.startingCash,
      properties: [],
      theaters: [],
      auctionBought: false,
      auctionPassed: false,
      auctionEligible: true,
      talentDone: false,
      exhibitionDone: false,
      litLastNight: 0,
    })),
    market: createMarket(rules, seed),
    talent: createTalentMarket(rules),
    cities: createCities(rules, players.length),
    events: [],
    ended: false,
    winnerId: null,
    log: [],
  };
}

export function log(state: GameState, msg: string): void {
  state.log.push(msg);
}
