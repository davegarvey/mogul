import {
  DEFAULT_RULES,
  buildCost,
  pathCosts,
  playerById,
  propertyDef,
  slotCost,
  slotsForEra,
} from "@mogul/engine";
import type { GameState, GameRules, TalentTrackId } from "@mogul/engine";
import type { ClientMessage, RoomState, ServerMessage, SnapshotEnvelope } from "@mogul/protocol";
import { CITY_POS, EDGE_LABELS, EDGE_ROUTES, REGION_ANCHOR, REGION_POLYGON, VIEWBOX, assertLayoutComplete } from "./map-layout.js";

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

function showView(name: "join" | "lobby" | "game"): void {
  for (const v of ["view-join", "view-lobby", "view-game"]) {
    $(v).classList.toggle("active", v === `view-${name}`);
  }
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    handle(msg);
  };
  ws.onclose = () => {
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

function handle(msg: ServerMessage): void {
  switch (msg.type) {
    case "room-state":
      room = msg.room;
      mySeatId = msg.room.seats.find((s) => s.nickname === nickname)?.id ?? null;
      myIsHost = msg.room.seats.find((s) => s.nickname === nickname)?.isHost ?? false;
      renderLobby();
      break;
    case "snapshot":
      snapshot = msg.snapshot;
      renderGame();
      break;
    case "reject":
      flash(msg.reason);
      break;
    case "error":
      flash(msg.reason);
      break;
    case "game-ended":
      flash(`Game over — winner: ${msg.winnerId}`);
      break;
    case "chat":
      break;
  }
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

function renderGame(): void {
  if (!snapshot) return;
  const s = snapshot.state;
  showView("game");

  document.body.className = `era-${s.era}`;
  $("era-pill").textContent = `Era: ${s.era}`;
  $("phase-pill").textContent = `Phase: ${s.phase}`;
  $("round-pill").textContent = `Round ${s.round}`;
  renderTurnPill();

  renderPlayers(s);
  renderMarket(s);
  renderTalent(s);
  renderTurnOrder(s);
  renderMap(s);
  renderLog(s);
  renderActions();
}

/** Turn banner: whose move it is. */
function renderTurnPill(): void {
  const pill = $("turn-pill");
  const snap = snapshot;
  if (!snap) {
    pill.textContent = "";
    return;
  }
  if (snap.ended) {
    pill.textContent = "Game over";
    return;
  }
  if (snap.activeSeat === null) {
    pill.textContent = "Automatic phase…";
    return;
  }
  const who = snap.state.players.find((p) => p.id === snap.activeSeat)?.name ?? "?";
  pill.textContent = snap.activeSeat === mySeatId ? "Your turn" : `Waiting on ${who}`;
}

function renderPlayers(s: GameState): void {
  const wrap = $("players");
  wrap.innerHTML = "";
  for (const p of s.players) {
    const row = document.createElement("div");
    row.className = "prow";
    if (snapshot?.activeSeat === p.id) row.classList.add("turn-highlight");
    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = `${p.name}${p.id === mySeatId ? " (you)" : ""}`;
    row.append(name);
    const money = document.createElement("span");
    money.className = "money";
    money.textContent = `$${p.cash}`;
    row.append(money);
    const meta = document.createElement("span");
    meta.className = "pmeta";
    meta.textContent = `${p.theaters.length} thtr · lit ${p.litLastNight}`;
    row.append(meta);
    wrap.append(row);
    for (const owned of p.properties) {
      const def = propertyDef(R, owned.propertyId);
      const line = document.createElement("div");
      line.className = "prop";
      line.textContent = `${def.name} · out ${def.output}, ${def.talentType} — contracted: ${Object.entries(owned.contracted).map(([t, n]) => `${t}: ${n}`).join(", ") || "none"}`;
      wrap.append(line);
    }
  }
}

function renderMarket(s: GameState): void {
  const wrap = $("market");
  wrap.innerHTML = "";
  const row = (slot: { propertyId: string }, future: boolean): HTMLElement => {
    const def = propertyDef(R, slot.propertyId);
    const el = document.createElement("div");
    el.className = `mrow${future ? " future" : ""}`;
    el.innerHTML = `<span class="mname">${def.name}</span><span class="mprice">bid ${def.faceValue}</span><span class="mmeta">out ${def.output} · ${def.talentType}</span>`;
    return el;
  };
  for (const slot of s.market.current) wrap.append(row(slot, false));
  for (const slot of s.market.future) wrap.append(row(slot, true));
}

function renderTalent(s: GameState): void {
  const wrap = $("talent");
  wrap.innerHTML = "";
  for (const track of Object.keys(s.talent) as TalentTrackId[]) {
    const def = R.talentTracks[track];
    const st = s.talent[track];
    const el = document.createElement("div");
    el.className = "trow";
    el.innerHTML = `<b>${def.name}</b> ${def.slots.map((sd, i) => `price ${sd.price}: ${st.slots[i]}`).join(" · ")}`;
    wrap.append(el);
  }
}

/** Turn-order strip: active, next, and "you" marked from the live snapshot order. */
function renderTurnOrder(s: GameState): void {
  const wrap = $("turn-order");
  wrap.innerHTML = "";
  const active = snapshot?.activeSeat ?? null;
  for (let i = 0; i < s.turnOrder.length; i++) {
    const id = s.turnOrder[i];
    const p = playerById(s, id);
    const chip = document.createElement("span");
    chip.className = "tchip";
    if (active === id) chip.classList.add("active");
    if (active !== null && i === (s.turnOrder.indexOf(active) + 1) % s.turnOrder.length) {
      chip.classList.add("next");
    }
    if (id === mySeatId) chip.classList.add("me");
    chip.textContent = p.name;
    wrap.append(chip);
    if (i < s.turnOrder.length - 1) {
      const sep = document.createElement("span");
      sep.className = "tsep";
      sep.textContent = "▸";
      wrap.append(sep);
    }
  }
}

/** Player color for a seat index (matches the CSS p0..p3 slot classes). */
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

function renderMap(s: GameState): void {
  const wrap = $("map");
  wrap.innerHTML = "";
  assertLayoutComplete(R);

  const svg = svgEl("svg");
  svg.classList.add("map");
  svg.setAttribute("viewBox", `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`);

  const me = mySeatId ? playerById(s, mySeatId) : null;
  const myTurn =
    snapshot !== null && mySeatId !== null && snapshot.activeSeat === mySeatId && s.phase === "exhibition";
  const buildable = new Set<string>();
  if (myTurn) {
    for (const a of snapshot!.actions) {
      if (a.command.type === "build" && a.command.cityId !== undefined) buildable.add(a.command.cityId);
    }
  }
  const routes = me && me.theaters.length > 0 ? pathCosts(R, me) : null;
  const activeRegion = new Set(
    R.map.regions.filter((r) => r.minPlayers <= s.players.length).map((r) => r.id),
  );

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
    const inPlay =
      activeRegion.has(regionOf(R, e.from)) && activeRegion.has(regionOf(R, e.to));
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

    // Route info: show the conn+slot breakdown only when it's meaningful —
    // when I have a network and the city is reachable. "yours"/"full" for
    // those states. Empty otherwise (the legend covers the flat $10 first
    // build and the slot-tier tiers).
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
      const text = String(cost ?? tier);
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
        if (!snapshot) return;
        send({
          type: "command",
          command: { type: "build", cityId, stateVersion: snapshot.state.version },
        });
      });
    }

    svg.append(g);
  }

  wrap.append(svg);
}

