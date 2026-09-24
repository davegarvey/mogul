/**
 * Procedural map layout generator for the Mogul exhibition map.
 *
 * Everything is derived from packages/engine/src/data/map.json (via DEFAULT_RULES):
 *  - region arrangement (single ring; cyclic order + per-region chain orientation
 *    chosen by exhaustive search to minimize inter-region crossings)
 *  - city positions (label-width-aware spacing on local arcs facing the center)
 *  - territories: the convex hull of each region's rendered city UI and local-edge labels,
 *    offset by a small margin (no empty space beyond the content)
 *  - ring radius: the smallest that keeps neighbouring territories apart and leaves an
 *    inner corridor for the cross-region routes (solved by bisection)
 *  - cross-region routes (polar curves that dive below the ring inside the source span,
 *    so they never traverse an unrelated territory)
 *  - label anchors, a viewBox fitted to the drawn content, and a self-verification report
 *
 * No hand-placed coordinates exist anywhere in the pipeline. If the map data changes,
 * this tool regenerates a valid layout or fails loudly with a precise message.
 *
 * Run: npx tsx tools/generate-map-layout.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULT_RULES } from "@mogul/engine";
import { centroid, convexHull, offsetConvex, pointInPolygon, pointPolygonDistance, polygonArea, polygonDistance } from "./geometry.js";

// ============ types ============
type Pt = { x: number; y: number };
type Box = [number, number, number, number];
interface CityDef { id: string; name: string; slots: number; region: string }
interface RegionDef { id: string; name: string; minPlayers: number }
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
const ARC_BETA_DEG = 140; // city arc angular span (region-local); tighter arcs pack regions smaller
const TERRITORY_MARGIN = 16; // territory outline beyond the region's rendered content
const CLIP_TOLERANCE = 6; // routes may graze this far into a territory edge
let RING_GAP = 24; // min distance between neighbouring territories (grows on auto-fit)
let MIN_CORRIDOR = 90; // min radius of the empty inner disk for cross routes (grows on auto-fit)
const EXIT_BELOW_RING = 20; // how far below the innermost territory the cross routes run
const CANVAS_MARGIN = 20; // viewBox margin beyond the outermost drawn element
const REGION_LABEL_GAP = 16; // region label distance beyond its territory
const BOW = 14; // local-edge bow (outward from the region center)
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
  /** Territory outline per region (content hull + margin). */
  territory: Record<string, Pt[]>;
  regionLabel: Record<string, Pt>;
  cityPos: Record<string, Pt>;
  route: Record<string, { kind: "local" | "cross"; pts: Pt[]; label: Pt }>;
  /** Fitted to the drawn content once labels are placed (see fitViewBox). */
  viewBox: { x: number; y: number; width: number; height: number };
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

/** Edge cost label as the client draws it: 10px text centred on x, baseline 3px above the anchor. */
function edgeLabelBox(p: Pt, cost: number): Box {
  const lw = String(cost).length * 6 + 4;
  return [p.x - lw / 2, p.y - 13, lw, 13];
}
const costOf = (key: string) => edges.find((x) => `${x.from}:${x.to}` === key)?.cost ?? 0;

/** UI boxes a city node renders (mirrors the client): node, ring, name, slot dots, info, badge. */
function uiBoxes(name: string, p: Pt): { part: string; box: Box }[] {
  const w = nameW(name);
  return [
    { part: "", box: [p.x - NODE_R, p.y - NODE_R, NODE_R * 2, NODE_R * 2] },
    { part: "ring", box: [p.x - 12.5, p.y - 12.5, 25, 25] },
    { part: "name", box: [p.x - w / 2, p.y + NAME_BELOW - 10, w, 13] },
    { part: "dots", box: [p.x - 17, p.y + 10.8, 34, 6.4] },
    { part: "info", box: [p.x - INFO_MAX_W / 2, p.y + 30, INFO_MAX_W, 11] },
    { part: "badge", box: [p.x - 20, p.y - 24, 40, 15] },
  ];
}
const corners = ([x, y, w, h]: Box): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** Region geometry relative to its ring anchor rC: city offsets and the territory outline. */
interface RegionShape {
  cityRel: Record<string, Pt>;
  territoryRel: Pt[];
}
const shapeCache = new Map<string, RegionShape>();

