/**
 * Dragon sheet cleaner + 3×3 auto-packer.
 * 1) Strip ALL near-black pixels (R,G,B < 26), feather edges
 * 2) Detect 9 sprite blobs (reading order), pack into exact 768×768 (3×256)
 *    with bottom-center alignment per cell.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const DEST_DIR = path.join(ROOT, "public", "pets", "dragon_blue");
const SRC_DIR = path.join(ROOT, "public", "pets", "dragon blue");
const CELL = 256;
const SHEET = CELL * 3; // 768
const BLACK = 26;
const MIN_BLOB_AREA = 80;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

async function loadRgba(src) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/** Global near-black strip + 1px alpha feather on remaining opaque edges. */
function stripNearBlack(data, width, height) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < BLACK && g < BLACK && b < BLACK) {
      data[i + 3] = 0;
    }
  }

  // 1px feather: any opaque pixel with a transparent 4-neighbor gets alpha *= 0.55
  const next = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = idx(x, y, width);
      if (data[p + 3] < 8) continue;
      let touch = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          touch = true;
          break;
        }
        if (data[idx(nx, ny, width) + 3] < 8) {
          touch = true;
          break;
        }
      }
      if (touch) next[p + 3] = Math.max(0, Math.round(data[p + 3] * 0.55));
    }
  }
  data.set(next);
}

function findBlobs(data, width, height) {
  const visited = new Uint8Array(width * height);
  const blobs = [];

  const isOpaque = (x, y) => data[idx(x, y, width) + 3] >= 20;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || !isOpaque(x, y)) continue;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      const stack = [x, y];
      visited[start] = 1;

      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        area++;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni] || !isOpaque(nx, ny)) continue;
          visited[ni] = 1;
          stack.push(nx, ny);
        }
      }

      if (area < MIN_BLOB_AREA) continue;
      blobs.push({
        minX,
        minY,
        maxX,
        maxY,
        area,
        cx: sumX / area,
        cy: sumY / area,
      });
    }
  }
  return blobs;
}

/** Assign blobs to a 3×3 grid by centroid; merge into 9 cell boxes. */
function packCells(blobs, width, height) {
  const cellW = width / 3;
  const cellH = height / 3;
  const cells = Array.from({ length: 9 }, () => null);

  // Prefer larger blobs first so tools attach to the dragon, not vice versa
  const sorted = [...blobs].sort((a, b) => b.area - a.area);

  for (const blob of sorted) {
    const col = Math.min(2, Math.max(0, Math.floor(blob.cx / cellW)));
    const row = Math.min(2, Math.max(0, Math.floor(blob.cy / cellH)));
    // Soft nudge: if centroid is very close to a grid line, pick by overlap with coarse cell
    let best = row * 3 + col;
    let bestScore = -1;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x0 = c * cellW;
        const y0 = r * cellH;
        const x1 = x0 + cellW;
        const y1 = y0 + cellH;
        const ox = Math.max(0, Math.min(blob.maxX, x1) - Math.max(blob.minX, x0));
        const oy = Math.max(0, Math.min(blob.maxY, y1) - Math.max(blob.minY, y0));
        const overlap = ox * oy;
        // Bias toward cell whose center is near blob centroid
        const ccx = x0 + cellW / 2;
        const ccy = y0 + cellH / 2;
        const dist =
          Math.hypot(blob.cx - ccx, blob.cy - ccy) / Math.hypot(cellW, cellH);
        const score = overlap * (1.25 - dist);
        if (score > bestScore) {
          bestScore = score;
          best = r * 3 + c;
        }
      }
    }

    const cur = cells[best];
    if (!cur) {
      cells[best] = {
        minX: blob.minX,
        minY: blob.minY,
        maxX: blob.maxX,
        maxY: blob.maxY,
      };
    } else {
      cur.minX = Math.min(cur.minX, blob.minX);
      cur.minY = Math.min(cur.minY, blob.minY);
      cur.maxX = Math.max(cur.maxX, blob.maxX);
      cur.maxY = Math.max(cur.maxY, blob.maxY);
    }
  }

  // Fallback: coarse grid crop for empty cells
  for (let i = 0; i < 9; i++) {
    if (cells[i]) continue;
    const c = i % 3;
    const r = Math.floor(i / 3);
    cells[i] = {
      minX: Math.floor(c * cellW + cellW * 0.08),
      minY: Math.floor(r * cellH + cellH * 0.08),
      maxX: Math.floor(c * cellW + cellW * 0.92),
      maxY: Math.floor(r * cellH + cellH * 0.92),
    };
  }
  return cells;
}

