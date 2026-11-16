import { GRID_COLS, GRID_ROWS, TILE } from "./worldLayout";
import { tileCenter, worldToTile, type Pt, type WalkGrid } from "./walkGrid";

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

function heuristic(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * A* on the walk grid. Returns world-space waypoints (tile centers),
 * including start and goal, or empty if no path.
 */
export function findPath(grid: WalkGrid, from: Pt, to: Pt): Pt[] {
  const s = worldToTile(from.x, from.y);
  const g = worldToTile(to.x, to.y);
  if (!grid[s.ty * GRID_COLS + s.tx] || !grid[g.ty * GRID_COLS + g.tx]) return [];

  const start = s.ty * GRID_COLS + s.tx;
  const goal = g.ty * GRID_COLS + g.tx;
  if (start === goal) return [to];

  const open: number[] = [start];
  const came = new Int32Array(GRID_COLS * GRID_ROWS).fill(-1);
  const gScore = new Float32Array(GRID_COLS * GRID_ROWS).fill(Infinity);
  const fScore = new Float32Array(GRID_COLS * GRID_ROWS).fill(Infinity);
  const inOpen = new Uint8Array(GRID_COLS * GRID_ROWS);
  gScore[start] = 0;
  fScore[start] = heuristic(s.tx, s.ty, g.tx, g.ty);
  inOpen[start] = 1;

  while (open.length) {
    // Pop lowest fScore
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
    }
    const cur = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();
    inOpen[cur] = 0;

    if (cur === goal) {
      const tiles: { tx: number; ty: number }[] = [];
      let c = goal;
      while (c !== -1) {
        tiles.push({ tx: c % GRID_COLS, ty: Math.floor(c / GRID_COLS) });
        c = came[c];
      }
      tiles.reverse();
      const world = tiles.map((t) => tileCenter(t.tx, t.ty));
      // Snap final waypoint to exact click
      world[world.length - 1] = { x: to.x, y: to.y };
      return smoothPath(grid, world);
    }

    const ctx = cur % GRID_COLS;
    const cty = Math.floor(cur / GRID_COLS);

    for (const [dx, dy, cost] of DIRS) {
      const nx = ctx + dx;
      const ny = cty + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) continue;
      // No corner-cutting through blocked diagonals
      if (dx !== 0 && dy !== 0) {
        if (!grid[cty * GRID_COLS + nx] || !grid[ny * GRID_COLS + ctx]) continue;
      }
      const ni = ny * GRID_COLS + nx;
      if (!grid[ni]) continue;
      const tent = gScore[cur] + cost;
      if (tent >= gScore[ni]) continue;
      came[ni] = cur;
      gScore[ni] = tent;
      fScore[ni] = tent + heuristic(nx, ny, g.tx, g.ty);
      if (!inOpen[ni]) {
        open.push(ni);
        inOpen[ni] = 1;
      }
    }
  }
  return [];
}

/** Remove intermediate waypoints when line-of-sight is clear. */
function smoothPath(grid: WalkGrid, path: Pt[]): Pt[] {
  if (path.length <= 2) return path;
  const out: Pt[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineOfSight(grid, path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

function lineOfSight(grid: WalkGrid, a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE * 0.45));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const { tx, ty } = worldToTile(x, y);
    if (!grid[ty * GRID_COLS + tx]) return false;
  }
  return true;
}

export function pathLength(path: Pt[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return len;
}
