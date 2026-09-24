import { DEFAULT_RULES, buildCost, pathCosts, playerById, propertyDef, slotCost, slotsForEra } from "@mogul/engine";
import type { Action, GameState, GameRules } from "@mogul/engine";
import type { ClientMessage, RoomState, ServerMessage, SnapshotEnvelope } from "@mogul/protocol";
import { CITY_POS, EDGE_LABELS, EDGE_ROUTES, REGION_ANCHOR, REGION_POLYGON, VIEWBOX, assertLayoutComplete } from "./map-layout.js";
import { MAX_ZOOM, panBy, zoomAt, zoomLevel } from "./map-zoom.js";
import type { View } from "./map-zoom.js";
import {
  STEPS,
  auctionModel,
  buildModel,
  openingNightSummary,
  playerName,
  stageForPhase,
  talentCost,
  talentModel,
  unmatchedActions,
  withAmount,
} from "./stage-model.js";
import type { StageId } from "./stage-model.js";

const R = DEFAULT_RULES;
const NS = "http://www.w3.org/2000/svg";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const storage = {
  get nickname(): string | null {
    return localStorage.getItem("mogul:nickname");
  },
  set nickname(v: string) {
    localStorage.setItem("mogul:nickname", v);
  },
  get code(): string | null {
    return localStorage.getItem("mogul:code");
  },
  set code(v: string) {
    localStorage.setItem("mogul:code", v);
  },
  clear(): void {
    localStorage.removeItem("mogul:nickname");
    localStorage.removeItem("mogul:code");
  },
};

let ws: WebSocket | null = null;
let nickname = storage.nickname ?? "";
let room: RoomState | null = null;
let snapshot: SnapshotEnvelope | null = null;
let mySeatId: string | null = null;
let myIsHost = false;

// --- client-only view state ---
let stage: StageId = "auction";
let lastPhase: string | null = null;
let mapExpanded = false;
/** Zoomed view of the full map; kept across re-renders so a snapshot doesn't reset it. */
let mapView: View = { ...VIEWBOX };
/** A command is in flight: controls stay disabled until the next snapshot or rejection. */
let awaiting = false;
/** The WebSocket is open; controls are disabled while it is down. */
let connected = false;
/** Opening night number whose summary the player has dismissed (or acted past). */
let dismissedNight = 0;
/** Bid amount chosen in the open auction, keyed by property and current bid. */
let bid = { key: "", amount: 0 };
/** Talent quantity chosen per property. */
const talentQty: Record<string, number> = {};
/** Remaining units of a multi-unit talent purchase, sent one command at a time. */
let pendingBuy: { propertyId: string; remaining: number } | null = null;

function showView(name: "join" | "lobby" | "game"): void {
  for (const v of ["view-join", "view-lobby", "view-game"]) {
    $(v).classList.toggle("active", v === `view-${name}`);
  }
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    connected = true;
    // Rejoin the stored room after a reload or a dropped connection; the server
    // reattaches a returning player's seat by nickname.
    if (storage.code && storage.nickname) {
      nickname = storage.nickname;
      send({ type: "join-room", code: storage.code, nickname });
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    handle(msg);
  };
  ws.onclose = () => {
    // Nothing in flight will be answered: release the lock and say why controls are disabled.
    connected = false;
    awaiting = false;
    pendingBuy = null;
    renderGame();
    // Reconnect: rejoin the room with the same nickname and re-render from the fresh snapshot.
    if (storage.code && storage.nickname) {
      setTimeout(() => connect(), 1000);
    } else {
      showView("join");
    }
  };
}

