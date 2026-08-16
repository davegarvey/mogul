export type Era = "silent" | "talkies" | "golden";

export type Phase =
  | "moguls-assemble"
  | "rights-auction"
  | "talent-market"
  | "exhibition"
  | "opening-night";

export type TalentTrackId = "extras" | "character-actors" | "stars" | "a-listers";

export type CommandType =
  | "start-auction"
  | "bid"
  | "pass-auction"
  | "buy-talent"
  | "build"
  | "end-turn";

/** A typed player command. */
export interface Command {
  type: CommandType;
  /** Snapshot state version the client rendered this command from. */
  stateVersion: number;
  propertyId?: string;
  amount?: number;
  track?: TalentTrackId;
  cityId?: string;
}

export interface PropertyDef {
  id: string;
  name: string;
  faceValue: number;
  /** Theaters the property can supply per opening night. */
  output: number;
  talentType: TalentTrackId;
  /** Talent units consumed per theater lit on an opening night. */
  perPicture: number;
}

export interface TalentSlotDef {
  price: number;
  max: number;
}

export interface TalentTrackDef {
  id: TalentTrackId;
  name: string;
  slots: TalentSlotDef[];
  restock: Record<Era, number>;
}

export interface CityDef {
  id: string;
  name: string;
  slots: number;
  region: string;
}

export interface EdgeDef {
  from: string;
  to: string;
  cost: number;
}

export interface RegionDef {
  id: string;
  name: string;
  minPlayers: number;
}

export interface MapDef {
  regions: RegionDef[];
  cities: CityDef[];
  edges: EdgeDef[];
}

export interface GameRules {
  startingCash: number;
  talkiesTrigger: number;
  endgameTarget: Record<number, number>;
  incomeTable: number[];
  properties: PropertyDef[];
  talentTracks: Record<TalentTrackId, TalentTrackDef>;
  map: MapDef;
  eraCardId: string;
}

export interface OwnedProperty {
  propertyId: string;
  /** Contracted talent units, keyed by track. */
  contracted: Partial<Record<TalentTrackId, number>>;
}

export interface PlayerState {
  id: string;
  name: string;
  cash: number;
  properties: OwnedProperty[];
  /** City ids where this player has built a theater. */
  theaters: string[];
  /** Rights auction: has bought a property this round. */
  auctionBought: boolean;
  /** Rights auction: passed on start (out for the round). */
  auctionPassed: boolean;
  /** Rights auction: still eligible to be auction starter. */
  auctionEligible: boolean;
  /** Talent market: has taken their purchase turn this round. */
  talentDone: boolean;
  /** Exhibition: has ended their build turn this round. */
  exhibitionDone: boolean;
  /** Opening night bookkeeping (per round). */
  litLastNight: number;
}

export interface MarketSlot {
  propertyId: string;
}

export interface MarketState {
  /** Four available properties, ascending by face value. */
  current: MarketSlot[];
  /** Four visible but unavailable properties, ascending by face value. */
  future: MarketSlot[];
  /** Draw pile: property ids plus the era card id at the bottom. */
  deck: string[];
}

export interface TalentTrackState {
  slots: number[];
}

export interface CityState {
  /** Owner player ids occupying slots, in order; null slots are open. */
  owners: (string | null)[];
}

export interface AuctionState {
  /** Property being auctioned, or null when no auction is open. */
  propertyId: string | null;
  currentBid: number;
  highestBidder: string | null;
  /** Player ids still in the current auction (have not passed on the bid). */
  biddersIn: string[];
}

export interface TalentTurnState {
  /** Index into reverse-turn-order of the player whose purchase turn it is. */
  index: number;
}

export interface ExhibitionState {
  /** Index into reverse-turn-order of the player whose build turn it is. */
  index: number;
}

export type PhaseState = AuctionState | TalentTurnState | ExhibitionState | null;

export interface GameState {
  version: number;
  round: number;
  phase: Phase;
  phaseState: PhaseState;
  era: Era;
  /** True once the era card is drawn; golden age applies at the next phase boundary. */
  eraCardDrawn: boolean;
  /** True when a player has built the talkies trigger count; applies at the start of opening night. */
  talkiesPending: boolean;
  turnOrder: string[];
  players: PlayerState[];
  market: MarketState;
  talent: Record<TalentTrackId, TalentTrackState>;
  cities: Record<string, CityState>;
  events: GameEvent[];
  ended: boolean;
  winnerId: string | null;
  log: string[];
}

export type GameEvent =
  | { type: "phase-changed"; phase: Phase }
  | { type: "era-changed"; era: Era }
  | { type: "auction-started"; propertyId: string; bid: number; by: string }
  | { type: "bid"; propertyId: string; amount: number; by: string }
  | { type: "auction-won"; propertyId: string; amount: number; by: string }
  | { type: "property-sold"; propertyId: string; by: string }
  | { type: "property-shelved"; propertyId: string; reason: string }
  | { type: "talent-bought"; track: TalentTrackId; price: number; by: string; propertyId: string }
  | { type: "theater-built"; cityId: string; cost: number; by: string }
  | { type: "opening-night"; lit: Record<string, number>; income: Record<string, number> }
  | { type: "game-ended"; winnerId: string; reason: string };

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

export interface Action {
  label: string;
  command: Command;
  /** Categories used by menus: "auction" | "talent" | "build" | "pass" | "end-turn" */
  kind: string;
}
