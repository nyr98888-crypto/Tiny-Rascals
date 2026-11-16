import type { IslandId, Vec2 } from "./types";

/** Single plot cell size (meadow aspect); every biome image stretches into this. */
export const PLOT_W = 3200;
export const PLOT_H = 1786;

export const GRID_COLS = 3;
export const GRID_ROWS = 2;

export const WORLD_W = PLOT_W * GRID_COLS;
export const WORLD_H = PLOT_H * GRID_ROWS;

/** Soft overlap (world px) so adjacent ground textures blend at seams. */
export const SEAM_OVERLAP = 12;

/**
 * 3×2 ranch layout (col, row):
 *   [ retro ] [ lagoon ] [ meadow ]
 *   [ snack ] [ hollow ] [ shore  ]
 */
export const PLOT_GRID: IslandId[][] = [
  ["retro", "lagoon", "meadow"],
  ["snack", "hollow", "shore"],
];

export type PlotCell = {
  id: IslandId;
  col: number;
  row: number;
  /** Top-left of this plot in world pixel space (origin at world top-left). */
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
};

const cells: PlotCell[] = [];
const byId = {} as Record<IslandId, PlotCell>;

for (let row = 0; row < GRID_ROWS; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const id = PLOT_GRID[row][col];
    const originX = col * PLOT_W;
    const originY = row * PLOT_H;
    const cell: PlotCell = {
      id,
      col,
      row,
      originX,
      originY,
      centerX: originX + PLOT_W * 0.5,
      centerY: originY + PLOT_H * 0.5,
    };
    cells.push(cell);
    byId[id] = cell;
  }
}

export const PLOT_CELLS: readonly PlotCell[] = cells;

export function getPlotCell(id: IslandId): PlotCell {
  return byId[id];
}

/** Local plot UV (0–1) → global world UV (0–1 across full ranch). */
export function localToGlobal(island: IslandId, lx: number, ly: number): Vec2 {
  const c = byId[island];
  return {
    x: (c.col + lx) / GRID_COLS,
    y: (c.row + ly) / GRID_ROWS,
  };
}

/** Global UV → plot + local UV. */
export function globalToLocal(gx: number, gy: number): { island: IslandId; x: number; y: number } {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(gx * GRID_COLS)));
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(gy * GRID_ROWS)));
  const island = PLOT_GRID[row][col];
  return {
    island,
    x: gx * GRID_COLS - col,
    y: gy * GRID_ROWS - row,
  };
}

export function plotAtGlobal(gx: number, gy: number): IslandId {
  return globalToLocal(gx, gy).island;
}

/** Global UV → world pixel (centered world: origin at ranch center). */
export function globalToWorldPx(gx: number, gy: number, landX: number, landY: number): Vec2 {
  return {
    x: landX + gx * WORLD_W,
    y: landY + gy * WORLD_H,
  };
}

export function worldPxToGlobal(
  wx: number,
  wy: number,
  landX: number,
  landY: number
): Vec2 {
  return {
    x: (wx - landX) / WORLD_W,
    y: (wy - landY) / WORLD_H,
  };
}

/** Soft walk band inset from the outer ranch border (tree/rock edges). */
export const WORLD_WALK_MARGIN = { top: 0.06, bottom: 0.06, left: 0.02, right: 0.02 };

export function clampToWorldWalk(gx: number, gy: number): Vec2 {
  return {
    x: Math.min(1 - WORLD_WALK_MARGIN.right, Math.max(WORLD_WALK_MARGIN.left, gx)),
    y: Math.min(1 - WORLD_WALK_MARGIN.bottom, Math.max(WORLD_WALK_MARGIN.top, gy)),
  };
}

export function randomWorldWalkPoint(): Vec2 {
  return clampToWorldWalk(
    WORLD_WALK_MARGIN.left +
      Math.random() * (1 - WORLD_WALK_MARGIN.left - WORLD_WALK_MARGIN.right),
    WORLD_WALK_MARGIN.top +
      Math.random() * (1 - WORLD_WALK_MARGIN.top - WORLD_WALK_MARGIN.bottom)
  );
}
