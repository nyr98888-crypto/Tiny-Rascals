import {
  TILE,
  islandWalkEllipse,
  resolveActiveBridges,
  unlockedIslands,
  type IslandDef,
  type ResolvedBridge,
  type WorldBounds,
  computeWorldBounds,
} from "@/data/worldMap";

export type Pt = { x: number; y: number };

export type WalkGridState = {
  grid: Uint8Array;
  cols: number;
  rows: number;
  /** World origin of tile (0,0) */
  originX: number;
  originY: number;
  bounds: WorldBounds;
};

function pointInEllipse(
  x: number,
  y: number,
  e: { cx: number; cy: number; rx: number; ry: number }
) {
  const dx = x - e.cx;
  const dy = y - e.cy;
  return (dx * dx) / (e.rx * e.rx) + (dy * dy) / (e.ry * e.ry) <= 1;
}

export function isWalkableAt(
  wx: number,
  wy: number,
  islands: IslandDef[],
  bridges: ResolvedBridge[]
) {
  for (const i of islands) {
    if (pointInEllipse(wx, wy, islandWalkEllipse(i))) return true;
  }
  for (const b of bridges) {
    const c = b.corridor;
    if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) return true;
    // Also thick capsule along the bridge centerline
    if (distToSegment(wx, wy, b.x1, b.y1, b.x2, b.y2) <= b.width * 0.55) return true;
  }
  return false;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/**
 * Build / rebuild the A* navigation grid from unlocked islands + active bridges.
 * Call whenever an island is unlocked or the registry changes.
 */
export function rebuildWalkabilityGrid(
  islands: IslandDef[] = unlockedIslands(),
  bridges: ResolvedBridge[] = resolveActiveBridges()
): WalkGridState {
  const bounds = computeWorldBounds(islands);
  const cols = Math.max(1, Math.ceil(bounds.worldWidth / TILE));
  const rows = Math.max(1, Math.ceil(bounds.worldHeight / TILE));
  const grid = new Uint8Array(cols * rows);
  const originX = bounds.minX;
  const originY = bounds.minY;

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const wx = originX + tx * TILE + TILE / 2;
      const wy = originY + ty * TILE + TILE / 2;
      grid[ty * cols + tx] = isWalkableAt(wx, wy, islands, bridges) ? 1 : 0;
    }
  }

  return { grid, cols, rows, originX, originY, bounds };
}

export function worldToTile(state: WalkGridState, wx: number, wy: number) {
  return {
    tx: Math.max(0, Math.min(state.cols - 1, Math.floor((wx - state.originX) / TILE))),
    ty: Math.max(0, Math.min(state.rows - 1, Math.floor((wy - state.originY) / TILE))),
  };
}

export function tileCenter(state: WalkGridState, tx: number, ty: number): Pt {
  return {
    x: state.originX + tx * TILE + TILE / 2,
    y: state.originY + ty * TILE + TILE / 2,
  };
}

export function nearestWalkable(state: WalkGridState, wx: number, wy: number): Pt {
  const start = worldToTile(state, wx, wy);
  if (state.grid[start.ty * state.cols + start.tx]) {
    return { x: wx, y: wy };
  }
  const q: number[] = [start.tx, start.ty];
  const seen = new Uint8Array(state.cols * state.rows);
  seen[start.ty * state.cols + start.tx] = 1;
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
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) continue;
      const i = ny * state.cols + nx;
      if (seen[i]) continue;
      seen[i] = 1;
      if (state.grid[i]) return tileCenter(state, nx, ny);
      q.push(nx, ny);
    }
  }
  const hub = islandsFallback();
  return { x: hub.x, y: hub.y };
}

function islandsFallback() {
  const list = unlockedIslands();
  return list.find((i) => i.role === "hub") ?? list[0] ?? { x: 2100, y: 1000 };
}