function send(msg: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Submit a game command and lock the controls until the server answers. */
function sendCommand(command: Action["command"]): void {
  awaiting = true;
  const summary = snapshot ? openingNightSummary(snapshot.state) : null;
  if (summary) dismissedNight = Math.max(dismissedNight, summary.night);
  send({ type: "command", command });
  renderGame();
}

function handle(msg: ServerMessage): void {
  switch (msg.type) {
    case "room-state":
      room = msg.room;
      mySeatId = msg.room.seats.find((s) => s.nickname === nickname)?.id ?? null;
      myIsHost = msg.room.seats.find((s) => s.nickname === nickname)?.isHost ?? false;
      // Remember the room (for the host too) so a reload rejoins the same seat.
      if (mySeatId) storage.code = msg.room.code;
      renderLobby();
      break;
    case "snapshot":
      snapshot = msg.snapshot;
      awaiting = false;
      continuePendingBuy();
      renderGame();
      break;
    case "reject":
      awaiting = false;
      pendingBuy = null;
      flash(msg.reason);
      renderGame();
      break;
    case "error":
      if (!room) {
        // Could not (re)join: forget the stored room and go back to the join form.
        localStorage.removeItem("mogul:code");
        showView("join");
        $("join-error").textContent = msg.reason;
      } else {
        flash(msg.reason);
      }
      break;
    case "game-ended":
      flash(`Game over — winner: ${snapshot ? playerName(snapshot.state, msg.winnerId) : msg.winnerId}`);
      break;
    case "chat":
      break;
  }
}

/** Send the next unit of a multi-unit talent purchase with the fresh state version. */
function continuePendingBuy(): void {
  if (!pendingBuy || !snapshot) return;
  const next = snapshot.actions.find(
    (a) => a.command.type === "buy-talent" && a.command.propertyId === pendingBuy!.propertyId,
  );
  if (!myTurn() || snapshot.state.phase !== "talent-market" || !next || pendingBuy.remaining <= 0) {
    pendingBuy = null;
    return;
  }
  pendingBuy.remaining--;
  if (pendingBuy.remaining === 0) pendingBuy = null;
  awaiting = true;
  send({ type: "command", command: next.command });
}

function flash(text: string): void {
  const log = $("log");
  const line = document.createElement("div");
  line.textContent = `! ${text}`;
  log.prepend(line);
}

function renderLobby(): void {
  if (!room) return;
  showView(room.status === "playing" || room.status === "ended" ? "game" : "lobby");
  $("room-code").textContent = room.code;
  $("lobby-status").textContent = room.status;
  const configEl = $("room-config");
  configEl.textContent = `If a player disconnects, a bot takes over their seat after ${room.config.graceSeconds}s.`;
  const roster = $("roster");
  roster.innerHTML = "";
  for (const seat of room.seats) {
    const div = document.createElement("div");
    div.textContent = `${seat.nickname} — ${seat.kind}${seat.botControlled ? " (bot-controlled)" : ""}${seat.isHost ? " (host)" : ""}`;
    roster.append(div);
  }
  ($("btn-start") as HTMLButtonElement).disabled = !myIsHost || room.seats.length < 2;
  ($("btn-add-bot") as HTMLButtonElement).disabled = !myIsHost || room.seats.length >= room.config.maxPlayers;
}

// ---------------- small DOM helpers ----------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, opts: { primary?: boolean; quiet?: boolean; enabled?: boolean } = {}): HTMLButtonElement {
  const b = el("button", opts.primary ? "primary" : opts.quiet ? "quiet" : undefined, label);
  b.disabled = opts.enabled === false || awaiting || !connected;
  b.onclick = onClick;
  return b;
}

/** A −/+ stepper around a value, clamped to [min, max]. */
function stepper(value: number, min: number, max: number, onChange: (v: number) => void, format = (v: number) => String(v)): HTMLElement {
  const wrap = el("span", "qty");
  const dec = button("−", () => onChange(Math.max(min, value - 1)), { enabled: value > min });
  const inc = button("+", () => onChange(Math.min(max, value + 1)), { enabled: value < max });
  dec.setAttribute("aria-label", "Decrease");
  inc.setAttribute("aria-label", "Increase");
  wrap.append(dec, el("span", "val", format(value)), inc);
  return wrap;
}

function myTurn(): boolean {
  return snapshot !== null && !snapshot.ended && mySeatId !== null && snapshot.activeSeat === mySeatId;
}

function canAct(): boolean {
  return myTurn() && !awaiting;
}

function waitingOn(s: GameState): string {
  return snapshot?.activeSeat ? `Waiting on ${playerName(s, snapshot.activeSeat)}` : "Resolving…";
}

function stageHead(title: string, hint: string, extra?: HTMLElement): HTMLElement {
  const head = el("div", "stage-head");
  head.append(el("h2", undefined, title));
  const right = el("div", "row");
  right.append(el("span", "hint", hint));
  if (extra) right.append(extra);
  head.append(right);
  return head;
}

// ---------------- game view ----------------

function renderGame(): void {
  if (!snapshot) return;
  const s = snapshot.state;
  showView("game");
  document.body.className = `era-${s.era}`;

  if (s.phase !== lastPhase) {
    lastPhase = s.phase;
    mapExpanded = false;
  }
  stage = stageForPhase(s.phase, stage);

  renderHeader(s);
  renderTurnOrder(s);
  renderPlayers(s);
  renderLog(s);
  renderMapCard(s);
  renderStage(s);
}

function renderHeader(s: GameState): void {
  const stepperEl = $("stepper");
  stepperEl.innerHTML = "";
  for (const step of STEPS) {
    const chip = el("span", "step", step.label);
    if (step.phase === s.phase) {
      chip.classList.add("current");
      chip.setAttribute("aria-current", "step");
    }
    stepperEl.append(chip);
  }
  const status = $("status");
  status.innerHTML = "";
  status.append(`Round ${s.round} · ${s.era === "golden" ? "golden age" : `${s.era} era`} · `);
  if (!connected) status.append(el("span", "you", "Connection lost — reconnecting…"));
  else if (snapshot!.ended) status.append("Game over");
  else if (myTurn()) status.append(el("span", "you", "Your turn"));
  else status.append(waitingOn(s));
}

