import gameData from "./data/game.json" with { type: "json" };
import propertiesData from "./data/properties.json" with { type: "json" };
import talentData from "./data/talent.json" with { type: "json" };
import mapData from "./data/map.json" with { type: "json" };
import type { GameRules, PropertyDef, TalentTrackDef, TalentTrackId } from "./types.js";

export const DEFAULT_RULES: GameRules = {
  startingCash: gameData.startingCash,
  talkiesTrigger: gameData.talkiesTrigger,
  endgameTarget: gameData.endgameTarget,
  incomeTable: gameData.incomeTable,
  eraCardId: gameData.eraCardId,
  properties: propertiesData as PropertyDef[],
  talentTracks: talentData as unknown as Record<TalentTrackId, TalentTrackDef>,
  map: mapData,
};

const TRACK_IDS: TalentTrackId[] = ["extras", "character-actors", "stars", "a-listers"];

/** Structural validation of the rules data. Throws on any inconsistency. */
export function validateRules(rules: GameRules): GameRules {
  const errors: string[] = [];
  const propertyIds = new Set<string>();

  if (rules.startingCash <= 0) errors.push("startingCash must be positive");
  if (rules.talkiesTrigger <= 0) errors.push("talkiesTrigger must be positive");
  for (const [count, target] of Object.entries(rules.endgameTarget)) {
    if (!/^[234]$/.test(count)) errors.push(`endgameTarget for ${count} players must be 2..4`);
    if (target <= 0) errors.push(`endgameTarget[${count}] must be positive`);
  }
  if (rules.incomeTable.length < 2) errors.push("incomeTable must have at least 2 entries");
  for (let i = 1; i < rules.incomeTable.length; i++) {
    if (rules.incomeTable[i] < rules.incomeTable[i - 1]) errors.push(`incomeTable[${i}] not non-decreasing`);
  }

  for (const p of rules.properties) {
    if (propertyIds.has(p.id)) errors.push(`duplicate property id ${p.id}`);
    propertyIds.add(p.id);
    if (p.faceValue <= 0) errors.push(`${p.id}: faceValue must be positive`);
    if (p.output <= 0) errors.push(`${p.id}: output must be positive`);
    if (!TRACK_IDS.includes(p.talentType)) errors.push(`${p.id}: unknown talentType ${p.talentType}`);
    if (p.perPicture <= 0) errors.push(`${p.id}: perPicture must be positive`);
  }
  if (propertyIds.has(rules.eraCardId)) errors.push(`era card id ${rules.eraCardId} collides with a property`);

  for (const trackId of TRACK_IDS) {
    const t = rules.talentTracks[trackId];
    if (!t) {
      errors.push(`missing talent track ${trackId}`);
      continue;
    }
    if (t.slots.length === 0) errors.push(`${trackId}: no slots`);
    for (let i = 1; i < t.slots.length; i++) {
      if (t.slots[i].price <= t.slots[i - 1].price) errors.push(`${trackId}: slots must be strictly ascending`);
      if (t.slots[i].max <= 0) errors.push(`${trackId}: slot max must be positive`);
    }
    for (const era of ["silent", "talkies", "golden"] as const) {
      if (t.restock[era] < 0) errors.push(`${trackId}: restock[${era}] must be non-negative`);
    }
  }

  const cityIds = new Set<string>();
  for (const c of rules.map.cities) {
    if (cityIds.has(c.id)) errors.push(`duplicate city id ${c.id}`);
    cityIds.add(c.id);
    if (c.slots < 1 || c.slots > 3) errors.push(`${c.id}: slots must be 1..3`);
    if (!rules.map.regions.some((r) => r.id === c.region)) errors.push(`${c.id}: unknown region ${c.region}`);
  }
  for (const e of rules.map.edges) {
    if (!cityIds.has(e.from)) errors.push(`edge from unknown city ${e.from}`);
    if (!cityIds.has(e.to)) errors.push(`edge to unknown city ${e.to}`);
    if (e.cost < 0) errors.push(`edge ${e.from}-${e.to}: negative cost`);
  }
  const minCities = Math.min(...rules.map.regions.map((r) => r.minPlayers));
  const activeForFewest = rules.map.cities.filter(
    (c) => rules.map.regions.find((r) => r.id === c.region)!.minPlayers <= minCities,
  ).length;
  if (activeForFewest < 2) errors.push("map too small for the smallest player count");

  if (errors.length > 0) {
    throw new Error(`Invalid rules data:\n  - ${errors.join("\n  - ")}`);
  }
  return rules;
}
