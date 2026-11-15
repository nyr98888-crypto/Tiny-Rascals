import type { IslandId, Vec2 } from "./types";

/**
 * One-point perspective trapezoid on the foreshortened tabletop (ISO_Y = 0.56).
 * UVs map through landH = texH * ISO_Y so Rascals stay on the inner floor.
 * Top (far) narrower; bottom (front) wider, inset from rim/waterfalls.
 *
 * Default: top y≈0.30 width≈0.56; bottom y≈0.70 width≈0.74 (centered on x=0.5).
 */
export type TrapezoidBounds = {
  topY: number;
  bottomY: number;
  topHalfW: number;
  bottomHalfW: number;
  cx: number;
};

export const TRAPEZOID_PLATEAU: TrapezoidBounds = {
  cx: 0.5,
  topY: 0.3,
  bottomY: 0.7,
  topHalfW: 0.56 / 2,
  bottomHalfW: 0.74 / 2,
};

const ISLAND_TRAPS: Record<IslandId, TrapezoidBounds> = {
  meadow: { ...TRAPEZOID_PLATEAU },
  lagoon: { cx: 0.5, topY: 0.3, bottomY: 0.7, topHalfW: 0.28, bottomHalfW: 0.37 },
  snack: { cx: 0.5, topY: 0.305, bottomY: 0.705, topHalfW: 0.275, bottomHalfW: 0.365 },
  retro: { cx: 0.5, topY: 0.3, bottomY: 0.7, topHalfW: 0.28, bottomHalfW: 0.37 },
  hollow: { cx: 0.5, topY: 0.305, bottomY: 0.7, topHalfW: 0.275, bottomHalfW: 0.365 },
};

export function getIslandTrapezoid(island: IslandId): TrapezoidBounds {
  return ISLAND_TRAPS[island] ?? TRAPEZOID_PLATEAU;
}

/** Half-width of the trapezoid at normalized y. */
export function halfWidthAtY(y: number, trap: TrapezoidBounds): number {
  const t = (y - trap.topY) / Math.max(1e-6, trap.bottomY - trap.topY);
  const u = Math.max(0, Math.min(1, t));
  return trap.topHalfW + (trap.bottomHalfW - trap.topHalfW) * u;
}

export function pointInTrapezoid(point: Vec2, trap: TrapezoidBounds): boolean {
  if (point.y < trap.topY || point.y > trap.bottomY) return false;
  const hw = halfWidthAtY(point.y, trap);
  return Math.abs(point.x - trap.cx) <= hw;
}

/** Closest point inside/on the trapezoid. */
export function closestPointOnTrapezoid(point: Vec2, trap: TrapezoidBounds): Vec2 {
  const y = Math.max(trap.topY, Math.min(trap.bottomY, point.y));
  const hw = halfWidthAtY(y, trap);
  const x = Math.max(trap.cx - hw, Math.min(trap.cx + hw, point.x));
  return { x, y };
}

/** Clamp a normalized point onto the island's trapezoidal plateau. */
export function clampToWalkBounds(
  x: number,
  y: number,
  island: IslandId = "meadow"
): Vec2 {
  const trap = getIslandTrapezoid(island);
  const p = { x, y };
  if (pointInTrapezoid(p, trap)) return p;
  return closestPointOnTrapezoid(p, trap);
}

/**
 * Depth scale for sprites on the receding ground plane.
 * ~0.82× at the far horizon (topY) → ~1.05× at the front edge (bottomY).
 */
export function depthScaleAtY(y: number, island: IslandId = "meadow"): number {
  const trap = getIslandTrapezoid(island);
  const t = (y - trap.topY) / Math.max(1e-6, trap.bottomY - trap.topY);
  const u = Math.max(0, Math.min(1, t));
  return 0.82 + (1.05 - 0.82) * u;
}