function renderStage(s: GameState): void {
  const summaryEl = $("summary");
  const body = $("stage-body");
  const fallback = $("fallback");
  summaryEl.innerHTML = "";
  body.innerHTML = "";
  fallback.innerHTML = "";

  if (snapshot!.ended) {
    body.append(gameOverCard(s));
    return;
  }

  const summary = openingNightSummary(s);
  if (summary && summary.night > dismissedNight) summaryEl.append(summaryCard(summary));

  if (mapExpanded || stage === "map") body.append(mapStage(s));
  else if (stage === "talent") body.append(talentStage(s));
  else body.append(auctionStage(s));

  // Any legal move the stage does not render still gets a button, so nothing is hidden.
  if (myTurn()) {
    const extra = unmatchedActions(stageForPhase(s.phase, stage), snapshot!.actions);
    if (extra.length > 0) {
      const card = el("div", "card");
      card.append(el("h3", undefined, "Other moves"));
      for (const a of extra) card.append(button(a.label, () => sendCommand(a.command)));
      fallback.append(card);
    }
  }
}

function summaryCard(summary: NonNullable<ReturnType<typeof openingNightSummary>>): HTMLElement {
  const card = el("div", "card summary");
  card.append(stageHead(`Opening night ${summary.night}`, "Theatres lit and box office earned", button("Dismiss", () => {
    dismissedNight = summary.night;
    renderGame();
  }, { quiet: true })));
  const table = el("table");
  for (const r of summary.rows) {
    const tr = el("tr");
    tr.append(el("td", undefined, r.name));
    tr.append(el("td", "num", `${r.lit} lit`));
    tr.append(el("td", "num money", `$${r.income}`));
    table.append(tr);
  }
  card.append(table);
  return card;
}

function gameOverCard(s: GameState): HTMLElement {
  const card = el("div", "card");
  const winner = snapshot!.winnerId ? playerName(s, snapshot!.winnerId) : "nobody";
  card.append(stageHead("Game over", `${winner} wins`));
  const table = el("table", "needs");
  const head = el("tr");
  for (const h of ["Studio", "Theatres built", "Cash"]) head.append(el("th", undefined, h));
  table.append(head);
  for (const p of s.players) {
    const tr = el("tr");
    tr.append(el("td", undefined, `${p.name}${p.id === snapshot!.winnerId ? " — winner" : ""}`));
    tr.append(el("td", undefined, String(p.theaters.length)));
    tr.append(el("td", "money", `$${p.cash}`));
    table.append(tr);
  }
  card.append(table);
  return card;
}

// ---------------- auction stage ----------------

function auctionStage(s: GameState): HTMLElement {
  const m = auctionModel(s, R, myTurn() ? snapshot!.actions : [], mySeatId);
  const card = el("div", "card");

  let hint: string;
  if (s.phase !== "rights-auction") hint = "The auction is closed for this round.";
  else if (m.open) hint = myTurn() ? "Raise the bid or drop out." : waitingOn(s);
  else if (myTurn()) hint = m.passRound ? "Choose a property to auction, or pass for the round." : "Choose a property to auction. Every studio must buy one this round.";
  else hint = `${waitingOn(s)} to choose a property`;
  card.append(stageHead("Rights auction", hint));

  if (m.open) card.append(onTheBlock(s, m));

  card.append(el("h3", undefined, "Current market"));
  const current = el("div", "cards");
  for (const c of m.cards.filter((x) => !x.future)) current.append(propertyCard(c));
  card.append(current);

  card.append(el("h3", undefined, "Coming up"));
  const future = el("div", "cards");
  for (const c of m.cards.filter((x) => x.future)) future.append(propertyCard(c));
  card.append(future);

  if (m.passRound && myTurn()) {
    const foot = el("div", "stage-foot");
    foot.append(button("Pass for this round", () => sendCommand(m.passRound!.command)));
    card.append(foot);
  }
  return card;
}

function propertyCard(c: ReturnType<typeof auctionModel>["cards"][number]): HTMLElement {
  const card = el("div", `pcard${c.future ? " future" : ""}${c.onBlock ? " on-block" : ""}`);
  card.append(el("div", "pc-name", c.name));
  card.append(el("div", "pc-meta", `Lights ${c.output} theatre${c.output === 1 ? "" : "s"} · needs ${c.talentName}`));
  card.append(el("div", "pc-price", c.onBlock ? "On the block" : `From $${c.faceValue}`));
  if (c.start) card.append(button(`Auction from $${c.faceValue}`, () => sendCommand(c.start!.command), { primary: true, enabled: canAct() }));
  return card;
}

