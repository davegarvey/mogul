/**
 * Procedural map layout generator for the Mogul exhibition map.
 *
 * Everything is derived from packages/engine/src/data/map.json (via DEFAULT_RULES):
 *  - region arrangement (single ring; cyclic order + per-region chain orientation
 *    chosen by exhaustive search to minimize inter-region crossings)
 *  - city positions (label-width-aware spacing on local arcs facing the center)
 *  - gateway cities (cities with cross-region edges) pulled inward toward their targets
 *  - cross-region routes (polar curves that dive below the ring inside the source span,
 *    so they never traverse an unrelated territory)
 *  - label anchors, viewBox, and a self-verification report
 *
 * No hand-placed coordinates exist anywhere in the pipeline. If the map data changes,
 * this tool regenerates a valid layout or fails loudly with a precise message.
 *
 * Run: npx tsx tools/generate-map-layout.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULT_RULES } from "@mogul/engine";

// ============ types ============
interface Pt { x: number; y: number }
interface CityDef { id: string; name: string; slots: number; region: string }
interface RegionDef { id: string; name: string }
interface EdgeDef { from: string; to: string; cost: number }

const R = DEFAULT_RULES;
const cities: CityDef[] = R.map.cities;
const regions: RegionDef[] = R.map.regions;
const edges: EdgeDef[] = R.map.edges;
const byId = Object.fromEntries(cities.map((c) => [c.id, c]));
const regionOf = (id: string) => byId[id].region;

// ============ metrics (match the client rendering) ============
const NAME_PX_PER_CHAR = 5.6; // Georgia 10.5px average advance (conservative)
const nameW = (name: string) => name.length * NAME_PX_PER_CHAR;
let PAD = 10; // min clearance between adjacent city label boxes (grows on auto-fit)
const INFO_PX_PER_CHAR = 4.7; // 8.5px info microtext
const INFO_MAX_W = "route 10+15".length * INFO_PX_PER_CHAR;
const ARC_BETA_DEG = 100; // city arc angular span (region-local)
const TERRITORY_MARGIN = 40; // territory radius beyond the city arc
const RING_GAP = 28; // between neighboring territories on the ring
const EXIT_BELOW_RING = 20; // how far below the ring band curves dive
const BOW = 14; // local-edge bow (outward from the region center)
const GATEWAY_PULL = 40; // how far gateway cities are pulled inward
const NAME_BELOW = 27; // city name baseline below the node center
const NODE_R = 9;

// ============ helpers ============
const deg = (d: number) => (d * Math.PI) / 180;
const pol = (ang: number, r: number): Pt => ({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
const angOf = (p: Pt) => Math.atan2(p.y, p.x);
const norm = (a: Pt) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const add = (a: Pt, b: Pt) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, s: number) => ({ x: a.x * s, y: a.y * s });
const rot = (a: Pt, s: number) => ({ x: a.x * Math.cos(s) - a.y * Math.sin(s), y: a.x * Math.sin(s) + a.y * Math.cos(s) });
const C: Pt = { x: 0, y: 0 };
const wrapPi = (d: number) => { while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };

// ============ map model ============
// Each region's intra-region edges must form a single path (a chain). Derive it from the
// edge data so the layout adapts to any chain ordering in the map file.
function deriveChain(regionId: string): string[] {
  const members = cities.filter((c) => c.region === regionId).map((c) => c.id);
  const adj = new Map<string, string[]>();
  for (const c of members) adj.set(c, []);
  for (const e of edges) {
    if (regionOf(e.from) !== regionId || regionOf(e.to) !== regionId) continue;
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const ends = members.filter((m) => adj.get(m)!.length === 1);
  const mids = members.filter((m) => adj.get(m)!.length === 2);
  if (ends.length !== 2 || mids.length !== members.length - 2) {
    throw new Error(
      `map-layout: region "${regionId}" must have its intra-region edges form a single path ` +
        `(found ${members.length} cities, ${ends.length} path ends). Refactor the region as a chain.`,
    );
  }
  const chain = [ends[0]];
  while (chain.length < members.length) {
    const next = adj.get(chain[chain.length - 1])!.find((n) => !chain.includes(n));
    if (!next) throw new Error(`map-layout: broken chain in region "${regionId}"`);
    chain.push(next);
  }
  return chain;
}
const chains: Record<string, string[]> = Object.fromEntries(regions.map((r) => [r.id, deriveChain(r.id)]));
const gatewayOf: Record<string, boolean> = {};
for (const e of edges) {
  if (regionOf(e.from) !== regionOf(e.to)) {
    gatewayOf[e.from] = true;
    gatewayOf[e.to] = true;
  }
}

// ============ layout geometry ============
interface LayoutConfig {
  order: string[]; // cyclic region order on the ring
  orientation: Record<string, boolean>; // true = chain reversed along the arc
}
interface Layout extends LayoutConfig {
  regionAngle: Record<string, number>;
  ringRadius: number;
  territoryR: Record<string, number>;
  cityPos: Record<string, Pt>;
  route: Record<string, { kind: "local" | "cross"; pts: Pt[]; label: Pt }>;
  viewSize: number; // diameter of the layout
}

// local position of each city of a chain on the region's arc (facing the center),
// with angular gaps derived from label widths.
function cityArc(chain: string[], orient: boolean): { byCity: Record<string, Pt>; gaps: number[] } {
  const order = orient ? [...chain].reverse() : chain;
  const gaps: number[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    // the local-edge cost label sits at the bow peak between the cities, so the gap
    // must clear the label width too
    gaps.push((nameW(byId[order[i]].name) + nameW(byId[order[i + 1]].name)) / 2 + PAD + 18);
  }
  const beta = deg(ARC_BETA_DEG);
  const sumGaps = gaps.reduce((a, b) => a + b, 0);
  let arcR = sumGaps / beta;
  for (let iter = 0; iter < 12; iter++) {
    const total = gaps.reduce((a, g) => a + 2 * Math.asin(Math.min(1, g / (2 * arcR))), 0);
    if (total === 0) break;
    arcR *= total / beta;
  }
  arcR = Math.max(arcR, 90);
  const byCity: Record<string, Pt> = {};
  let ang = -beta / 2;
  for (let i = 0; i < order.length; i++) {
    byCity[order[i]] = pol(ang, arcR);
    if (i < gaps.length) ang += beta * (gaps[i] / sumGaps);
  }
  return { byCity, gaps };
}

function buildLayout(cfg: LayoutConfig): Layout {
  const { order, orientation } = cfg;
  const n = order.length;
  const regionAngle: Record<string, number> = {};
  order.forEach((rid, i) => (regionAngle[rid] = 90 + i * (360 / n)));

  const arcR: Record<string, number> = {};
  const byCityAll: Record<string, Record<string, Pt>> = {};
  for (const rid of order) {
    const { byCity, gaps } = cityArc(chains[rid], false);
    byCityAll[rid] = byCity;
    arcR[rid] = Math.max(90, gaps.reduce((a, b) => a + b, 0) / deg(ARC_BETA_DEG));
  }
  const territoryR: Record<string, number> = {};
  for (const rid of order) territoryR[rid] = arcR[rid] + TERRITORY_MARGIN;
  const ringRadius = 2 * Math.max(...order.map((r) => territoryR[r])) + RING_GAP;

  // city positions: on the arc facing the center; gateway cities pulled inward
  // toward the mean direction of their cross-region targets.
  const cityPos: Record<string, Pt> = {};
  for (const rid of order) {
    const a = deg(regionAngle[rid]);
    const inward = pol(a + Math.PI, 1);
    const tangent = rot(inward, Math.PI / 2);
    const rC = pol(a, ringRadius);
    const { byCity } = cityArc(chains[rid], orientation[rid]);
    for (const [cid, p] of Object.entries(byCity)) {
      const localAng = Math.atan2(p.y, p.x); // angle along the arc from the inward direction
      const r = Math.hypot(p.x, p.y); // arc radius
      cityPos[cid] = add(add(rC, mul(inward, Math.cos(localAng) * r)), mul(tangent, Math.sin(localAng) * r));
    }
    void byCityAll;
  }

  // routes
  const route: Layout["route"] = {};
  const pr = (rid: string) => pol(deg(regionAngle[rid]), ringRadius);
  const exitOnRay = (from: Pt, rid: string, toward: Pt): Pt => {
    const p = pr(rid);
    const rt = territoryR[rid];
    const d = norm(sub(toward, from));
    const b = d.x * (from.x - p.x) + d.y * (from.y - p.y);
    const disc = b * b - ((from.x - p.x) ** 2 + (from.y - p.y) ** 2 - rt * rt);
    if (disc < 0) throw new Error(`map-layout: no exit for edge from ${from.x},${from.y} in region ${rid}`);
    const s = -b + Math.sqrt(disc);
    return { x: from.x + d.x * s, y: from.y + d.y * s };
  };

  for (const e of edges) {
    const key = `${e.from}:${e.to}`;
    const a = cityPos[e.from];
    const b = cityPos[e.to];
    if (regionOf(e.from) === regionOf(e.to)) {
      // local edge: shallow outward bow between consecutive chain cities
      const p = pr(regionOf(e.from));
      const mid = mul(add(a, b), 0.5);
      const control = add(mid, mul(norm(sub(p, mid)), BOW));
      route[key] = { kind: "local", pts: [a, control, b], label: control };
    } else {
      // cross edge: exits on the same below-ring radius circle at each city's own angle
      // (ports stay inside the source territory's angular span, chords stay inside the
      // empty inner disk); the crossing count is exactly the chord-alternation count
      // over the exit angles, minimized by the search.
      const rBelow = ringRadius - Math.max(...order.map((r) => territoryR[r])) - EXIT_BELOW_RING;
      const e1 = pol(angOf(a), rBelow);
      const e2 = pol(angOf(b), rBelow);
      route[key] = { kind: "cross", pts: [a, e1, e2, b], label: mul(add(e1, e2), 0.5) };
    }
  }

  return {
    ...cfg,
    regionAngle,
    ringRadius,
    territoryR,
    cityPos,
    route,
    viewSize: 2 * (ringRadius + Math.max(...order.map((r) => territoryR[r])) + 70),
  };
}

// ============ evaluation ============
function segInter(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const det = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x;
  const ab = sub(b, a);
  const cd = sub(d, c);
  const den = det(ab, cd);
  if (Math.abs(den) < 1e-9) return false;
  const ac = sub(c, a);
  const t = det(ac, cd) / den;
  const u = det(ac, ab) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// Sample a route exactly as the client draws it (portPoint inset at both ends +
// quadratic smoothing through the interior points), so verified crossings match the
// rendered geometry.
function sampleRoute(pts: Pt[]): Pt[] {
  const portPoint = (p: Pt, toward: Pt, amount = 10): Pt => {
    const dx = toward.x - p.x;
    const dy = toward.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount };
  };
  const route = [
    portPoint(pts[0], pts[1]),
    ...pts.slice(1, -1),
    portPoint(pts[pts.length - 1], pts[pts.length - 2]),
  ];
  if (route.length === 3) {
    const out: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      out.push({ x: u * u * route[0].x + 2 * u * t * route[1].x + t * t * route[2].x, y: u * u * route[0].y + 2 * u * t * route[1].y + t * t * route[2].y });
    }
    return out;
  }
  // n-point: M r0, then Q r_i mid(r_i, r_{i+1}) for each interior point, then L last
  const segs: Pt[][] = [];
  let prev = route[0];
  for (let i = 1; i < route.length - 1; i++) {
    const corner = route[i];
    const next = route[i + 1];
    const mid = mul(add(corner, next), 0.5);
    segs.push([prev, corner, mid]);
    prev = mid;
  }
  segs.push([prev, route[route.length - 1]]);
  const out: Pt[] = [route[0]];
  for (const seg of segs) {
    if (seg.length === 2) {
      out.push(seg[1]);
      continue;
    }
    const [a, c, b] = seg;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
    }
  }
  return out;
}

function countCrossings(l: Layout): { total: number; localLocal: number; localCross: number; crossCross: number; pairs: string[] } {
  const keys = Object.keys(l.route);
  const totals = { total: 0, localLocal: 0, localCross: 0, crossCross: 0, pairs: [] as string[] };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const r1 = l.route[keys[i]];
      const r2 = l.route[keys[j]];
      const pa = sampleRoute(r1.pts);
      const pb = sampleRoute(r2.pts);
      let hit = false;
      for (let a = 0; a < pa.length - 1 && !hit; a++) {
        for (let bb = 0; bb < pb.length - 1; bb++) {
          if (segInter(pa[a], pa[a + 1], pb[bb], pb[bb + 1])) { hit = true; break; }
        }
      }
      if (!hit) continue;
      totals.total++;
      const kind = r1.kind === "local" && r2.kind === "local" ? "localLocal" : r1.kind !== r2.kind ? "localCross" : "crossCross";
      totals[kind]++;
      totals.pairs.push(`${keys[i]} x ${keys[j]}`);
    }
  }
  return totals;
}

function countClips(l: Layout): { count: number; list: string[] } {
  const out = { count: 0, list: [] as string[] };
  for (const [key, r] of Object.entries(l.route)) {
    if (r.kind !== "cross") continue;
    const [from, to] = key.split(":");
    const own = new Set([regionOf(from), regionOf(to)]);
    const pts = sampleRoute(r.pts);
    for (const rid of Object.keys(l.regionAngle)) {
      if (own.has(rid)) continue;
      const rc = pol(deg(l.regionAngle[rid]), l.ringRadius);
      const rt = l.territoryR[rid] - 6;
      for (const p of pts) {
        if (Math.hypot(p.x - rc.x, p.y - rc.y) < rt) {
          out.count++;
          out.list.push(`${key} through ${rid}`);
          break;
        }
      }
    }
  }
  return out;
}

// collision boxes mirror the client's rendered UI exactly
function cityBoxes(l: Layout): { id: string; box: [number, number, number, number] }[] {
  const boxes: { id: string; box: [number, number, number, number] }[] = [];
  for (const c of cities) {
    const p = l.cityPos[c.id];
    if (!p) continue;
    const w = nameW(c.name);
    boxes.push({ id: c.name, box: [p.x - NODE_R, p.y - NODE_R, NODE_R * 2, NODE_R * 2] });
    boxes.push({ id: `${c.name}~ring`, box: [p.x - 12.5, p.y - 12.5, 25, 25] });
    boxes.push({ id: `${c.name}~name`, box: [p.x - w / 2, p.y + NAME_BELOW - 8, w, 11] });
    boxes.push({ id: `${c.name}~dots`, box: [p.x - 17, p.y + 10.8, 34, 6.4] });
    boxes.push({ id: `${c.name}~info`, box: [p.x - INFO_MAX_W / 2, p.y + 33.5, INFO_MAX_W, 9] });
    boxes.push({ id: `${c.name}~badge`, box: [p.x - 20, p.y - 24, 40, 15] });
  }
  return boxes;
}

// label placement: each edge cost label is nudged along/around its route until it clears
// every UI box (city composites, region labels, other labels). Runs inside verify().
function placeLabels(l: Layout): { count: number; list: string[] } {
  const fixed: { owner: string; id: string; box: [number, number, number, number] }[] = cityBoxes(l).map((b) => ({
    owner: b.id.split("~")[0],
    id: b.id,
    box: b.box,
  }));
  for (const r of regions) {
    const rc = pol(deg(l.regionAngle[r.id]), l.ringRadius);
    const a = add(rc, mul(norm(sub(rc, C)), l.territoryR[r.id] + 14));
    // the client renders the uppercase name plus the " — opens at N players" suffix
    const w = (r.name.length + 24) * 12 * 0.62;
    fixed.push({ owner: `REG ${r.id}`, id: `REG ${r.name}`, box: [a.x - w / 2, a.y - 7, w, 14] });
  }
  const labelBox = (p: Pt, cost: number): [number, number, number, number] => {
    const lw = String(cost).length * 6 + 4;
    return [p.x - lw / 2, p.y - 6, lw, 12];
  };
  const overlaps = (b1: [number, number, number, number], b2: [number, number, number, number]) =>
    b1[0] < b2[0] + b2[2] && b2[0] < b1[0] + b1[2] && b1[1] < b2[1] + b2[3] && b2[1] < b1[1] + b1[3];

  const placed: { box: [number, number, number, number] }[] = [];
  let count = 0;
  const list: string[] = [];
  for (const [key, e] of Object.entries(l.route)) {
    const cost = edges.find((x) => `${x.from}:${x.to}` === key)?.cost ?? 0;
    const candidates: Pt[] = [e.label];
    if (e.kind === "local") {
      // nudge outward (perp to chord), then along the chord
      const a = e.pts[0];
      const b = e.pts[2];
      const along = norm(sub(b, a));
      const perp = rot(along, Math.PI / 2);
      const sign = (perp.x * (e.label.x - a.x) + perp.y * (e.label.y - a.y)) >= 0 ? 1 : -1;
      for (const d of [10, 20, 30]) {
        candidates.push(add(e.label, mul(perp, sign * d)));
        candidates.push(add(e.label, mul(perp, -sign * d)));
      }
      candidates.push(add(e.label, mul(along, 14)));
      candidates.push(add(e.label, mul(along, -14)));
    } else {
      // nudge along the route polyline
      const pts = e.pts;
      const idx = Math.floor(pts.length / 2);
      for (const d of [1, 2, 3, 4]) {
        candidates.push(pts[Math.min(pts.length - 1, idx + d)] ?? e.label);
        candidates.push(pts[Math.max(1, idx - d)] ?? e.label);
      }
    }
    let chosen: Pt = e.label;
    for (const cand of candidates) {
      const box = labelBox(cand, cost);
      let hit = false;
      for (const f of fixed) {
        if (overlaps(box, f.box)) { hit = true; break; }
      }
      if (!hit) {
        for (const p of placed) {
          if (overlaps(box, p.box)) { hit = true; break; }
        }
      }
      if (!hit) { chosen = cand; break; }
    }
    e.label = chosen;
    placed.push({ box: labelBox(chosen, cost) });
    const box = labelBox(chosen, cost);
    for (const f of fixed) {
      if (overlaps(box, f.box)) { count++; if (list.length < 8) list.push(`label ${key} x ${f.id}`); }
    }
  }
  return { count, list };
}

function countCollisions(l: Layout): { count: number; list: string[] } {
  const boxes: { owner: string; id: string; box: [number, number, number, number] }[] = cityBoxes(l).map((b) => ({
    owner: b.id.split("~")[0],
    id: b.id,
    box: b.box,
  }));
  for (const r of regions) {
    const rc = pol(deg(l.regionAngle[r.id]), l.ringRadius);
    const a = add(rc, mul(norm(sub(rc, C)), l.territoryR[r.id] + 14));
    const w = r.name.length * 12 * 0.62;
    boxes.push({ owner: `REG ${r.id}`, id: `REG ${r.name}`, box: [a.x - w / 2, a.y - 7, w, 14] });
  }
  for (const [key, e] of Object.entries(l.route)) {
    const lw = String(edges.find((x) => `${x.from}:${x.to}` === key)?.cost ?? 0).length * 6 + 4;
    boxes.push({ owner: `label ${key}`, id: `label ${key}`, box: [e.label.x - lw / 2, e.label.y - 6, lw, 12] });
  }
  let count = 0;
  const list: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].owner === boxes[j].owner) continue;
      const [ax, ay, aw, ah] = boxes[i].box;
      const [bx, by, bw, bh] = boxes[j].box;
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) {
        count++;
        if (list.length < 8) list.push(`${boxes[i].id} x ${boxes[j].id}`);
      }
    }
  }
  return { count, list };
}

// fast proxy: chord alternation on exit angles (cheap, good ranking)
function fastCrossings(l: Layout): number {
  const chords: [number, number][] = [];
  for (const [key, r] of Object.entries(l.route)) {
    if (r.kind !== "cross") continue;
    const a = angOf(r.pts[1]);
    const b = angOf(r.pts[r.pts.length - 2]);
    chords.push([a, b]);
  }
  let n = 0;
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length; j++) {
      const [a1, b1] = chords[i];
      const [a2, b2] = chords[j];
      const inside = (a: number, b: number, p: number) => {
        const d = wrapPi(b - a);
        const t = wrapPi(p - a);
        return d >= 0 ? t >= 0 && t <= d : t <= 0 && t >= d;
      };
      if (inside(a1, b1, a2) !== inside(a1, b1, b2) && inside(a2, b2, a1) !== inside(a2, b2, b1)) n++;
    }
  }
  return n;
}

// preference: the coastal regions (2-player regions) should sit contiguous on the
// ring, so early games play on one unbroken shore. The region names themselves are
// position-free and adapt to wherever the crossing-minimal arrangement puts them.
const isCoast = (id: string) => id.startsWith("coast");
function geographyPenalty(l: Layout): number {
  const coastAngles = Object.keys(l.regionAngle)
    .filter(isCoast)
    .map((rid) => l.regionAngle[rid])
    .sort((a, b) => a - b);
  if (coastAngles.length < 2) return 0;
  let maxGap = 0;
  for (let i = 0; i < coastAngles.length; i++) {
    const a = coastAngles[i];
    const b = coastAngles[(i + 1) % coastAngles.length];
    const gap = (b - a + 360) % 360;
    maxGap = Math.max(maxGap, gap);
  }
  // contiguous coasts have one large wrap-around gap and two small ones
  return Math.abs(360 / coastAngles.length - (360 - maxGap));
}

function verify(l: Layout) {
  const labels = placeLabels(l);
  const collisions = countCollisions(l);
  collisions.count += labels.count;
  for (const item of labels.list) collisions.list.push(item);
  // every city and every label must sit inside the viewBox
  const S = l.viewSize / 2;
  const inside = (p: Pt) => Math.abs(p.x) <= S && Math.abs(p.y) <= S;
  for (const c of cities) {
    if (!inside(l.cityPos[c.id])) {
      collisions.count += 1000;
      collisions.list.push(`city ${c.id} outside viewBox`);
    }
  }
  for (const r of regions) {
    const rc = pol(deg(l.regionAngle[r.id]), l.ringRadius);
    const a = add(rc, mul(norm(sub(rc, C)), l.territoryR[r.id] + 14));
    if (!inside(a)) {
      collisions.count += 1000;
      collisions.list.push(`region label ${r.id} outside viewBox`);
    }
  }
  return {
    crossings: countCrossings(l),
    clips: countClips(l),
    collisions,
  };
}

// ============ search ============
const perms = <T,>(arr: T[]): T[][] =>
  arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));

function search(): { l: Layout; v: ReturnType<typeof verify> } {
  const orders = perms(regions.map((r) => r.id));
  console.log(`map-layout: searching ${orders.length * 64} configurations...`);
  const candidates: { l: Layout; fast: number; geo: number }[] = [];
  for (const order of orders) {
    for (let oi = 0; oi < 64; oi++) {
      const orientation: Record<string, boolean> = {};
      order.forEach((rid, i) => (orientation[rid] = !!(oi & (1 << i))));
      let l: Layout;
      try {
        l = buildLayout({ order, orientation });
      } catch {
        continue;
      }
      candidates.push({ l, fast: fastCrossings(l), geo: geographyPenalty(l) });
    }
  }
  candidates.sort((a, b) => a.fast - b.fast || a.geo - b.geo);
  console.log(`map-layout: ${candidates.length} valid; best fast proxy=${candidates[0].fast}, geo=${candidates[0].geo}`);
  // for chords the proxy is exact, so the minimum crossing count is candidates[0].fast;
  // verify every config at that minimum and pick the best geography among them
  const minFast = candidates[0].fast;
  let best: { l: Layout; v: ReturnType<typeof verify>; geo: number; score: number } | null = null;
  for (const cand of candidates) {
    if (cand.fast > minFast) break; // sorted by fast
    const v = verify(cand.l);
    const score = v.crossings.crossCross * 1000 + v.crossings.localCross * 100 + v.collisions.count + v.clips.count * 10000;
    if (!best ||
      score < best.score ||
      (score === best.score && cand.geo < best.geo)) {
      best = { l: cand.l, v, geo: cand.geo, score };
    }
  }
  // hill climb with exact evaluation (swap adjacent ring positions, flip orientation)
  let improved = true;
  while (improved) {
    improved = false;
    const cur = best!;
    const order = [...cur.l.order];
    const orient = { ...cur.l.orientation };
    const tryCfg = (o: string[], ori: Record<string, boolean>) => {
      let l: Layout;
      try {
        l = buildLayout({ order: o, orientation: ori });
      } catch {
        return;
      }
      const v = verify(l);
      const geo = geographyPenalty(l);
      const score = v.crossings.crossCross * 1000 + v.crossings.localCross * 100 + v.collisions.count + v.clips.count * 10000;
      if (score < cur.score || (score === cur.score && geo < cur.geo)) {
        best = { l, v, geo, score };
        improved = true;
      }
    };
    for (let i = 0; i < order.length - 1; i++) {
      const o2 = [...order];
      [o2[i], o2[i + 1]] = [o2[i + 1], o2[i]];
      tryCfg(o2, orient);
      if (best !== cur) break;
    }
    for (let i = 0; i < order.length; i++) {
      const ori2 = { ...orient, [order[i]]: !orient[order[i]] };
      tryCfg(order, ori2);
      if (best !== cur) break;
    }
  }
  return { l: best!.l, v: best!.v };
}

// ============ auto-fit ============
// Rebuild with a larger label-spacing budget until the layout verifies clean, or fail.
function autoFit(): { l: Layout; v: ReturnType<typeof verify>; scale: number } {
  let scale = 1;
  let last: { l: Layout; v: ReturnType<typeof verify> } | null = null;
  for (let iter = 0; iter < 6; iter++) {
    const { l, v } = search();
    last = { l, v };
    if (v.collisions.count === 0 && v.clips.count === 0 && v.crossings.localLocal === 0 && v.crossings.localCross === 0) {
      return { l, v, scale };
    }
    if (iter < 5) {
      scale *= 1.12;
      PAD += 2;
      console.log(
        `map-layout: verification found ${v.collisions.count} collisions / ${v.clips.count} clips — ` +
          `scaling spacing to PAD=${PAD} and re-running`,
      );
    }
  }
  const { l, v } = last!;
  throw new Error(
    `map-layout: cannot produce a clean layout after scaling. ` +
      `crossings=${v.crossings.total} (local-local ${v.crossings.localLocal}, local-cross ${v.crossings.localCross}), ` +
      `pairs=[${v.crossings.pairs.join("; ")}], ` +
      `clips=${v.clips.count} [${v.clips.list.join("; ")}], collisions=${v.collisions.count} [${v.collisions.list.join("; ")}]`,
  );
}

// ============ emit ============
const output = "packages/client/src/map-layout.generated.json";
const { l, v, scale } = autoFit();

const regionGeom: Record<string, unknown> = {};
for (const rid of Object.keys(l.regionAngle)) {
  const rc = pol(deg(l.regionAngle[rid]), l.ringRadius);
  const rt = l.territoryR[rid];
  const labelA = add(rc, mul(norm(sub(rc, C)), rt + 16));
  regionGeom[rid] = {
    center: { x: Math.round(rc.x * 10) / 10, y: Math.round(rc.y * 10) / 10 },
    radius: Math.round(rt * 10) / 10,
    polygon: Array.from({ length: 16 }, (_, i) => {
      const p = add(rc, pol((i / 16) * 2 * Math.PI, rt));
      return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    }),
    label: { x: Math.round(labelA.x * 10) / 10, y: Math.round(labelA.y * 10) / 10 },
  };
}

const cityGeom: Record<string, unknown> = {};
for (const c of cities) {
  const p = l.cityPos[c.id];
  cityGeom[c.id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, region: c.region };
}

const edgeGeom: Record<string, unknown> = {};
for (const e of edges) {
  const key = `${e.from}:${e.to}`;
  const r = l.route[key];
  if (!r) throw new Error(`map-layout: no route for edge ${key}`);
  edgeGeom[key] = {
    kind: r.kind,
    points: sampleRoute(r.pts).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
    label: { x: Math.round(r.label.x * 10) / 10, y: Math.round(r.label.y * 10) / 10 },
  };
}

const S = l.viewSize / 2;
const payload = {
  version: 1,
  viewBox: { x: -S, y: -S, width: l.viewSize, height: l.viewSize },
  scale,
  regions: regionGeom,
  cities: cityGeom,
  edges: edgeGeom,
  stats: {
    crossings: v.crossings,
    clips: v.clips.list,
    collisions: v.collisions.list,
    regionOrder: l.order,
    orientation: l.orientation,
    geographyPenalty: geographyPenalty(l),
  },
};

await mkdir("packages/client/src", { recursive: true });
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`map-layout: wrote ${output}`);
console.log(
  `map-layout: viewBox ${l.viewSize.toFixed(0)}px, crossings=${v.crossings.total} ` +
    `(local-local ${v.crossings.localLocal}, local-cross ${v.crossings.localCross}, cross-cross ${v.crossings.crossCross}), ` +
    `clips=${v.clips.count}, collisions=${v.collisions.count}, spacing scale=${scale.toFixed(2)}`,
);