function renderLog(s: GameState): void {
  const logEl = $("log");
  if (logEl.dataset.version === String(s.version)) return;
  logEl.dataset.version = String(s.version);
  logEl.innerHTML = "";
  for (const line of s.log.slice(-60)) {
    const div = document.createElement("div");
    div.textContent = line;
    logEl.append(div);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function renderActions(): void {
  const wrap = $("actions");
  wrap.innerHTML = "";
  if (!snapshot) return;
  if (snapshot.ended) {
    const div = document.createElement("div");
    div.textContent = "Game over.";
    wrap.append(div);
    return;
  }
  if (snapshot.activeSeat !== mySeatId) {
    const div = document.createElement("div");
    div.textContent = "Waiting for the active studio…";
    wrap.append(div);
    return;
  }
  for (const action of snapshot.actions) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.onclick = () => {
      send({ type: "command", command: action.command });
      btn.disabled = true;
    };
    wrap.append(btn);
  }
  if (snapshot.actions.length === 0) {
    const div = document.createElement("div");
    div.textContent = "No legal actions.";
    wrap.append(div);
  }
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

// Auto-rejoin on load when we have a stored room.
if (storage.nickname) ($("nickname") as HTMLInputElement).value = storage.nickname;
if (storage.code) ($("code") as HTMLInputElement).value = storage.code;
if (storage.nickname && storage.code) {
  nickname = storage.nickname;
  connect();
} else {
  showView("join");
}

// Live connection (no stored room yet): connect but wait for user action.
if (!ws) {
  connect();
}