function onTheBlock(s: GameState, m: ReturnType<typeof auctionModel>): HTMLElement {
  const open = m.open!;
  const block = el("div", "block");

  const prop = el("div", "b-prop");
  prop.append(el("div", "muted", "On the block"));
  prop.append(el("div", "b-name", open.name));
  prop.append(el("div", "muted", `Lights ${open.output} theatres · needs ${open.talentName}`));
  prop.append(el("div", "muted", `Still in: ${open.biddersIn.map((id) => playerName(s, id)).join(", ")}`));
  block.append(prop);

  const high = el("div", "b-bid");
  high.append(el("div", "muted", "High bid"));
  high.append(el("div", "amount", `$${open.currentBid}`));
  high.append(el("div", "muted", open.highestBidder ? playerName(s, open.highestBidder) : ""));
  block.append(high);

  if (myTurn()) {
    const controls = el("div", "b-controls");
    if (m.bid) {
      const key = `${open.propertyId}:${open.currentBid}`;
      if (bid.key !== key) bid = { key, amount: m.bid.min };
      bid.amount = Math.min(Math.max(bid.amount, m.bid.min), m.bid.max);
      controls.append(stepper(bid.amount, m.bid.min, m.bid.max, (v) => {
        bid.amount = v;
        renderGame();
      }, (v) => `$${v}`));
      const action = m.bid.action;
      controls.append(button(`Bid $${bid.amount}`, () => sendCommand(withAmount(action, bid.amount)), { primary: true, enabled: canAct() }));
    } else {
      controls.append(el("span", "muted", "You can't afford to raise."));
    }
    if (m.dropOut) controls.append(button("Drop out", () => sendCommand(m.dropOut!.command), { enabled: canAct() }));
    block.append(controls);
  }
  return block;
}

// ---------------- talent stage ----------------

function talentStage(s: GameState): HTMLElement {
  const m = talentModel(s, R, myTurn() ? snapshot!.actions : [], mySeatId);
  const card = el("div", "card");
  const hint =
    s.phase !== "talent-market"
      ? "The talent market is closed for this round."
      : myTurn()
        ? "Contract talent for your properties. Each theatre you light uses one unit."
        : waitingOn(s);
  card.append(stageHead("Talent market", hint));

  const me = mySeatId ? playerById(s, mySeatId) : null;
  const yours = el("h3", undefined, "Your properties");
  card.append(yours);
  if (me) {
    const cheapest = me.theaters.length === 0 ? 10 : null;
    card.append(el("div", "hint", `You have $${me.cash} and ${me.theaters.length} theatre${me.theaters.length === 1 ? "" : "s"} built.` +
      (cheapest ? " Keep at least $10 if you want to build your first theatre this round." : " Keep some cash for building.")));
  }
  if (m.properties.length === 0) {
    card.append(el("div", "muted", "You don't own any properties yet."));
  } else {
    const table = el("table", "needs");
    const head = el("tr");
    for (const h of ["Property", "Talent", "Contracted", "Full night", myTurn() ? "Buy" : ""]) head.append(el("th", undefined, h));
    table.append(head);
    for (const p of m.properties) {
      const tr = el("tr");
      const name = el("td");
      name.append(el("div", undefined, p.name), el("div", "muted", `lights up to ${p.output}`));
      tr.append(name);
      tr.append(el("td", undefined, p.trackName));
      tr.append(el("td", undefined, `${p.contracted} of ${p.storage}`));
      tr.append(el("td", p.short > 0 ? "short" : "ok", p.short > 0 ? `${p.short} short` : "ready"));
      const buyCell = el("td");
      if (p.buy && myTurn()) {
        const qty = Math.min(Math.max(talentQty[p.propertyId] ?? Math.max(1, Math.min(p.short, p.maxBuy)), 1), p.maxBuy);
        talentQty[p.propertyId] = qty;
        const cost = talentCost(s, R, p.track, qty) ?? 0;
        const row = el("div", "row");
        row.append(stepper(qty, 1, p.maxBuy, (v) => {
          talentQty[p.propertyId] = v;
          renderGame();
        }));
        row.append(button(`Buy ${qty} for $${cost}`, () => {
          pendingBuy = qty > 1 ? { propertyId: p.propertyId, remaining: qty - 1 } : null;
          delete talentQty[p.propertyId];
          sendCommand(p.buy!.command);
        }, { primary: true, enabled: canAct() }));
        buyCell.append(row);
      } else if (myTurn()) {
        buyCell.append(el("span", "muted", p.contracted >= p.storage ? "contracts full" : "can't afford"));
      }
      tr.append(buyCell);
      table.append(tr);
    }
    card.append(table);
  }

  card.append(el("h3", undefined, "Talent tracks"));
  const tracks = el("div", "tracks");
  for (const t of m.tracks) {
    const box = el("div", "track");
    const name = el("div", "t-name");
    name.append(el("span", undefined, t.name), el("span", "muted", `${t.supply} available`));
    box.append(name);
    const slots = el("div", "t-slots");
    for (const slot of t.slots) slots.append(el("span", `tslot${slot.count === 0 ? " empty" : ""}`, `$${slot.price} × ${slot.count}`));
    box.append(slots);
    tracks.append(box);
  }
  card.append(tracks);

  if (m.endTurn && myTurn()) {
    const foot = el("div", "stage-foot");
    foot.append(button("End your talent purchases", () => sendCommand(m.endTurn!.command), { enabled: canAct() }));
    card.append(foot);
  }
  return card;
}

