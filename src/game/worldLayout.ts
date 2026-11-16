/** Large god-mode world layout (world pixel space). */

export const WORLD_W = 3800;
export const WORLD_H = 1600;

export const ISLAND_W = 1450;
/** island_plate.png is 3168×1344 */
export const ISLAND_H = Math.round(ISLAND_W * (1344 / 3168)); // ~615

export const BRIDGE_W = 260;
export const BRIDGE_H = 90;

export type IslandId = "left" | "center" | "right";

export type IslandDef = {
  id: IslandId;
  label: string;
  /** Center of island plate in world px */
  cx: number;
  cy: number;
};

export const ISLANDS: Record<IslandId, IslandDef> = {
  left: { id: "left", label: "Left Island", cx: 750, cy: 820 },
  center: { id: "center", label: "Center Base", cx: 1900, cy: 860 },
  right: { id: "right", label: "Right Island", cx: 3050, cy: 820 },
};

export function islandOrigin(island: IslandDef) {
  return {
    left: island.cx - ISLAND_W / 2,
    top: island.cy - ISLAND_H / 2,
  };
}

/** Bridge placed in the overlap between adjacent island plates. */
export function bridgeBetween(a: IslandDef, b: IslandDef) {
  const midX = (a.cx + b.cx) / 2;
  const midY = (a.cy + b.cy) / 2 - 18;
  return {
    left: midX - BRIDGE_W / 2,
    top: midY - BRIDGE_H / 2,
  };
}

export const MIN_ZOOM = 0.48;
export const MAX_ZOOM = 1.5;
export const DEFAULT_ZOOM = 1.0;

export const DRAGON_SIZE = 120;
