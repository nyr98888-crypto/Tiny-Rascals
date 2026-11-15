import type { IslandId, Vec2 } from "./types";

/** Percent (0–100) → normalized 0–1. */
export function pct(x: number, y: number): Vec2 {
  return { x: x / 100, y: y / 100 };
}

/**
 * Area codes (UI) ↔ internal island ids.
 * a1 = Meadow (existing start — land-meadow untouched).
 * a2–a5 = new maps in public/world/.
 */
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
  retro: { left: null, right: "lagoon" }, // a4
  lagoon: { left: "retro", right: "meadow" }, // a2
  meadow: { left: "lagoon", right: "snack" }, // a1
  snack: { left: "meadow", right: "hollow" }, // a3
  hollow: { left: "snack", right: null }, // a5
};

/** Primary resource earned by chores on each area. */
export type AreaResource = "wood" | "berries" | "crops" | "tokens" | "gems";

export const AREA_RESOURCE: Record<IslandId, AreaResource> = {
  meadow: "wood", // a1
  lagoon: "berries", // a2
  snack: "crops", // a3 Treats/Meals
  retro: "tokens", // a4 Tokens/Stone
  hollow: "gems", // a5
};

export const RESOURCE_LABELS: Record<AreaResource, string> = {
  wood: "Wood",
  berries: "Berries",
  crops: "Treats",
  tokens: "Tokens",
  gems: "Gems",
};

/**
 * Shared 16:9 road/plot graph (a1–a5). Aligned to land-meadow / matching layouts.
 */
export const SHARED_MAP = {
  plots: [
    { id: "plot-tl", ...pct(28, 40), label: "Top-Left" },
    { id: "plot-bl", ...pct(28, 76), label: "Bottom-Left" },
    { id: "plot-ct", ...pct(53, 25), label: "Central-Top" },
    { id: "plot-cr", ...pct(54, 48), label: "Central-Right" },
    { id: "plot-br", ...pct(66, 86), label: "Bottom-Right" },
  ] as const,

  clearings: [
    { id: "clear-cross", ...pct(52, 50), r: 0.09, label: "Crossroads clearing" },
    { id: "clear-south", ...pct(45, 70), r: 0.09, label: "South clearing" },
    { id: "clear-east", ...pct(85, 45), r: 0.06, label: "Right-bank clearing" },
  ] as const,

  nodes: {
    portal_left: pct(0, 48),
    crossroads: pct(45, 52),
    north_branch: pct(35, 20),
    south_branch: pct(83, 100),
    bridge_w: pct(63, 43),
    bridge_e: pct(76, 34),
    portal_right: pct(100, 12),
    plot_tl: pct(28, 40),
    plot_bl: pct(28, 76),
    plot_ct: pct(53, 25),
    plot_cr: pct(54, 48),
    plot_br: pct(66, 86),
    clear_cross: pct(52, 50),
    clear_south: pct(45, 70),
    clear_east: pct(85, 45),
  } as const,
} as const;

export type MapNodeId = keyof typeof SHARED_MAP.nodes;

export const ROAD_EDGES: readonly [MapNodeId, MapNodeId][] = [
  ["portal_left", "crossroads"],
  ["crossroads", "north_branch"],
  ["crossroads", "south_branch"],
  ["crossroads", "bridge_w"],
  ["bridge_w", "bridge_e"],
  ["bridge_e", "portal_right"],
  ["crossroads", "plot_tl"],
  ["crossroads", "plot_bl"],
  ["north_branch", "plot_ct"],
  ["bridge_w", "plot_cr"],
  ["south_branch", "plot_br"],
  ["crossroads", "clear_cross"],
  ["crossroads", "clear_south"],
  ["bridge_e", "clear_east"],
];

/** All five chain areas share the road graph. */
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

/** Which portal side (if any) the feet are near. */
export function portalSideAt(
  island: IslandId,
  x: number,
  y: number,
  radius = 0.045
): PortalSide | null {
  const left = SHARED_MAP.nodes.portal_left;
  const right = SHARED_MAP.nodes.portal_right;
  const dL = Math.hypot(x - left.x, y - left.y);
  const dR = Math.hypot(x - right.x, y - right.y);
  if (dL <= radius && AREA_LINKS[island].left) return "left";
  if (dR <= radius && AREA_LINKS[island].right) return "right";
  // Blocked ends: still "near" but no destination
  if (dL <= radius && !AREA_LINKS[island].left) return null;
  if (dR <= radius && !AREA_LINKS[island].right) return null;
  return null;
}

export function nearOpenPortal(island: IslandId, x: number, y: number): boolean {
  return portalSideAt(island, x, y) !== null;
}

/** Enter node when arriving from a side of the destination. */
export function enterNodeForArrival(fromSide: PortalSide): MapNodeId {
  // Arriving via our left means we came from neighbor's right → enter at left
  return fromSide === "left" ? "portal_left" : "portal_right";
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
  let best = p;
  let bestD = Infinity;
  for (const [aId, bId] of ROAD_EDGES) {
    const a = SHARED_MAP.nodes[aId];
    const b = SHARED_MAP.nodes[bId];
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
  let best: MapNodeId = "crossroads";
  let bestD = Infinity;
  for (const [id, pos] of Object.entries(SHARED_MAP.nodes) as [MapNodeId, Vec2][]) {
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
  for (const [a, b] of ROAD_EDGES) {
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
  const start = nearestNode(sx, sy);
  const end = nearestNode(tx, ty);
  const ids = pathNodes(start, end);
  const pts = ids.map((id) => ({ ...SHARED_MAP.nodes[id] }));
  if (pts.length) pts[pts.length - 1] = { x: tx, y: ty };
  return pts;
}

export function randomRoadTarget(): Vec2 {
  const pool: MapNodeId[] = [
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
  const id = pool[Math.floor(Math.random() * pool.length)];
  const n = SHARED_MAP.nodes[id];
  return {
    x: n.x + (Math.random() - 0.5) * 0.02,
    y: n.y + (Math.random() - 0.5) * 0.02,
  };
}

/** Soft walk corridor: roads + plot/clearing pads only. */
export function clampToRoadNetwork(x: number, y: number): Vec2 {
  for (const c of SHARED_MAP.clearings) {
    if (Math.hypot(x - c.x, y - c.y) <= c.r) return { x, y };
  }
  for (const p of SHARED_MAP.plots) {
    if (Math.hypot(x - p.x, y - p.y) <= 0.055) return { x, y };
  }
  return snapToRoad(x, y);
}
