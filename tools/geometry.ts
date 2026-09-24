/**
 * Small 2D geometry kit for the map layout generator: convex hulls, rounded offsets,
 * point-in-polygon and polygon distance. Pure functions over plain points.
 */
export interface Pt {
  x: number;
  y: number;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain), counter-clockwise in a y-up frame, no repeated end point. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Offset a convex polygon outwards by `margin`, rounding each corner with an arc of
 * `steps` segments (the Minkowski sum with a disc, approximated). Returns a convex polygon.
 */
export function offsetConvex(hull: Pt[], margin: number, steps = 4): Pt[] {
  const n = hull.length;
  if (n === 0) return [];
  if (n === 1) {
    return Array.from({ length: 4 * steps }, (_, i) => {
      const a = (i / (4 * steps)) * 2 * Math.PI;
      return { x: hull[0].x + Math.cos(a) * margin, y: hull[0].y + Math.sin(a) * margin };
    });
  }
  // Outward normal of edge i (from hull[i] to hull[i+1]) for a counter-clockwise polygon.
  const normal = (i: number): number => {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    return Math.atan2(-(b.x - a.x), b.y - a.y);
  };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v = hull[i];
    let a0 = normal((i - 1 + n) % n);
    let a1 = normal(i);
    while (a1 < a0) a1 += 2 * Math.PI;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      out.push({ x: v.x + Math.cos(a) * margin, y: v.y + Math.sin(a) * margin });
    }
  }
  return out;
}

/** True when p lies strictly inside the polygon (ray casting; any simple polygon). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segPointDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance between two polygons; 0 when they overlap or one contains the other. */
export function polygonDistance(p: Pt[], q: Pt[]): number {
  if (pointInPolygon(p[0], q) || pointInPolygon(q[0], p)) return 0;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    for (let j = 0; j < q.length; j++) {
      const c = q[j];
      const d = q[(j + 1) % q.length];
      if (segmentsIntersect(a, b, c, d)) return 0;
      best = Math.min(best, segPointDistance(a, c, d), segPointDistance(c, a, b));
    }
  }
  return best;
}

/** Distance from a point to a polygon's boundary, or 0 when the point is inside. */
export function pointPolygonDistance(p: Pt, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segPointDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

export function centroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