function copyRect(src, sw, sh, box, pad = 2) {
  const x0 = Math.max(0, box.minX - pad);
  const y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(sw - 1, box.maxX + pad);
  const y1 = Math.min(sh - 1, box.maxY + pad);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const out = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const si = idx(x0 + x, y0 + y, sw);
      const di = idx(x, y, bw);
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: bw, height: bh };
}

/** Fit sprite into 256×256 bottom-center aligned. */
function placeInCell(sprite, cellBuf, cellOffsetX, cellOffsetY, sheetW) {
  const margin = 6;
  const maxW = CELL - margin * 2;
  const maxH = CELL - margin * 2;
  const scale = Math.min(maxW / sprite.width, maxH / sprite.height, 1);
  const dw = Math.max(1, Math.round(sprite.width * scale));
  const dh = Math.max(1, Math.round(sprite.height * scale));
  const destX = cellOffsetX + Math.floor((CELL - dw) / 2);
  const destY = cellOffsetY + CELL - margin - dh;

  // Nearest-neighbor scale into sheet
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sprite.height - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sprite.width - 1, Math.floor(x / scale));
      const si = idx(sx, sy, sprite.width);
      if (sprite.data[si + 3] < 4) continue;
      const di = idx(destX + x, destY + y, sheetW);
      cellBuf[di] = sprite.data[si];
      cellBuf[di + 1] = sprite.data[si + 1];
      cellBuf[di + 2] = sprite.data[si + 2];
      cellBuf[di + 3] = sprite.data[si + 3];
    }
  }
}

async function processSheet(srcPath, destPath) {
  const { data, width, height } = await loadRgba(srcPath);
  stripNearBlack(data, width, height);
  const blobs = findBlobs(data, width, height);
  const cells = packCells(blobs, width, height);

  const sheet = new Uint8ClampedArray(SHEET * SHEET * 4);
  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sprite = copyRect(data, width, height, cells[i]);
    placeInCell(sprite, sheet, col * CELL, row * CELL, SHEET);
  }

  await sharp(Buffer.from(sheet), {
    raw: { width: SHEET, height: SHEET, channels: 4 },
  })
    .png()
    .toFile(destPath);

  const opaque = [...sheet].filter((_, i) => i % 4 === 3 && sheet[i] > 20).length;
  console.log(
    `packed ${path.basename(destPath)} ← ${width}x${height}, blobs=${blobs.length}, opaque≈${opaque}`
  );
}

function resolveSources() {
  const names = [
    "dragon_base_moods",
    "dragon_carry_emotions",
    "dragon_chop",
    "dragon_dig",
    "dragon_farm",
    "dragon_food_cook",
    "dragon_idle_hop",
    "dragon_master",
    "dragon_mine",
    "dragon_move",
    "dragon_pickup_front",
  ];

  return names.map((base) => {
    const jpg = path.join(SRC_DIR, `${base}.png.jpg`);
    const pngSrc = path.join(SRC_DIR, `${base}.png`);
    const existing = path.join(DEST_DIR, `${base}.png`);
    let src = existing;
    if (fs.existsSync(jpg)) src = jpg;
    else if (fs.existsSync(pngSrc)) src = pngSrc;
    return { src, dest: path.join(DEST_DIR, `${base}.png`), base };
  });
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const files = resolveSources();
  for (const f of files) {
    if (!fs.existsSync(f.src)) {
      console.warn("missing", f.base);
      continue;
    }
    await processSheet(f.src, f.dest);
  }
  console.log("done — all sheets are exact 768×768 (3×256)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
