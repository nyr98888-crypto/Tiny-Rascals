import {
  BRIDGES,
  GRID_COLS,
  GRID_ROWS,
  ISLAND_ORDER,
  ISLANDS,
  TILE,
  islandWalkEllipse,
  type IslandDef,
} from "./worldLayout";

export type Pt = { x: number; y: number };

/** 1 = walkable, 0 = blocked */
export type WalkGrid = Uint8Array;

export function buildWalkGrid(): WalkGrid {
  const grid = new Uint8Array(GRID_COLS * GRID_ROWS);
  for (let ty = 0; ty < GRID_ROWS; ty++) {
    for (let tx = 0; tx < GRID_COLS; tx++) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      grid[ty * GRID_COLS + tx] = isWorldWalkable(cx, cy) ? 1 : 0;
    }
  }
  return grid;
}

export function isWorldWalkable(wx: number, wy: number): boolean {
  for (const id of ISLAND_ORDER) {
    if (pointInEllipse(wx, wy, islandWalkEllipse(ISLANDS[id]))) return true;
  }
  for (const b of BRIDGES) {
    if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return true;
  }
  return false;
}

function pointInEllipse(
  x: number,
  y: number,
  e: { cx: number; cy: number; rx: number; ry: number }
) {
  const dx = x - e.cx;
  const dy = y - e.cy;
  return (dx * dx) / (e.rx * e.rx) + (dy * dy) / (e.ry * e.ry) <= 1;
}

export function worldToTile(wx: number, wy: number) {
  return {
    tx: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(wx / TILE))),
    ty: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(wy / TILE))),
  };
}

export function tileCenter(tx: number, ty: number): Pt {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function nearestWalkableTile(grid: WalkGrid, wx: number, wy: number): Pt {
  const start = worldToTile(wx, wy);
  if (grid[start.ty * GRID_COLS + start.tx]) return tileCenter(start.tx, start.ty);

  // Spiral / BFS outward
  const q: number[] = [start.tx, start.ty];
  const seen = new Uint8Array(GRID_COLS * GRID_ROWS);
  seen[start.ty * GRID_COLS + start.tx] = 1;
  let qi = 0;
  while (qi < q.length) {
    const tx = q[qi++];
    const ty = q[qi++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) continue;
      const i = ny * GRID_COLS + nx;
      if (seen[i]) continue;
      seen[i] = 1;
      if (grid[i]) return tileCenter(nx, ny);
      q.push(nx, ny);
    }
  }
  // Fallback: center island
  return { x: ISLANDS.center.cx, y: ISLANDS.center.cy };
}

export function islandClearing(island: IslandDef): Pt {
  const e = islandWalkEllipse(island);
  return { x: e.cx, y: e.cy };
}
