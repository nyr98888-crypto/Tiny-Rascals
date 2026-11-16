import { TILE } from "@/data/worldMap";
import {
  tileCenter,
  worldToTile,
  type Pt,
  type WalkGridState,
} from "./walkGrid";

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

export function findPath(state: WalkGridState, from: Pt, to: Pt): Pt[] {
  const { grid, cols, rows } = state;
  const s = worldToTile(state, from.x, from.y);
  const g = worldToTile(state, to.x, to.y);
  if (!grid[s.ty * cols + s.tx] || !grid[g.ty * cols + g.tx]) return [];

  const start = s.ty * cols + s.tx;
  const goal = g.ty * cols + g.tx;
  if (start === goal) return [to];

  const open: number[] = [start];
  const came = new Int32Array(cols * rows).fill(-1);
  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const fScore = new Float32Array(cols * rows).fill(Infinity);
  const inOpen = new Uint8Array(cols * rows);
  gScore[start] = 0;
  fScore[start] = heuristic(s.tx, s.ty, g.tx, g.ty);
  inOpen[start] = 1;

  while (open.length) {
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
        tiles.push({ tx: c % cols, ty: Math.floor(c / cols) });
        c = came[c];
      }
      tiles.reverse();
      const world = tiles.map((t) => tileCenter(state, t.tx, t.ty));
      world[world.length - 1] = { x: to.x, y: to.y };
      return smoothPath(state, world);
    }

    const ctx = cur % cols;
    const cty = Math.floor(cur / cols);
    for (const [dx, dy, cost] of DIRS) {
      const nx = ctx + dx;
      const ny = cty + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (dx !== 0 && dy !== 0) {
        if (!grid[cty * cols + nx] || !grid[ny * cols + ctx]) continue;
      }
      const ni = ny * cols + nx;
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

function smoothPath(state: WalkGridState, path: Pt[]): Pt[] {
  if (path.length <= 2) return path;
  const out: Pt[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineOfSight(state, path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

function lineOfSight(state: WalkGridState, a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (TILE * 0.45));
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(1, steps);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const { tx, ty } = worldToTile(state, x, y);
    if (!state.grid[ty * state.cols + tx]) return false;
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
