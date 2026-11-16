import type { IslandId, Vec2 } from "./types";
import { getWorldLayout, type ClearingDef, type PlotDef } from "./worldLayouts";

/** Area codes (UI) ↔ internal island ids. */
export const AREA_CODE: Record<IslandId, "a1" | "a2" | "a3" | "a4" | "a5"> = {
  meadow: "a1",
  lagoon: "a2",
  snack: "a3",
  retro: "a4",
  hollow: "a5",
};

/** Switcher bar order: a4, a2, a1, a3, a5 */
export const AREA_SWITCHER_ORDER: IslandId[] = [
  "retro",
  "lagoon",
  "meadow",
  "snack",
  "hollow",
];

/**
 * Linear chain portals (left / right road exits).
 * a4 left-blocked · a5 right-blocked.
 */
export const AREA_LINKS: Record<
  IslandId,
  { left: IslandId | null; right: IslandId | null }
> = {
  retro: { left: null, right: "lagoon" },
  lagoon: { left: "retro", right: "meadow" },
  meadow: { left: "lagoon", right: "snack" },
  snack: { left: "meadow", right: "hollow" },
  hollow: { left: "snack", right: null },
};

export type AreaResource = "wood" | "berries" | "crops" | "tokens" | "gems";

export const AREA_RESOURCE: Record<IslandId, AreaResource> = {
  meadow: "wood",
  lagoon: "berries",
  snack: "crops",
  retro: "tokens",
  hollow: "gems",
};

export const RESOURCE_LABELS: Record<AreaResource, string> = {
  wood: "Wood",
  berries: "Berries",
  crops: "Treats",
  tokens: "Tokens",
  gems: "Gems",
};

/** Live shared layout (plots / clearings / nodes) — editable via calibrator. */
export function getPlots(): readonly PlotDef[] {
  return getWorldLayout().shared.plots;
}

export function getClearings(): readonly ClearingDef[] {
  return getWorldLayout().shared.clearings;
}

export function getNodes(): Record<string, Vec2> {
  return getWorldLayout().shared.nodes;
}

export function getEdges(): readonly [string, string][] {
  return getWorldLayout().shared.edges as [string, string][];
}

/** Back-compat facade used across the engine. */
export const SHARED_MAP = {
  get plots() {
    return getPlots();
  },
  get clearings() {
    return getClearings();
  },
  get nodes() {
    return getNodes() as Record<MapNodeId, Vec2>;
  },
};

export type MapNodeId = string;

export function usesSharedMapGraph(_island: IslandId): boolean {
  return true;
}

export type PortalSide = "left" | "right";

export function portalDestination(
  island: IslandId,
  side: PortalSide
): IslandId | null {
  return AREA_LINKS[island][side];
}

export function portalSideAt(
  island: IslandId,
  x: number,
  y: number,
  radius = 0.045
): PortalSide | null {
  const nodes = getNodes();
  const left = nodes.portal_left;
  const right = nodes.portal_right;
  if (!left || !right) return null;
  const dL = Math.hypot(x - left.x, y - left.y);
  const dR = Math.hypot(x - right.x, y - right.y);
  if (dL <= radius && AREA_LINKS[island].left) return "left";
  if (dR <= radius && AREA_LINKS[island].right) return "right";
  return null;
}

export function nearOpenPortal(island: IslandId, x: number, y: number): boolean {
  return portalSideAt(island, x, y) !== null;
}

function dist2(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; d2: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return { point: { x: a.x, y: a.y }, d2: dist2(p, a) };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { point, d2: dist2(p, point) };
}

export function snapToRoad(x: number, y: number): Vec2 {
  const p = { x, y };
  const nodes = getNodes();
  let best = p;
  let bestD = Infinity;
  for (const [aId, bId] of getEdges()) {
    const a = nodes[aId];
    const b = nodes[bId];
    if (!a || !b) continue;
    const hit = closestOnSegment(p, a, b);
    if (hit.d2 < bestD) {
      bestD = hit.d2;
      best = hit.point;
    }
  }
  return best;
}

export function nearestNode(x: number, y: number): MapNodeId {
  const p = { x, y };
  const nodes = getNodes();
  let best: MapNodeId = "crossroads";
  let bestD = Infinity;
  for (const [id, pos] of Object.entries(nodes)) {
    const d = dist2(p, pos);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function pathNodes(from: MapNodeId, to: MapNodeId): MapNodeId[] {
  if (from === to) return [from];
  const adj = new Map<MapNodeId, MapNodeId[]>();
  for (const [a, b] of getEdges()) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const queue: MapNodeId[] = [from];
  const prev = new Map<MapNodeId, MapNodeId | null>([[from, null]]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of adj.get(cur) ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return [from, to];
  const out: MapNodeId[] = [];
  let c: MapNodeId | null = to;
  while (c) {
    out.push(c);
    c = prev.get(c) ?? null;
  }
  out.reverse();
  return out;
}

export function roadPath(sx: number, sy: number, tx: number, ty: number): Vec2[] {
  const nodes = getNodes();
  const start = nearestNode(sx, sy);
  const end = nearestNode(tx, ty);
  const ids = pathNodes(start, end);
  const pts = ids.map((id) => ({ ...(nodes[id] ?? { x: tx, y: ty }) }));
  if (pts.length) pts[pts.length - 1] = { x: tx, y: ty };
  return pts;
}

export function randomRoadTarget(): Vec2 {
  const pool = [
    "crossroads",
    "north_branch",
    "south_branch",
    "bridge_w",
    "bridge_e",
    "plot_tl",
    "plot_bl",
    "plot_ct",
    "plot_cr",
    "plot_br",
    "clear_cross",
    "clear_south",
    "clear_east",
  ];
  const nodes = getNodes();
  const id = pool[Math.floor(Math.random() * pool.length)];
  const n = nodes[id] ?? nodes.crossroads;
  return {
    x: n.x + (Math.random() - 0.5) * 0.02,
    y: n.y + (Math.random() - 0.5) * 0.02,
  };
}

export function clampToRoadNetwork(x: number, y: number): Vec2 {
  for (const c of getClearings()) {
    if (Math.hypot(x - c.x, y - c.y) <= c.r) return { x, y };
  }
  for (const p of getPlots()) {
    if (Math.hypot(x - p.x, y - p.y) <= 0.055) return { x, y };
  }
  return snapToRoad(x, y);
}
