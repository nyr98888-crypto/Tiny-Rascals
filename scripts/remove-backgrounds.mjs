import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();

async function loadRgba(src) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

function idx(x, y, w) {
  return (y * w + x) * 4;
}

/** Edge-connected flood-fill: clear pixels matching predicate (alpha → 0). */
function floodRemove(data, width, height, matches) {
  const visited = new Uint8Array(width * height);
  const stack = [];

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    const p = idx(x, y, width);
    if (!matches(data[p], data[p + 1], data[p + 2], data[p + 3])) return;
    visited[i] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const p = idx(x, y, width);
    data[p + 3] = 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }
}

function isDragonBg(r, g, b, a) {
  if (a < 8) return true;
  // Outer pure/near-black only (JPEG noise). Keep darker gray outlines inside by edge connectivity.
  return r <= 18 && g <= 18 && b <= 18;
}

function isIslandSky(r, g, b, a) {
  if (a < 8) return true;
  // White / near-white clouds
  if (r >= 232 && g >= 232 && b >= 232) return true;
  // Light blue sky (cyan-blue, bright)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const isBlueish = b >= r - 8 && b >= g - 20 && b >= 160;
  const isBright = max >= 170;
  const lowSatOrPastel = max - min <= 90;
  if (isBlueish && isBright && lowSatOrPastel && g >= 170) return true;
  // Soft sky pastels
  if (r >= 180 && g >= 200 && b >= 220 && b >= r && b >= g - 10) return true;
  return false;
}

async function processFile(src, dest, matcher) {
  const { data, width, height } = await loadRgba(src);
  floodRemove(data, width, height, matcher);
  await sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(dest);
  console.log("wrote", path.relative(ROOT, dest), `${width}x${height}`);
}

async function main() {
  const dragonSrcDir = path.join(ROOT, "public", "pets", "dragon blue");
  const dragonDestDir = path.join(ROOT, "public", "pets", "dragon_blue");
  const arenaDest = path.join(ROOT, "public", "arena");
  fs.mkdirSync(dragonDestDir, { recursive: true });
  fs.mkdirSync(arenaDest, { recursive: true });

  const dragonFiles = fs
    .readdirSync(dragonSrcDir)
    .filter((f) => f.startsWith("dragon_") && (f.endsWith(".png.jpg") || f.endsWith(".png")));

  for (const file of dragonFiles) {
    const src = path.join(dragonSrcDir, file);
    const destName = file.replace(/\.png\.jpg$/i, ".png").replace(/\.jpg$/i, ".png");
    const dest = path.join(dragonDestDir, destName);
    await processFile(src, dest, isDragonBg);
  }

  await processFile(
    path.join(ROOT, "public", "world", "island_plate.png.jpg"),
    path.join(arenaDest, "island_plate.png"),
    isIslandSky
  );

  // Sky backdrop: keep opaque (no flood) — just convert to PNG
  await sharp(path.join(ROOT, "public", "world", "sky_bg.png.jpg"))
    .png()
    .toFile(path.join(arenaDest, "sky_bg.png"));
  console.log("wrote public/arena/sky_bg.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