// ---------------- map stage ----------------

function stageLabel(id: StageId): string {
  return id === "auction" ? "auction" : id === "talent" ? "talent market" : "map";
}

function mapStage(s: GameState): HTMLElement {
  const building = s.phase === "exhibition";
  const m = buildModel(s, myTurn() && building ? snapshot!.actions : []);
  const card = el("div", "card");
  const me = mySeatId ? playerById(s, mySeatId) : null;
  let hint: string;
  if (!building) hint = "Viewing only. You build during the build phase.";
  else if (!myTurn()) hint = waitingOn(s);
  else if (m.buildable.size > 0) hint = "Click a city with a green badge to build there. The badge shows the total cost.";
  else if (me && me.theaters.length === 0) hint = `You need $10 for your first theatre and have $${me.cash}.`;
  else hint = "You can't afford any city your network reaches.";
  const headControl = mapExpanded && !building
    ? button(`Back to ${stageLabel(stage)}`, () => {
        mapExpanded = false;
        renderGame();
      })
    : m.endTurn && myTurn()
      ? button("End your building", () => sendCommand(m.endTurn!.command), { primary: m.buildable.size === 0, enabled: canAct() })
      : undefined;
  card.append(stageHead("Exhibition map", hint, headControl));

  const holder = el("div");
  renderMapInto(holder, s, { interactive: building && canAct(), buildable: m.buildable });
  card.append(holder);

  const legend = el("div", "legend");
  legend.innerHTML =
    "Theatre slots: 1st <b>$10</b> · 2nd <b>$15</b> · 3rd <b>$20</b> · " +
    "Slots per city: silent <b>1</b> · talkies <b>2</b> · golden age <b>3</b><br />" +
    'Studios: <span class="swatch s0"></span><span class="swatch s1"></span><span class="swatch s2"></span><span class="swatch s3"></span> · ' +
    "Green badge: build now · Ring: your theatre · Dimmed: no route · Numbers under a city: route + slot cost<br />" +
    "Scroll or pinch to zoom · Drag to move around";
  card.append(legend);
  return card;
}

function renderMapCard(s: GameState): void {
  const card = $("map-card");
  const showingFull = mapExpanded || stage === "map";
  // During the build phase the full map is the stage, so the thumbnail is redundant.
  card.style.display = stage === "map" && !mapExpanded ? "none" : "";
  const toggle = $<HTMLButtonElement>("btn-map-toggle");
  toggle.textContent = showingFull ? "Collapse" : "Expand";
  toggle.onclick = () => {
    mapExpanded = !mapExpanded;
    renderGame();
  };
  const thumb = $("map-thumb");
  if (showingFull) {
    thumb.innerHTML = "";
    return;
  }
  renderMapInto(thumb, s, { interactive: false, buildable: new Set(), thumbnail: true });
  thumb.onclick = () => {
    mapExpanded = true;
    renderGame();
  };
}

// ---------------- rail ----------------

/** Turn-order strip: active, next, and "you" marked from the live snapshot order. */
function renderTurnOrder(s: GameState): void {
  const wrap = $("turn-order");
  wrap.innerHTML = "";
  const active = snapshot?.activeSeat ?? null;
  for (let i = 0; i < s.turnOrder.length; i++) {
    const id = s.turnOrder[i];
    const p = playerById(s, id);
    const chip = el("span", "tchip", p.name);
    if (active === id) chip.classList.add("active");
    if (active !== null && i === (s.turnOrder.indexOf(active) + 1) % s.turnOrder.length) chip.classList.add("next");
    if (id === mySeatId) chip.classList.add("me");
    wrap.append(chip);
    if (i < s.turnOrder.length - 1) wrap.append(el("span", "tsep", "▸"));
  }
}

