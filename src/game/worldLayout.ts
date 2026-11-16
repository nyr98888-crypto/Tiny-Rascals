/** Classic RTS world layout (world pixel space). */

export const WORLD_W = 4200;
export const WORLD_H = 2000;

export const ISLAND_W = 1400;
/** island_plate.png is 3168×1344 */
export const ISLAND_H = Math.round(ISLAND_W * (1344 / 3168)); // ~594

export const BRIDGE_W = 320;
export const BRIDGE_H = 140;

export const TILE = 32;
export const GRID_COLS = Math.floor(WORLD_W / TILE); // 131
export const GRID_ROWS = Math.floor(WORLD_H / TILE); // 62

export const CLIFF_INSET = 35;

export type IslandId = "left" | "center" | "right";

export type IslandDef = {
  id: IslandId;
  label: string;
  cx: number;
  cy: number;
};

export const ISLANDS: Record<IslandId, IslandDef> = {
  left: { id: "left", label: "Left Island", cx: 780, cy: 1000 },
  center: { id: "center", label: "Center Base", cx: 2100, cy: 1000 },
  right: { id: "right", label: "Right Island", cx: 3420, cy: 1000 },
};

export const ISLAND_ORDER: IslandId[] = ["left", "center", "right"];

export function islandRect(island: IslandDef) {
  return {
    left: island.cx - ISLAND_W / 2,
    top: island.cy - ISLAND_H / 2,
    width: ISLAND_W,
    height: ISLAND_H,
  };
}

/** Grass plateau ellipse (cliff rim inset). cy biased up toward the plateau. */
export function islandWalkEllipse(island: IslandDef) {
  return {
    cx: island.cx,
    cy: island.cy - ISLAND_H * 0.06,
    rx: ISLAND_W / 2 - CLIFF_INSET,
    ry: ISLAND_H * 0.34,
  };
}

export type BridgeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const BRIDGES: BridgeDef[] = [
  {
    id: "bridge-lc",
    x: (ISLANDS.left.cx + ISLANDS.center.cx) / 2 - BRIDGE_W / 2,
    y: 1000 - BRIDGE_H / 2,
    w: BRIDGE_W,
    h: BRIDGE_H,
  },
  {
    id: "bridge-cr",
    x: (ISLANDS.center.cx + ISLANDS.right.cx) / 2 - BRIDGE_W / 2,
    y: 1000 - BRIDGE_H / 2,
    w: BRIDGE_W,
    h: BRIDGE_H,
  },
];

export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 1.4;
export const DEFAULT_ZOOM = 1.0;

export const DRAGON_SIZE = 120;
export const EDGE_SCROLL_PX = 24;
export const EDGE_SCROLL_SPEED = 900; // world px / sec at zoom 1
