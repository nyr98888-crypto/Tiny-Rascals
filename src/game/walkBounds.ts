import type { IslandId, Vec2 } from "./types";

/**
 * Spacious rounded-rectangle clearing on full-bleed Farland-style maps.
 * Covers central + lower-foreground ground; clear of upper cliffs/trees and
 * bottom-corner creek. Approx x: 0.12–0.88, y: 0.28–0.84 with rounded corners.
 */
function roundedClearing(
  left: number,
  right: number,
  top: number,
  bottom: number,
  corner = 0.06
): Vec2[] {
  const c = corner;
  return [
    { x: left + c, y: top },
    { x: right - c, y: top },
    { x: right, y: top + c },
    { x: right, y: bottom - c },
    { x: right - c, y: bottom },
    { x: left + c, y: bottom },
    { x: left, y: bottom - c },
    { x: left, y: top + c },
  ];
}

const DEFAULT_CLEARING = roundedClearing(0.12, 0.88, 0.28, 0.84, 0.06);

const ISLAND_CLEARINGS: Record<IslandId, Vec2[]> = {
  meadow: roundedClearing(0.12, 0.88, 0.28, 0.84, 0.06),
  lagoon: roundedClearing(0.12, 0.88, 0.28, 0.84, 0.055),
  snack: roundedClearing(0.125, 0.875, 0.285, 0.835, 0.06),
  retro: roundedClearing(0.12, 0.88, 0.28, 0.84, 0.055),
  hollow: roundedClearing(0.125, 0.875, 0.28, 0.84, 0.06),
};

export function getIslandClearing(island: IslandId): Vec2[] {
  return ISLAND_CLEARINGS[island] ?? DEFAULT_CLEARING;
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

/** Clamp a normalized point onto the island's open clearing. */
export function clampToWalkBounds(
  x: number,
  y: number,
  island: IslandId = "meadow"
): Vec2 {
  const poly = getIslandClearing(island);
  const p = { x, y };
  if (pointInPolygon(p, poly)) return p;
  return closestPointOnPolygon(p, poly);
}

/**
 * Subtle depth scale for isometric village maps (back → front).
 * ~0.88× at clearing top → ~1.06× at clearing bottom.
 */
export function depthScaleAtY(y: number, _island: IslandId = "meadow"): number {
  const top = 0.28;
  const bottom = 0.84;
  const t = (y - top) / Math.max(1e-6, bottom - top);
  const u = Math.max(0, Math.min(1, t));
  return 0.88 + (1.06 - 0.88) * u;
}
