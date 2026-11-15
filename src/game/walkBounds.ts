import type { IslandId, Vec2 } from "./types";

/**
 * Expanded oval buildable/walkable plateau for god's-eye islands.
 * Fills the inner terrain up to the decorative rim; front-bottom lip pulled
 * inward (cy + ry stays above waterfalls).
 */
export const OVAL_PLATEAU = {
  cx: 0.5,
  cy: 0.4,
  rx: 0.4,
  ry: 0.26,
};

/** Per-island micro-tunes — same expanded oval family. */
const ISLAND_OVALS: Record<IslandId, { cx: number; cy: number; rx: number; ry: number }> = {
  meadow: { cx: 0.5, cy: 0.4, rx: 0.4, ry: 0.26 },
  lagoon: { cx: 0.5, cy: 0.4, rx: 0.4, ry: 0.265 },
  snack: { cx: 0.5, cy: 0.405, rx: 0.395, ry: 0.26 },
  retro: { cx: 0.5, cy: 0.4, rx: 0.4, ry: 0.255 },
  hollow: { cx: 0.5, cy: 0.405, rx: 0.39, ry: 0.26 },
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
