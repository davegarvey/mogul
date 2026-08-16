import type { EdgeDef } from "./types.js";

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Minimum connection cost from any source city to every reachable city,
 * over undirected edges (Dijkstra).
 */
export function minPathCosts(
  edges: EdgeDef[],
  sources: string[],
  allCities: string[],
): Map<string, number> {
  const adj = new Map<string, [string, number][]>();
  for (const c of allCities) adj.set(c, []);
  for (const e of edges) {
    adj.get(e.from)!.push([e.to, e.cost]);
    adj.get(e.to)!.push([e.from, e.cost]);
  }
  const dist = new Map<string, number>();
  for (const c of allCities) dist.set(c, Infinity);
  const q: [string, number][] = sources.map((s) => [s, 0]);
  for (const s of sources) dist.set(s, 0);
  while (q.length > 0) {
    q.sort((a, b) => a[1] - b[1]);
    const [u, d] = q.shift()!;
    if (d > dist.get(u)!) continue;
    for (const [v, w] of adj.get(u)!) {
      const nd = d + w;
      if (nd < dist.get(v)!) {
        dist.set(v, nd);
        q.push([v, nd]);
      }
    }
  }
  return dist;
}