function renderPlayers(s: GameState): void {
  const wrap = $("players");
  wrap.innerHTML = "";
  for (const p of s.players) {
    const row = el("div", "prow");
    if (snapshot?.activeSeat === p.id) row.classList.add("turn-highlight");
    row.append(el("span", "pname", p.name));
    row.append(el("span", "money", `$${p.cash}`));
    row.append(el("span", "pmeta", `${p.theaters.length} built · ${p.litLastNight} lit`));
    wrap.append(row);
    for (const owned of p.properties) {
      const def = propertyDef(R, owned.propertyId);
      const have = owned.contracted[def.talentType] ?? 0;
      wrap.append(el("div", "prop", `${def.name} · lights ${def.output} · ${R.talentTracks[def.talentType].name} ${have}`));
    }
  }
}

function renderLog(s: GameState): void {
  const logEl = $("log");
  if (logEl.dataset.version === String(s.version)) return;
  logEl.dataset.version = String(s.version);
  logEl.innerHTML = "";
  for (const line of s.log.slice(-60)) logEl.append(el("div", undefined, line));
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------- map rendering ----------------

/** Player color for a seat index (matches the legend swatches). */
function playerColor(state: GameState, ownerId: string): string {
  const colors = ["#c0392b", "#27ae60", "#2980b9", "#8e44ad"];
  const idx = state.players.findIndex((p) => p.id === ownerId);
  return colors[Math.max(0, idx % colors.length)];
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

function portPoint(point: { x: number; y: number }, toward: { x: number; y: number }, amount = 10): { x: number; y: number } {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: point.x + (dx / length) * amount, y: point.y + (dy / length) * amount };
}

function svgPath(points: { x: number; y: number }[], curved: boolean): string {
  if (points.length < 2) return "";
  const route = [
    portPoint(points[0], points[1]),
    ...points.slice(1, -1),
    portPoint(points[points.length - 1], points[points.length - 2]),
  ];
  if (!curved || route.length < 3) {
    return route.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }
  if (route.length === 3) {
    return `M ${route[0].x} ${route[0].y} Q ${route[1].x} ${route[1].y} ${route[2].x} ${route[2].y}`;
  }
  let path = `M ${route[0].x} ${route[0].y}`;
  for (let i = 1; i < route.length - 1; i++) {
    const corner = route[i];
    const next = route[i + 1];
    const midpoint = { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
    path += ` Q ${corner.x} ${corner.y} ${midpoint.x} ${midpoint.y}`;
  }
  const end = route[route.length - 1];
  path += ` L ${end.x} ${end.y}`;
  return path;
}

function cityDef(rules: GameRules, cityId: string) {
  return rules.map.cities.find((city) => city.id === cityId)!;
}

function regionOf(rules: GameRules, cityId: string): string {
  return cityDef(rules, cityId).region;
}

/**
 * Draw the exhibition map into a container from the generated layout data. The same
 * renderer serves the full map (interactive during the player's build turn) and the
 * rail thumbnail (no controls, text hidden by CSS).
 */
function renderMapInto(
  wrap: HTMLElement,
  s: GameState,
  opts: { interactive: boolean; buildable: Set<string>; thumbnail?: boolean },
): void {
  wrap.innerHTML = "";
  assertLayoutComplete(R);

  const svg = svgEl("svg");
  svg.classList.add("map");
  if (opts.thumbnail) svg.classList.add("thumb");
  const view = opts.thumbnail ? VIEWBOX : mapView;
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", opts.thumbnail ? "Exhibition map thumbnail" : "Exhibition map");

  const me = mySeatId ? playerById(s, mySeatId) : null;
  const buildable = opts.interactive ? opts.buildable : new Set<string>();
  const routes = me && me.theaters.length > 0 ? pathCosts(R, me) : null;
  const activeRegion = new Set(R.map.regions.filter((r) => r.minPlayers <= s.players.length).map((r) => r.id));

  // Region territories.
  for (const reg of R.map.regions) {
    const poly = REGION_POLYGON[reg.id];
    const anchor = REGION_ANCHOR[reg.id];
    if (!poly || !anchor) continue;
    const inPlay = activeRegion.has(reg.id);
    const shape = svgEl("polygon");
    shape.setAttribute("points", poly.map((p) => `${p.x},${p.y}`).join(" "));
    shape.classList.add("region", inPlay ? "in" : "out");
    svg.append(shape);
    const label = svgEl("text");
    label.setAttribute("x", String(anchor.x));
    label.setAttribute("y", String(anchor.y));
    label.classList.add("region-label", inPlay ? "in" : "out");
    label.textContent = inPlay ? reg.name : `${reg.name} — opens at ${reg.minPlayers} players`;
    svg.append(label);
  }

  // Edge layer: lines labeled with their cost at the midpoint.
  for (const e of R.map.edges) {
    const a = CITY_POS[e.from];
    const b = CITY_POS[e.to];
    if (!a || !b) continue;
    const inPlay = activeRegion.has(regionOf(R, e.from)) && activeRegion.has(regionOf(R, e.to));
    const cross = regionOf(R, e.from) !== regionOf(R, e.to);
    const route = EDGE_ROUTES[`${e.from}:${e.to}`] ?? [a, b];
    const path = svgEl("path");
    path.setAttribute("d", svgPath(route, cross || route.length > 2));
    path.classList.add("edge", inPlay ? "in" : "out", cross ? "cross" : "local");
    svg.append(path);
    const labelAnchor = EDGE_LABELS[`${e.from}:${e.to}`] ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const label = svgEl("text");
    label.setAttribute("x", String(labelAnchor.x));
    label.setAttribute("y", String(labelAnchor.y - 3));
    label.classList.add("edge-label", inPlay ? "in" : "out", cross ? "cross" : "local");
    label.textContent = String(e.cost);
    svg.append(label);
  }

  // City nodes. Inactive regions remain visible so the layout never changes
  // when a different player count is selected.
  for (const def of R.map.cities) {
    const cityId = def.id;
    const pos = CITY_POS[cityId];
    if (!pos) continue;
    const city = s.cities[cityId];
    const inPlay = city !== undefined;
    const occupied = city?.owners.filter((o) => o !== null).length ?? 0;
    const owned = mySeatId !== null && (city?.owners.includes(mySeatId) ?? false);
    const full = inPlay && occupied >= slotsForEra(s.era);
    const tier = inPlay ? slotCost(s, cityId) : 10;
    const canBuild = inPlay && buildable.has(cityId);

    // Route info: the conn+slot breakdown when I have a network and the city is
    // reachable; "yours"/"full" for those states; empty otherwise.
    let routeInfo = "";
    if (owned) {
      routeInfo = "yours";
    } else if (full) {
      routeInfo = "full";
    } else if (inPlay && routes) {
      const edge = routes.get(cityId);
      if (edge !== undefined && edge !== Infinity) routeInfo = `${edge}+${tier}`;
    }

    const g = svgEl("g");
    g.classList.add("city");
    if (!inPlay) g.classList.add("inactive");
    if (owned) g.classList.add("mine");
    const unreachable = me !== null && me.theaters.length > 0 && !owned && !full && routeInfo === "";
    if (unreachable) g.classList.add("dim");
    if (canBuild) g.classList.add("buildable");

    // Ownership ring.
    if (owned) {
      const ring = svgEl("circle");
      ring.setAttribute("cx", String(pos.x));
      ring.setAttribute("cy", String(pos.y));
      ring.setAttribute("r", "12.5");
      ring.classList.add("ring");
      const owner = city!.owners.find((o) => o !== null)!;
      ring.style.stroke = playerColor(s, owner);
      g.append(ring);
    }

    const node = svgEl("circle");
    node.setAttribute("cx", String(pos.x));
    node.setAttribute("cy", String(pos.y));
    node.setAttribute("r", "9");
    node.classList.add("node");
    g.append(node);

    // Slot dots: occupied (owner color), empty ring, era-locked (dimmed dashed ring).
    const dotY = pos.y + 14;
    for (let i = 0; i < def.slots; i++) {
      const dx = pos.x + (i - (def.slots - 1) / 2) * 13;
      const owner = city?.owners[i];
      const locked = i >= slotsForEra(s.era);
      const dot = svgEl("circle");
      dot.setAttribute("cx", String(dx));
      dot.setAttribute("cy", String(dotY));
      dot.setAttribute("r", "3.2");
      dot.classList.add("slotdot");
      if (owner) {
        dot.classList.add("occupied");
        dot.style.fill = playerColor(s, owner);
      } else {
        dot.classList.add("empty");
      }
      if (locked) dot.classList.add("locked");
      g.append(dot);
    }

    const name = svgEl("text");
    name.setAttribute("x", String(pos.x));
    name.setAttribute("y", String(pos.y + 27));
    name.classList.add("city-name");
    name.textContent = def.name;
    g.append(name);

    const info = svgEl("text");
    info.setAttribute("x", String(pos.x));
    info.setAttribute("y", String(pos.y + 38));
    info.classList.add("city-info");
    info.textContent = routeInfo;
    g.append(info);

    // Build badge: total cost pill above the node, only when this city is buildable now.
    if (canBuild && me) {
      const cost = buildCost(s, R, mySeatId!, cityId);
      const badge = svgEl("g");
      badge.classList.add("badge");
      const rect = svgEl("rect");
      const text = `$${cost ?? tier}`;
      const w = 10 + text.length * 6.4;
      rect.setAttribute("x", String(pos.x - w / 2));
      rect.setAttribute("y", String(pos.y - 24));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", "15");
      rect.setAttribute("rx", "7.5");
      const bt = svgEl("text");
      bt.setAttribute("x", String(pos.x));
      bt.setAttribute("y", String(pos.y - 13));
      bt.textContent = text;
      badge.append(rect, bt);
      g.append(badge);
    }

    // Click-to-build: whole node group, only for currently buildable cities.
    if (canBuild) {
      g.classList.add("clickable");
      g.addEventListener("click", () => {
        if (!snapshot || awaiting) return;
        sendCommand({ type: "build", cityId, stateVersion: snapshot.state.version });
      });
    }

    svg.append(g);
  }

  wrap.append(svg);
  if (!opts.thumbnail) enableZoom(wrap, svg);
}

/**
 * Zoom and pan for the full map: wheel or pinch zooms about the pointer, a drag pans,
 * and the buttons zoom about the centre. A drag never counts as a click on a city.
 */
function enableZoom(wrap: HTMLElement, svg: SVGSVGElement): void {
  wrap.classList.add("map-frame");
  svg.classList.add("zoomable");
  const controls = el("div", "map-zoom");
  const zoomIn = button("+", () => zoomAtCentre(1.5), { quiet: true });
  const zoomOut = button("−", () => zoomAtCentre(1 / 1.5), { quiet: true });
  const fit = button("Fit", () => apply({ ...VIEWBOX }), { quiet: true });
  zoomIn.setAttribute("aria-label", "Zoom in");
  zoomOut.setAttribute("aria-label", "Zoom out");
  fit.setAttribute("aria-label", "Show the whole map");
  controls.append(zoomIn, zoomOut, fit);
  wrap.append(controls);

  function apply(view: View): void {
    mapView = view;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
    const level = zoomLevel(view, VIEWBOX);
    zoomIn.disabled = level >= MAX_ZOOM;
    zoomOut.disabled = fit.disabled = level <= 1;
    // Zoomed in, a touch drag pans the map; at full size it scrolls the page as usual.
    svg.style.touchAction = level > 1 ? "none" : "pan-y";
  }
  function toMap(clientX: number, clientY: number): { x: number; y: number } {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: mapView.x + mapView.width / 2, y: mapView.y + mapView.height / 2 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  /** Map units per screen pixel (the SVG letterboxes, so the larger ratio applies). */
  function unitsPerPixel(): number {
    const rect = svg.getBoundingClientRect();
    return Math.max(mapView.width / rect.width, mapView.height / rect.height);
  }
  function zoomAtCentre(factor: number): void {
    apply(zoomAt(mapView, VIEWBOX, factor, { x: mapView.x + mapView.width / 2, y: mapView.y + mapView.height / 2 }));
  }
  apply(mapView);

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      apply(zoomAt(mapView, VIEWBOX, Math.exp(-pixels * 0.002), toMap(e.clientX, e.clientY)));
    },
    { passive: false },
  );

  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let start = { x: 0, y: 0 };
  let pinchDistance = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragged = false;
      start = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      pinchDistance = spread().distance;
    }
  });
  svg.addEventListener("pointermove", (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) {
      pointers.set(e.pointerId, now);
      const { distance, mid } = spread();
      if (pinchDistance > 0) apply(zoomAt(mapView, VIEWBOX, distance / pinchDistance, toMap(mid.x, mid.y)));
      pinchDistance = distance;
      dragged = true;
      return;
    }
    // Capture only once a real drag starts: capturing on press would retarget the
    // click away from the city under the pointer.
    if (!dragged && Math.hypot(now.x - start.x, now.y - start.y) < 4) return;
    if (!dragged) {
      dragged = true;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("panning");
    }
    const k = unitsPerPixel();
    apply(panBy(mapView, VIEWBOX, (last.x - now.x) * k, (last.y - now.y) * k));
    pointers.set(e.pointerId, now);
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) svg.classList.remove("panning");
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);
  svg.addEventListener(
    "click",
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
    },
    true,
  );
}

// --- join/lobby wiring ---
$("btn-create").onclick = () => {
  nickname = ($("nickname") as HTMLInputElement).value.trim() || "Producer";
  storage.nickname = nickname;
  send({ type: "create-room", nickname });
};
$("btn-join").onclick = () => {
  nickname = ($("nickname") as HTMLInputElement).value.trim() || "Producer";
  storage.nickname = nickname;
  const code = ($("code") as HTMLInputElement).value.trim().toUpperCase();
  storage.code = code;
  send({ type: "join-room", code, nickname });
};
$("btn-add-bot").onclick = () => send({ type: "add-bot" });
$("btn-start").onclick = () => send({ type: "start-game" });

// Start on the join form; with a stored room, connect() rejoins it on open and the
// room state switches the view.
if (storage.nickname) ($("nickname") as HTMLInputElement).value = storage.nickname;
if (storage.code) ($("code") as HTMLInputElement).value = storage.code;
showView("join");
connect();
