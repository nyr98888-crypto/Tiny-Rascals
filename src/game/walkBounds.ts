import type { IslandId, Vec2 } from "./types";

/**
 * Isometric grass-plateau diamonds per island (normalized land UVs),
 * inset inside the cliff rim so feet never sit in mid-air.
 * Vertices ordered clockwise: N → E → S → W (and optional mid-edge insets).
 * UVs map through the engine's flattened landH (texH * ISO_Y = 0.65).
 */
const ISLAND_DIAMONDS: Record<IslandId, Vec2[]> = {
  meadow: [
    { x: 0.5, y: 0.06 },
    { x: 0.78, y: 0.28 },
    { x: 0.88, y: 0.46 },
    { x: 0.72, y: 0.66 },
    { x: 0.5, y: 0.76 },
    { x: 0.28, y: 0.66 },
    { x: 0.12, y: 0.46 },
    { x: 0.22, y: 0.28 },
  ],
  lagoon: [
    { x: 0.5, y: 0.07 },
    { x: 0.77, y: 0.29 },
    { x: 0.87, y: 0.47 },
    { x: 0.71, y: 0.67 },
    { x: 0.5, y: 0.77 },
    { x: 0.29, y: 0.67 },
    { x: 0.13, y: 0.47 },
    { x: 0.23, y: 0.29 },
  ],
  snack: [
    { x: 0.5, y: 0.08 },
    { x: 0.76, y: 0.3 },
    { x: 0.86, y: 0.48 },
    { x: 0.7, y: 0.68 },
    { x: 0.5, y: 0.78 },
    { x: 0.3, y: 0.68 },
    { x: 0.14, y: 0.48 },
    { x: 0.24, y: 0.3 },
  ],
  retro: [
    { x: 0.5, y: 0.07 },
    { x: 0.77, y: 0.28 },
    { x: 0.87, y: 0.46 },
    { x: 0.71, y: 0.66 },
    { x: 0.5, y: 0.76 },
    { x: 0.29, y: 0.66 },
    { x: 0.13, y: 0.46 },
    { x: 0.23, y: 0.28 },
  ],
  hollow: [
    { x: 0.5, y: 0.08 },
    { x: 0.76, y: 0.29 },
    { x: 0.86, y: 0.47 },
    { x: 0.7, y: 0.67 },
    { x: 0.5, y: 0.77 },
    { x: 0.3, y: 0.67 },
    { x: 0.14, y: 0.47 },
    { x: 0.24, y: 0.29 },
  ],
};

export function getIslandDiamond(island: IslandId): Vec2[] {
  return ISLAND_DIAMONDS[island];
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  // Ray-cast to +X
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

/** Closest point on segment AB to P. */
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

/** Clamp a normalized point onto the island's grass diamond. */
export function clampToWalkBounds(
  x: number,
  y: number,
  island: IslandId = "meadow"
): Vec2 {
  const poly = getIslandDiamond(island);
  const p = { x, y };
  if (pointInPolygon(p, poly)) return p;
  return closestPointOnPolygon(p, poly);
}
