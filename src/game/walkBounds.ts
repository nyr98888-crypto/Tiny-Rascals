import type { IslandId, Vec2 } from "./types";
import { clampToWorldWalk, randomWorldWalkPoint } from "./worldGrid";

/**
 * Subtle depth scale for isometric village maps (back → front).
 * Uses global Y across the continuous ranch.
 */
export function depthScaleAtY(y: number, _island: IslandId = "meadow"): number {
  const top = 0.04;
  const bottom = 0.96;
  const t = (y - top) / Math.max(1e-6, bottom - top);
  const u = Math.max(0, Math.min(1, t));
  return 0.88 + (1.08 - 0.88) * u;
}

/** Clamp feet to the continuous ranch walk band (soft outer tree borders). */
export function clampToWalkBounds(
  x: number,
  y: number,
  _island: IslandId = "meadow"
): Vec2 {
  return clampToWorldWalk(x, y);
}

/** Pick a wander target anywhere on the open ranch. */
export function randomPointInClearing(_island: IslandId): Vec2 {
  return randomWorldWalkPoint();
}
