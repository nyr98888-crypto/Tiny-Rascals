import type { IslandId, Vec2 } from "./types";

/** Percent (0–100) → normalized 0–1. */
export function pct(x: number, y: number): Vec2 {
  return { x: x / 100, y: y / 100 };
}

/**
 * Shared 16:9 camera layout aligned to `land-meadow` (Level 1).
 * Coordinates match the drawn dirt paths, arched bridge, and five tilled plots.
 */
export const SHARED_MAP = {
  /** Five plowed crop plots — Digging / Watering (Sheet 1). */
  plots: [
    { id: "plot-tl", ...pct(28, 40), label: "Top-Left" },
    { id: "plot-bl", ...pct(28, 76), label: "Bottom-Left" },
    { id: "plot-ct", ...pct(53, 25), label: "Central-Top" },
    { id: "plot-cr", ...pct(54, 48), label: "Central-Right" },
    { id: "plot-br", ...pct(66, 86), label: "Bottom-Right" },
  ] as const,

  /** Open grass/sand clearings beside the crossroads for buildings/workstations. */
  clearings: [
    { id: "clear-cross", ...pct(52, 50), r: 0.09, label: "Crossroads clearing" },
    { id: "clear-south", ...pct(45, 70), r: 0.09, label: "South clearing" },
    { id: "clear-east", ...pct(85, 45), r: 0.06, label: "Right-bank clearing" },
  ] as const,

  /**
   * Road & bridge waypoint graph (normalized).
   * Left portal → crossroads → bridge → right portal, plus plot/clearing branches.
   */
  nodes: {
    portal_left: pct(0, 48),
    crossroads: pct(45, 52),
    north_branch: pct(35, 20),
    south_branch: pct(83, 100),
    bridge_w: pct(63, 43),
    bridge_e: pct(76, 34),
    portal_right: pct(100, 12),
    // Spur nodes at each plot / clearing for path snaps
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

/** Undirected road edges — Rascals walk only along these. */
export const ROAD_EDGES: readonly [MapNodeId, MapNodeId][] = [
  ["portal_left", "crossroads"],
  ["crossroads", "north_branch"],
  ["crossroads", "south_branch"],
  ["crossroads", "bridge_w"],
  ["bridge_w", "bridge_e"],
  ["bridge_e", "portal_right"],
  // Plot spurs
  ["crossroads", "plot_tl"],
  ["crossroads", "plot_bl"],
  ["north_branch", "plot_ct"],
  ["bridge_w", "plot_cr"],
  ["south_branch", "plot_br"],
  // Clearing spurs
  ["crossroads", "clear_cross"],
  ["crossroads", "clear_south"],
  ["bridge_e", "clear_east"],
];

/** Islands that use the shared Farland road graph. */
export function usesSharedMapGraph(island: IslandId): boolean {
  return island === "meadow" || island === "lagoon";
}

/** Meadow ↔ Lagoon portals at opposite road ends. */
export const BIOME_PORTALS: Record<
  "meadow" | "lagoon",
  { exitNode: MapNodeId; enterNode: MapNodeId; to: "meadow" | "lagoon" }
> = {
  meadow: { exitNode: "portal_right", enterNode: "portal_left", to: "lagoon" },
  lagoon: { exitNode: "portal_left", enterNode: "portal_right", to: "meadow" },
};

function dist2(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; d2: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) {
    return { point: { x: a.x, y: a.y }, t: 0, d2: dist2(p, a) };
  }
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { point, t, d2: dist2(p, point) };
}

/** Snap a free point onto the nearest road segment. */
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

/** Nearest named waypoint. */
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

/** BFS shortest path of node ids from → to. */
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

/** World positions along the road from (sx,sy) to (tx,ty). */
export function roadPath(sx: number, sy: number, tx: number, ty: number): Vec2[] {
  const start = nearestNode(sx, sy);
  const end = nearestNode(tx, ty);
  const ids = pathNodes(start, end);
  const pts = ids.map((id) => ({ ...SHARED_MAP.nodes[id] }));
  // Ensure final destination is exact station foot (may be slightly off-node)
  if (pts.length) {
    pts[pts.length - 1] = { x: tx, y: ty };
  }
  return pts;
}

/** True when feet are near a portal node (ready to biome-hop). */
export function nearPortal(
  island: IslandId,
  x: number,
  y: number,
  radius = 0.045
): boolean {
  if (!usesSharedMapGraph(island)) return false;
  const portal = BIOME_PORTALS[island as "meadow" | "lagoon"];
  if (!portal) return false;
  const pos = SHARED_MAP.nodes[portal.exitNode];
  return Math.hypot(x - pos.x, y - pos.y) <= radius;
}

/** Random wander target: a plot, clearing, or road node (not portals). */
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

/** Soft walk corridor around roads + plot/clearing pads. */
export function clampToRoadNetwork(x: number, y: number): Vec2 {
  // Allow a little pad around plots/clearings for station work / decorate
  for (const c of SHARED_MAP.clearings) {
    if (Math.hypot(x - c.x, y - c.y) <= c.r) return { x, y };
  }
  for (const p of SHARED_MAP.plots) {
    if (Math.hypot(x - p.x, y - p.y) <= 0.055) return { x, y };
  }
  return snapToRoad(x, y);
}
