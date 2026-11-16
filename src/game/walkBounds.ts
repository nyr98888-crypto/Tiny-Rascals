import type { IslandId, Vec2 } from "./types";
import {
  clampToRoadNetwork,
  randomRoadTarget,
  usesOpenGrassWalk,
  usesSharedMapGraph,
} from "./mapGraph";

/**
 * a1 Meadow — full open lawn between soft top/bottom tree·rock borders.
 * Left/right stay open so Rascals roam the green clearing + pebble path.
 */
const MEADOW_GRASS: Vec2[] = [
  { x: 0.03, y: 0.13 },
  { x: 0.97, y: 0.13 },
  { x: 0.97, y: 0.88 },
  { x: 0.03, y: 0.88 },
];

function grassClearing(
  left: number,
  rightTop: number,
  rightBot: number,
  top: number,
  midY: number,
  bottom: number
): Vec2[] {
  return [
    { x: left, y: top },
    { x: rightTop, y: top },
    { x: rightTop, y: midY },
    { x: rightBot, y: midY + 0.07 },
    { x: rightBot, y: bottom },
    { x: left, y: bottom },
  ];
}

const ISLAND_CLEARINGS: Record<IslandId, Vec2[]> = {
  meadow: MEADOW_GRASS,
  lagoon: grassClearing(0.21, 0.72, 0.68, 0.35, 0.65, 0.85),
  snack: grassClearing(0.21, 0.72, 0.68, 0.35, 0.65, 0.85),
  retro: grassClearing(0.21, 0.72, 0.68, 0.35, 0.65, 0.85),
  hollow: grassClearing(0.21, 0.72, 0.68, 0.35, 0.65, 0.85),
};

export function getIslandClearing(island: IslandId): Vec2[] {
  return ISLAND_CLEARINGS[island] ?? MEADOW_GRASS;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function dist2(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-12) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

export function closestPointOnPolygon(point: Vec2, polygon: Vec2[]): Vec2 {
  let best = polygon[0];
  let bestD = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const c = closestPointOnSegment(point, a, b);
    const d = dist2(point, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: best.x, y: best.y };
}

function clampToGrassPoly(x: number, y: number, island: IslandId): Vec2 {
  const poly = getIslandClearing(island);
  const p = { x, y };
  if (pointInPolygon(p, poly)) return p;
  return closestPointOnPolygon(p, poly);
}

function randomInGrassPoly(island: IslandId): Vec2 {
  const poly = getIslandClearing(island);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of poly) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  for (let i = 0; i < 48; i++) {
    const p = {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    };
    if (pointInPolygon(p, poly)) return p;
  }
  return clampToWalkBounds((minX + maxX) / 2, (minY + maxY) / 2, island);
}

/** Clamp feet onto open grass (a1) / road network / legacy grass poly. */
export function clampToWalkBounds(
  x: number,
  y: number,
  island: IslandId = "meadow"
): Vec2 {
  if (usesOpenGrassWalk(island)) return clampToGrassPoly(x, y, island);
  if (usesSharedMapGraph(island)) return clampToRoadNetwork(x, y);
  return clampToGrassPoly(x, y, island);
}

/** Pick a wander target on open grass (a1), the road graph, or a grass poly. */
export function randomPointInClearing(island: IslandId): Vec2 {
  if (usesOpenGrassWalk(island)) return randomInGrassPoly(island);
  if (usesSharedMapGraph(island)) return randomRoadTarget();
  return randomInGrassPoly(island);
}

/**
 * Subtle depth scale for isometric village maps (back → front).
 */
export function depthScaleAtY(y: number, _island: IslandId = "meadow"): number {
  const top = 0.2;
  const bottom = 0.9;
  const t = (y - top) / Math.max(1e-6, bottom - top);
  const u = Math.max(0, Math.min(1, t));
  return 0.88 + (1.08 - 0.88) * u;
}
