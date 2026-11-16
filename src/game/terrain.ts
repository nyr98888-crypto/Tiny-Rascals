import type { IslandId } from "./types";
import {
  BIOME_GROUND,
  GRID_COLS,
  GRID_ROWS,
  PLOT_CELLS,
  PLOT_H,
  PLOT_W,
  SEAM_FEATHER,
  WORLD_H,
  WORLD_W,
} from "./worldGrid";

/**
 * Build one continuous Meadow-style ranch ground (no boxed biome illustrations).
 * Meadow photo is stamped as soft detail; biomes are feathered color fields + a dirt road.
 */
export function buildContinuousTerrain(
  meadowImg: CanvasImageSource | null
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 1) Unified meadow-green base (never black / never boxed plates)
  const base = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  base.addColorStop(0, "#6fa053");
  base.addColorStop(0.45, "#7daf5c");
  base.addColorStop(1, "#68964f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Soft grass mottling across the whole ranch
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * WORLD_W;
    const y = Math.random() * WORLD_H;
    const r = 40 + Math.random() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(180, 210, 110, ${0.05 + Math.random() * 0.08})`);
    g.addColorStop(1, "rgba(180, 210, 110, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) Stamp Meadow texture as shared top-down detail (soft, tiled, not boxed)
  if (meadowImg) {
    ctx.save();
    ctx.globalAlpha = 0.38;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const x = col * PLOT_W;
        const y = row * PLOT_H;
        // Slight overlap so stamps don't form hard plate edges
        const pad = SEAM_FEATHER * 0.35;
        ctx.drawImage(
          meadowImg,
          x - pad,
          y - pad,
          PLOT_W + pad * 2,
          PLOT_H + pad * 2
        );
      }
    }
    ctx.restore();
  }

  // 3) Feathered biome color washes (smooth grass → sand → moss → dirt)
  for (const cell of PLOT_CELLS) {
    paintBiomeWash(ctx, cell.id, cell.originX, cell.originY);
  }

  // Soft water patches (Lagoon / Shore) — objects in the ground plane, not boxed art
  for (const cell of PLOT_CELLS) {
    if (cell.id !== "lagoon" && cell.id !== "shore") continue;
    paintWaterPatch(
      ctx,
      cell.centerX + (cell.id === "shore" ? 120 : -80),
      cell.centerY + (cell.id === "shore" ? 40 : -30),
      cell.id === "shore" ? 160 : 200,
      cell.id === "shore" ? 70 : 95
    );
  }

  // 4) Continuous dirt / pebble road linking plot centers
  paintRanchRoads(ctx);

  // 5) Soft outer vignette matching Meadow border calm (not cliffs)
  const vig = ctx.createRadialGradient(
    WORLD_W / 2,
    WORLD_H / 2,
    Math.min(WORLD_W, WORLD_H) * 0.35,
    WORLD_W / 2,
    WORLD_H / 2,
    Math.max(WORLD_W, WORLD_H) * 0.72
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(40, 55, 30, 0.18)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  return canvas;
}

function paintBiomeWash(
  ctx: CanvasRenderingContext2D,
  id: IslandId,
  ox: number,
  oy: number
) {
  const { base, accent } = BIOME_GROUND[id];
  const cx = ox + PLOT_W / 2;
  const cy = oy + PLOT_H / 2;
  const rx = PLOT_W * 0.62;
  const ry = PLOT_H * 0.62;

  // Feathered ellipse — bleeds past the plot rect so neighbors blend
  const grad = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.15, cx, cy, Math.max(rx, ry));
  grad.addColorStop(0, hexAlpha(base, 0.72));
  grad.addColorStop(0.55, hexAlpha(accent, 0.42));
  grad.addColorStop(1, hexAlpha(base, 0));

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Extra soft edge strip into neighboring cells
  const feather = SEAM_FEATHER;
  const strips: [number, number, number, number, string][] = [
    [ox - feather * 0.2, oy, feather * 1.2, PLOT_H, base],
    [ox + PLOT_W - feather, oy, feather * 1.2, PLOT_H, base],
    [ox, oy - feather * 0.2, PLOT_W, feather * 1.2, base],
    [ox, oy + PLOT_H - feather, PLOT_W, feather * 1.2, base],
  ];
  ctx.save();
  ctx.globalAlpha = 0.2;
  for (const [x, y, w, h, color] of strips) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function paintWaterPatch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, "rgba(120, 190, 220, 0.75)");
  g.addColorStop(0.55, "rgba(80, 160, 200, 0.45)");
  g.addColorStop(1, "rgba(80, 160, 200, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 230, 240, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function paintRanchRoads(ctx: CanvasRenderingContext2D) {
  const centers = PLOT_CELLS.map((c) => ({ x: c.centerX, y: c.centerY, id: c.id }));
  const pathColor = "#c4a46a";
  const pathEdge = "#a88850";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Horizontal links per row + vertical links per col
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [3, 4],
    [4, 5],
    [0, 3],
    [1, 4],
    [2, 5],
  ];

  for (const [a, b] of links) {
    const p0 = centers[a];
    const p1 = centers[b];
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    // slight meander
    const nx = mx + (p0.y === p1.y ? 0 : (a % 2 === 0 ? 36 : -36));
    const ny = my + (p0.x === p1.x ? 0 : (a % 2 === 0 ? -28 : 28));

    ctx.strokeStyle = pathEdge;
    ctx.lineWidth = 54;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(nx, ny, p1.x, p1.y);
    ctx.stroke();

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 38;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(nx, ny, p1.x, p1.y);
    ctx.stroke();

    // pebble highlights
    ctx.strokeStyle = "rgba(232, 214, 170, 0.45)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(nx, ny, p1.x, p1.y);
    ctx.stroke();
  }

  // Clearing pads at each plot center
  for (const c of centers) {
    const pad = BIOME_GROUND[c.id as IslandId].path;
    ctx.fillStyle = hexAlpha(pad, 0.85);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 70, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