function regionShape(rid: string, orient: boolean, angleDeg: number): RegionShape {
  const key = `${rid}|${orient}|${angleDeg}|${PAD}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const a = deg(angleDeg);
  const inward = pol(a + Math.PI, 1);
  const tangent = rot(inward, Math.PI / 2);
  const { byCity } = cityArc(chains[rid], orient);
  const cityRel: Record<string, Pt> = {};
  for (const [cid, p] of Object.entries(byCity)) {
    const localAng = Math.atan2(p.y, p.x); // angle along the arc from the inward direction
    const r = Math.hypot(p.x, p.y); // arc radius
    cityRel[cid] = add(mul(inward, Math.cos(localAng) * r), mul(tangent, Math.sin(localAng) * r));
  }
  // Content: every city's UI boxes plus a label box at each local edge's bow peak.
  const pts: Pt[] = [];
  for (const cid of chains[rid]) for (const b of uiBoxes(byId[cid].name, cityRel[cid])) pts.push(...corners(b.box));
  for (let i = 0; i < chains[rid].length - 1; i++) {
    const control = localControl(cityRel[chains[rid][i]], cityRel[chains[rid][i + 1]], { x: 0, y: 0 });
    pts.push(...corners(edgeLabelBox(control, 10)));
  }
  const shape = { cityRel, territoryRel: offsetConvex(convexHull(pts), TERRITORY_MARGIN, 4) };
  shapeCache.set(key, shape);
  return shape;
}

/** Control point of a local edge: a shallow bow away from the map centre (toward the region anchor). */
function localControl(a: Pt, b: Pt, anchor: Pt): Pt {
  const mid = mul(add(a, b), 0.5);
  return add(mid, mul(norm(sub(anchor, mid)), BOW));
}

const translate = (poly: Pt[], d: Pt): Pt[] => poly.map((p) => add(p, d));

/**
 * Smallest ring radius at which every pair of territories is at least RING_GAP apart and
 * every territory stays clear of the inner corridor the cross routes use. Both conditions
 * only get easier as the ring grows, so bisection finds the minimum.
 */
function solveRing(order: string[], angles: Record<string, number>, shapes: Record<string, RegionShape>): number {
  const needInner = MIN_CORRIDOR + EXIT_BELOW_RING;
  const ok = (R: number): boolean => {
    const polys = order.map((rid) => translate(shapes[rid].territoryRel, pol(deg(angles[rid]), R)));
    for (const poly of polys) if (pointPolygonDistance(C, poly) < needInner) return false;
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) if (polygonDistance(polys[i], polys[j]) < RING_GAP) return false;
    }
    return true;
  };
  let lo = 0;
  let hi = 400;
  while (!ok(hi)) hi *= 1.5;
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/**
 * Region labels are wide and horizontal. Put each one above its territory (upper half of
 * the ring) or below it (lower half), centred on the territory, and move it outward until
 * it clears every territory. Fall back to the radial direction if that fails.
 */
function placeRegionLabel(rid: string, territory: Record<string, Pt[]>, dir: Pt, placed: Box[]): Pt {
  const def = regions.find((r) => r.id === rid)!;
  const poly = territory[rid];
  const apart = (a: Box, b: Box) => a[0] + a[2] + 8 <= b[0] || b[0] + b[2] + 8 <= a[0] || a[1] + a[3] + 4 <= b[1] || b[1] + b[3] + 4 <= a[1];
  const clear = (a: Pt) => {
    const b = labelBoxAt(def, a);
    const box = corners(b);
    return placed.every((p) => apart(b, p)) && Object.values(territory).every((t) => polygonDistance(box, t) >= 4);
  };
  const cx = centroid(poly).x;
  const up = dir.y < 0;
  const edge = up ? Math.min(...poly.map((p) => p.y)) : Math.max(...poly.map((p) => p.y));
  // baseline: above the top edge, or far enough below the bottom edge to fit the glyphs
  for (let d = REGION_LABEL_GAP - 8; d < 200; d += 4) {
    const a = { x: cx, y: up ? edge - d : edge + d + 11 };
    if (clear(a)) return a;
  }
  const reach = Math.max(...poly.map((p) => p.x * dir.x + p.y * dir.y));
  for (let at = reach + REGION_LABEL_GAP; at < reach + 400; at += 4) if (clear(mul(dir, at))) return mul(dir, at);
  return mul(dir, reach + REGION_LABEL_GAP);
}

function buildLayout(cfg: LayoutConfig, fixedRing?: number): Layout {
  const { order, orientation } = cfg;
  const n = order.length;
  const regionAngle: Record<string, number> = {};
  order.forEach((rid, i) => (regionAngle[rid] = 90 + i * (360 / n)));
  const shapes: Record<string, RegionShape> = {};
  for (const rid of order) shapes[rid] = regionShape(rid, orientation[rid], regionAngle[rid]);
  const ringRadius = fixedRing ?? solveRing(order, regionAngle, shapes);

  const cityPos: Record<string, Pt> = {};
  const territory: Record<string, Pt[]> = {};
  const regionLabel: Record<string, Pt> = {};
  for (const rid of order) {
    const rC = pol(deg(regionAngle[rid]), ringRadius);
    for (const [cid, rel] of Object.entries(shapes[rid].cityRel)) cityPos[cid] = add(rC, rel);
    territory[rid] = translate(shapes[rid].territoryRel, rC);
  }
  // Labels only matter for exact layouts; provisional search candidates skip them.
  if (fixedRing === undefined) {
    const placed: Box[] = [];
    for (const rid of order) {
      regionLabel[rid] = placeRegionLabel(rid, territory, pol(deg(regionAngle[rid]), 1), placed);
      placed.push(labelBoxAt(regions.find((r) => r.id === rid)!, regionLabel[rid]));
    }
  }

  // routes
  const route: Layout["route"] = {};
  const inner = Math.min(...order.map((rid) => pointPolygonDistance(C, territory[rid])));
  const rBelow = inner - EXIT_BELOW_RING;
  for (const e of edges) {
    const key = `${e.from}:${e.to}`;
    const a = cityPos[e.from];
    const b = cityPos[e.to];
    if (regionOf(e.from) === regionOf(e.to)) {
      const control = localControl(a, b, pol(deg(regionAngle[regionOf(e.from)]), ringRadius));
      route[key] = { kind: "local", pts: [a, control, b], label: control };
    } else {
      // cross edge: exits on the same below-ring radius circle at each city's own angle
      // (ports stay inside the source territory's angular span, chords stay inside the
      // empty inner disk); the crossing count is exactly the chord-alternation count
      // over the exit angles, minimized by the search.
      const e1 = pol(angOf(a), rBelow);
      const e2 = pol(angOf(b), rBelow);
      route[key] = { kind: "cross", pts: [a, e1, e2, b], label: mul(add(e1, e2), 0.5) };
    }
  }

  return {
    ...cfg,
    regionAngle,
    ringRadius,
    territory,
    regionLabel,
    cityPos,
    route,
    viewBox: { x: 0, y: 0, width: 0, height: 0 },
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
      const poly = l.territory[rid];
      for (const p of pts) {
        if (pointInPolygon(p, poly) && edgeDepth(p, poly) > CLIP_TOLERANCE) {
          out.count++;
          out.list.push(`${key} through ${rid}`);
          break;
        }
      }
    }
  }
  return out;
}

/** How far a point inside a polygon is from its nearest edge. */
function edgeDepth(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

// collision boxes mirror the client's rendered UI exactly
function cityBoxes(l: Layout): { id: string; box: Box }[] {
  const boxes: { id: string; box: Box }[] = [];
  for (const c of cities) {
    const p = l.cityPos[c.id];
    if (!p) continue;
    for (const b of uiBoxes(c.name, p)) boxes.push({ id: b.part ? `${c.name}~${b.part}` : c.name, box: b.box });
  }
  return boxes;
}

/**
 * Region label box as the client renders it: uppercase, 12px, 2px letter spacing, centred on
 * the anchor's baseline; regions not always in play carry the " — opens at N players" suffix.
 */
function regionLabelBox(l: Layout, r: RegionDef): Box {
  return labelBoxAt(r, l.regionLabel[r.id]);
}
function labelBoxAt(r: RegionDef, a: Pt): Box {
  const text = r.minPlayers > 2 ? `${r.name} — opens at ${r.minPlayers} players` : r.name;
  const w = text.length * 10; // measured ≈9.2–9.9px per uppercase char with 2px tracking
  return [a.x - w / 2, a.y - 11, w, 14];
}

// label placement: each edge cost label is nudged along/around its route until it clears
// every UI box (city composites, region labels, other labels). Runs inside verify().
function placeLabels(l: Layout): { count: number; list: string[] } {
  const fixed: { owner: string; id: string; box: [number, number, number, number] }[] = cityBoxes(l).map((b) => ({
    owner: b.id.split("~")[0],
    id: b.id,
    box: b.box,
  }));
  for (const r of regions) fixed.push({ owner: `REG ${r.id}`, id: `REG ${r.name}`, box: regionLabelBox(l, r) });
  const labelBox = edgeLabelBox;
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
  for (const r of regions) boxes.push({ owner: `REG ${r.id}`, id: `REG ${r.name}`, box: regionLabelBox(l, r) });
  for (const [key, e] of Object.entries(l.route)) {
    boxes.push({ owner: `label ${key}`, id: `label ${key}`, box: edgeLabelBox(e.label, costOf(key)) });
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

/** Bounding box of everything the client draws, plus CANVAS_MARGIN on every side. */
function fitViewBox(l: Layout): Layout["viewBox"] {
  const pts: Pt[] = [];
  for (const poly of Object.values(l.territory)) pts.push(...poly);
  for (const r of regions) pts.push(...corners(regionLabelBox(l, r)));
  for (const b of cityBoxes(l)) pts.push(...corners(b.box));
  for (const [key, e] of Object.entries(l.route)) {
    pts.push(...sampleRoute(e.pts));
    pts.push(...corners(edgeLabelBox(e.label, costOf(key))));
  }
  const minX = Math.min(...pts.map((p) => p.x)) - CANVAS_MARGIN;
  const minY = Math.min(...pts.map((p) => p.y)) - CANVAS_MARGIN;
  const maxX = Math.max(...pts.map((p) => p.x)) + CANVAS_MARGIN;
  const maxY = Math.max(...pts.map((p) => p.y)) + CANVAS_MARGIN;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { x: r1(minX), y: r1(minY), width: r1(maxX - minX), height: r1(maxY - minY) };
}

function verify(l: Layout) {
  const labels = placeLabels(l);
  const collisions = countCollisions(l);
  collisions.count += labels.count;
  for (const item of labels.list) collisions.list.push(item);
  // Territories must not overlap; the ring solver guarantees it, verification proves it.
  const rids = Object.keys(l.territory);
  for (let i = 0; i < rids.length; i++) {
    for (let j = i + 1; j < rids.length; j++) {
      if (polygonDistance(l.territory[rids[i]], l.territory[rids[j]]) === 0) {
        collisions.count += 1000;
        collisions.list.push(`territory ${rids[i]} x ${rids[j]}`);
      }
    }
  }
  l.viewBox = fitViewBox(l);
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
  // Rank every configuration on a shared provisional ring (solving the ring per candidate
  // is too slow for the full space); finalists are rebuilt on their own solved ring below.
  const ids = regions.map((r) => r.id);
  const provisional = buildLayout({ order: ids, orientation: Object.fromEntries(ids.map((id) => [id, false])) }).ringRadius;
  const candidates: { l: Layout; fast: number; geo: number }[] = [];
  for (const order of orders) {
    for (let oi = 0; oi < 64; oi++) {
      const orientation: Record<string, boolean> = {};
      order.forEach((rid, i) => (orientation[rid] = !!(oi & (1 << i))));
      let l: Layout;
      try {
        l = buildLayout({ order, orientation }, provisional);
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
  for (const provisionalCand of candidates) {
    if (provisionalCand.fast > minFast) break; // sorted by fast
    const cand = { ...provisionalCand, l: buildLayout({ order: provisionalCand.l.order, orientation: provisionalCand.l.orientation }) };
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
      RING_GAP += 6;
      MIN_CORRIDOR = Math.round(MIN_CORRIDOR * 1.15);
      shapeCache.clear();
      console.log(
        `map-layout: verification found ${v.collisions.count} collisions / ${v.clips.count} clips — ` +
          `scaling spacing to PAD=${PAD}, RING_GAP=${RING_GAP}, MIN_CORRIDOR=${MIN_CORRIDOR} and re-running ` +
          `[${[...v.collisions.list, ...v.clips.list].join("; ")}]`,
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

const round1 = (p: Pt): Pt => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
const regionGeom: Record<string, unknown> = {};
for (const rid of Object.keys(l.regionAngle)) {
  regionGeom[rid] = {
    center: round1(centroid(l.territory[rid])),
    polygon: l.territory[rid].map(round1),
    label: round1(l.regionLabel[rid]),
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

const payload = {
  version: 2,
  viewBox: l.viewBox,
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
    ringRadius: l.ringRadius,
    territoryArea: Math.round(Object.values(l.territory).reduce((a, poly) => a + polygonArea(poly), 0)),
  },
};

await mkdir("packages/client/src", { recursive: true });
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`map-layout: wrote ${output}`);
console.log(
  `map-layout: viewBox ${l.viewBox.width.toFixed(0)}x${l.viewBox.height.toFixed(0)}px, ring ${l.ringRadius}, crossings=${v.crossings.total} ` +
    `(local-local ${v.crossings.localLocal}, local-cross ${v.crossings.localCross}, cross-cross ${v.crossings.crossCross}), ` +
    `clips=${v.clips.count}, collisions=${v.collisions.count}, spacing scale=${scale.toFixed(2)}`,
);
