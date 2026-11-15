import type { IslandId, Vec2 } from "./types";

/**
 * Open oval grass plateau on the new round-island art (normalized UVs).
 * Tuned to sit inside the decorative rim: centerY ≈ 0.43, rx ≈ 0.34, ry ≈ 0.19.
 */
export const OVAL_PLATEAU = {
  cx: 0.5,
  cy: 0.43,
  rx: 0.34,
  ry: 0.19,
};

/** Optional per-island micro-tunes (same oval family). */
const ISLAND_OVALS: Record<IslandId, { cx: number; cy: number; rx: number; ry: number }> = {
  meadow: { ...OVAL_PLATEAU },
  lagoon: { cx: 0.5, cy: 0.43, rx: 0.34, ry: 0.19 },
  snack: { cx: 0.5, cy: 0.435, rx: 0.335, ry: 0.19 },
  retro: { cx: 0.5, cy: 0.43, rx: 0.34, ry: 0.185 },
  hollow: { cx: 0.5, cy: 0.435, rx: 0.33, ry: 0.19 },
};

export function getIslandOval(island: IslandId) {
  return ISLAND_OVALS[island] ?? OVAL_PLATEAU;
}

export function pointInOval(
  point: Vec2,
  oval: { cx: number; cy: number; rx: number; ry: number }
): boolean {
  const nx = (point.x - oval.cx) / oval.rx;
  const ny = (point.y - oval.cy) / oval.ry;
  return nx * nx + ny * ny <= 1;
}

/** Closest point on the ellipse boundary (or the point itself if inside). */
export function closestPointOnOval(
  point: Vec2,
  oval: { cx: number; cy: number; rx: number; ry: number }
): Vec2 {
  const dx = point.x - oval.cx;
  const dy = point.y - oval.cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: oval.cx + oval.rx, y: oval.cy };
  }
  // Map to unit circle, clamp radius, map back
  const ux = dx / oval.rx;
  const uy = dy / oval.ry;
  const len = Math.hypot(ux, uy);
  if (len <= 1) return { x: point.x, y: point.y };
  return {
    x: oval.cx + (ux / len) * oval.rx,
    y: oval.cy + (uy / len) * oval.ry,
  };
}

/** Clamp a normalized point onto the island's open oval plateau. */
export function clampToWalkBounds(
  x: number,
  y: number,
  island: IslandId = "meadow"
): Vec2 {
  const oval = getIslandOval(island);
  const p = { x, y };
  if (pointInOval(p, oval)) return p;
  return closestPointOnOval(p, oval);
}
