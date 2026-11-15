/**
 * Tiny Rascals — Step 1 asset pipeline
 * public/world + public/pets → public/assets-built + src/data/assetManifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const worldDir = path.join(root, "public", "world");
const petsDir = path.join(root, "public", "pets");
const outRoot = path.join(root, "public", "assets-built");
const outLands = path.join(outRoot, "lands");
const outBackdrops = path.join(outRoot, "backdrops");
const outWorld = path.join(outRoot, "world");
const outRascals = path.join(outRoot, "rascals");
const manifestPath = path.join(root, "src", "data", "assetManifest.json");

const ISLAND_IDS = ["meadow", "lagoon", "snack", "retro", "hollow"];
const FLOOD_TOLERANCE = 28;
/** Pure-black pet sheet BG: only flood pixels with RGB <= this (keeps charcoal outlines). */
const BLACK_BG_MAX = 14;
const TRIM_MARGIN = 16;
const LAND_MAX_W = 2048;
const FRAME = 160;
const ATLAS_COLS = 3;
const ATLAS_ROWS = 9;
const ALPHA_CONTENT = 15;
const BOTTOM_PAD = 8;

const POSE_NAMES = [
  // sheet1 chores 0-8
  "watering", "digging", "carry_berries", "cooking", "sweeping", "carry_logs",
  "bathing", "sleeping", "wipe_sweat",
  // sheet2 movement 9-17
  "walk_left", "walk_front", "walk_right", "crouch", "jump_cheer", "happy_dance",
  "sprint_right", "trip_fall", "idle",
  // sheet3 emotes 18-26
  "celebrate", "laugh", "eat_berry", "heart_eyes", "surprised", "shy",
  "grumpy", "dizzy_stars", "wave_hello",
];

/** @type {Record<string, string[]>} */
const SHEET_FRAME_IDS = {
  "buildings-sheet": [
    "building_shed", "building_greenhouse", "building_spa",
    "building_kitchen", "building_clubhouse", "building_barn_house",
    "building_workshop", "building_cottage", "building_harbor_t1",
  ],
  "theme-lagoon": [
    "theme_lagoon_1", "theme_lagoon_2", "theme_lagoon_3",
    "theme_lagoon_4", "theme_lagoon_5", "theme_lagoon_6",
    "theme_lagoon_7", "theme_lagoon_8", "theme_lagoon_9",
  ],
  "theme-snack": [
    "theme_snack_1", "theme_snack_2", "theme_snack_3",
    "theme_snack_4", "theme_snack_5", "theme_snack_6",
    "theme_snack_7", "theme_snack_8", "theme_snack_9",
  ],
  "theme-retro": [
    "theme_retro_1", "theme_retro_2", "theme_retro_3",
    "theme_retro_4", "theme_retro_5", "theme_retro_6",
    "theme_retro_7", "theme_retro_8", "theme_retro_9",
  ],
  "theme-hollow": [
    "theme_hollow_1", "theme_hollow_2", "theme_hollow_3",
    "theme_hollow_4", "theme_hollow_5", "theme_hollow_6",
    "theme_hollow_7", "theme_hollow_8", "theme_hollow_9",
  ],
  "upgrades-meadow": [
    "upgrade_meadow_q1", "upgrade_meadow_q2", "upgrade_meadow_q3",
    "upgrade_meadow_q4", "upgrade_meadow_5", "upgrade_meadow_6",
    "upgrade_meadow_7", "upgrade_meadow_8", "upgrade_meadow_harbor",
  ],
  "upgrades-lagoon": [
    "upgrade_lagoon_q1", "upgrade_lagoon_q2", "upgrade_lagoon_q3",
    "upgrade_lagoon_q4", "upgrade_lagoon_5", "upgrade_lagoon_6",
    "upgrade_lagoon_7", "upgrade_lagoon_8", "upgrade_lagoon_harbor",
  ],
  "upgrades-snack": [
    "upgrade_snack_q1", "upgrade_snack_q2", "upgrade_snack_q3",
    "upgrade_snack_q4", "upgrade_snack_5", "upgrade_snack_6",
    "upgrade_snack_7", "upgrade_snack_8", "upgrade_snack_harbor",
  ],
  "upgrades-retro": [
    "upgrade_retro_q1", "upgrade_retro_q2", "upgrade_retro_q3",
    "upgrade_retro_q4", "upgrade_retro_5", "upgrade_retro_6",
    "upgrade_retro_7", "upgrade_retro_8", "upgrade_retro_harbor",
  ],
  "upgrades-hollow": [
    "upgrade_hollow_q1", "upgrade_hollow_q2", "upgrade_hollow_q3",
    "upgrade_hollow_q4", "upgrade_hollow_5", "upgrade_hollow_6",
    "upgrade_hollow_7", "upgrade_hollow_8", "upgrade_hollow_harbor",
  ],
  "upgrades-meadow-tier3": [
    "upgrade_meadow_t3_1", "upgrade_meadow_t3_2", "upgrade_meadow_t3_3",
    "upgrade_meadow_t3_4", "upgrade_meadow_t3_5", "upgrade_meadow_t3_6",
    "upgrade_meadow_t3_7", "upgrade_meadow_t3_8", "upgrade_meadow_t3_harbor",
  ],
  "upgrades-lagoon-tier3": [
    "upgrade_lagoon_t3_1", "upgrade_lagoon_t3_2", "upgrade_lagoon_t3_3",
    "upgrade_lagoon_t3_4", "upgrade_lagoon_t3_5", "upgrade_lagoon_t3_6",
    "upgrade_lagoon_t3_7", "upgrade_lagoon_t3_8", "upgrade_lagoon_t3_harbor",
  ],
  "upgrades-snack-tier3": [
    "upgrade_snack_t3_1", "upgrade_snack_t3_2", "upgrade_snack_t3_3",
    "upgrade_snack_t3_4", "upgrade_snack_t3_5", "upgrade_snack_t3_6",
    "upgrade_snack_t3_7", "upgrade_snack_t3_8", "upgrade_snack_t3_harbor",
  ],
  "upgrades-retro-tier3": [
    "upgrade_retro_t3_1", "upgrade_retro_t3_2", "upgrade_retro_t3_3",
    "upgrade_retro_t3_4", "upgrade_retro_t3_5", "upgrade_retro_t3_6",
    "upgrade_retro_t3_7", "upgrade_retro_t3_8", "upgrade_retro_t3_harbor",
  ],
  "upgrades-hollow-tier3": [
    "upgrade_hollow_t3_1", "upgrade_hollow_t3_2", "upgrade_hollow_t3_3",
    "upgrade_hollow_t3_4", "upgrade_hollow_t3_5", "upgrade_hollow_t3_6",
    "upgrade_hollow_t3_7", "upgrade_hollow_t3_8", "upgrade_hollow_t3_harbor",
  ],
  "crops-sheet": [
    "crop_radish_1", "crop_radish_2", "crop_radish_3",
    "crop_corn_1", "crop_corn_2", "crop_corn_3",
    "crop_pumpkin_1", "crop_pumpkin_2", "crop_pumpkin_3",
  ],
  "crops-tier2": [
    "crop_pineapple_1", "crop_pineapple_2", "crop_pineapple_3",
    "crop_strawberry_1", "crop_strawberry_2", "crop_strawberry_3",
    "crop_melon_1", "crop_melon_2", "crop_melon_3",
  ],
  "crops-tier3": [
    "crop_starfruit_1", "crop_starfruit_2", "crop_starfruit_3",
    "crop_moonberry_1", "crop_moonberry_2", "crop_moonberry_3",
    "crop_dragonfruit_1", "crop_dragonfruit_2", "crop_dragonfruit_3",
  ],
  "props-sheet": [
    "prop_wash_tub", "prop_straw_nest", "prop_barn",
    "prop_wood_tree", "prop_berry_bush", "prop_soil_dry",
    "prop_soil_watered", "prop_signpost", "prop_egg_nest",
  ],
  "props-tier2": [
    "prop_t2_stone_bath", "prop_t2_velvet_bed", "prop_t2_stone_barn",
    "prop_t2_cherry_tree", "prop_t2_honey_bush", "prop_t2_raised_dry",
    "prop_t2_raised_watered", "prop_t2_lantern_sign", "prop_t2_golden_egg",
  ],
  "props-tier3": [
    "prop_t3_marble_fountain", "prop_t3_canopy_bed", "prop_t3_guild_barn",
    "prop_t3_spirit_tree", "prop_t3_crystal_bush", "prop_t3_crystal_dry",
    "prop_t3_crystal_watered", "prop_t3_royal_sign", "prop_t3_dragon_egg",
  ],
  "clutter-sheet": [
    "clutter_bench", "clutter_campfire", "clutter_picnic",
    "clutter_fence", "clutter_lantern", "clutter_flowers",
    "clutter_mailbox", "clutter_gift_rowboat", "clutter_leaves",
  ],
  "clutter-tier2": [
    "clutter_t2_oak_bench", "clutter_t2_stone_bonfire", "clutter_t2_picnic",
    "clutter_t2_flower_fence", "clutter_t2_iron_lamp", "clutter_t2_flowerbed",
    "clutter_t2_birdhouse", "clutter_t2_sailboat", "clutter_t2_glow_leaves",
  ],
  "clutter-tier3": [
    "clutter_t3_marble_bench", "clutter_t3_brazier", "clutter_t3_pavilion",
    "clutter_t3_balustrade", "clutter_t3_crystal_lantern", "clutter_t3_fairy_garden",
    "clutter_t3_owl_post", "clutter_t3_clipper", "clutter_t3_star_leaves",
  ],
};

const BACKDROP_MAP = {
  meadow: { day: "backdrop-meadow", night: "backdrop-meadow-night" },
  lagoon: { day: "backdrop-lagoon", night: "backdrop-lagoon-night" },
  snack: { day: "backdrop-snack", night: "backdrop-snack-night" },
  retro: { day: "backdrop-retro-day", night: "backdrop-retro" },
  hollow: { day: "backdrop-hollow-day", night: "backdrop-hollow" },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function listWorldFiles() {
  return fs.readdirSync(worldDir).filter((n) => {
    const p = path.join(worldDir, n);
    return fs.statSync(p).isFile();
  });
}

/** Resolve a world file by stem prefix (handles .png.jpg, .png.png, case). */
function resolveWorldFile(stem) {
  const files = listWorldFiles();
  const lower = stem.toLowerCase();
  const exact = files.find((f) => {
    const base = f.toLowerCase();
    return base === lower || base.startsWith(lower + ".");
  });
  if (exact) return path.join(worldDir, exact);

  // Island names: Meadow.png etc.
  const island = files.find((f) => f.toLowerCase().startsWith(lower + "."));
  if (island) return path.join(worldDir, island);

  throw new Error(`World file not found for stem: ${stem}`);
}

function rgbDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isNearBlack(r, g, b, max = BLACK_BG_MAX) {
  return r <= max && g <= max && b <= max;
}

/**
 * Outer-border 4-connected BFS flood-fill → set alpha=0 on background.
 * Mutates raw RGBA buffer. Returns mask of flooded pixels (Uint8Array 0/1).
 * When the corner seed is pure black, uses a tight RGB<=14 channel test so
 * dark charcoal outlines (crow, black-cat, etc.) are never eaten away.
 */
function floodFillOuterBg(data, width, height, tolerance = FLOOD_TOLERANCE) {
  const channels = 4;
  const n = width * height;
  const mask = new Uint8Array(n);
  const visited = new Uint8Array(n);

  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + (width - 1)) * channels,
  ];
  let avgA = 0;
  for (const i of corners) avgA += data[i + 3];
  avgA /= 4;
  if (avgA < 10) {
    // Already transparent — nothing to fill
    return { mask, blackSeed: false };
  }

  // Seed color from average of opaque corners
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  for (const i of corners) {
    if (data[i + 3] > 200) {
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
      count += 1;
    }
  }
  if (count === 0) return { mask, blackSeed: false };
  sr = Math.round(sr / count);
  sg = Math.round(sg / count);
  sb = Math.round(sb / count);

  const blackSeed = isNearBlack(sr, sg, sb, 20);
  const matchesBg = (r, g, b) =>
    blackSeed
      ? isNearBlack(r, g, b, BLACK_BG_MAX)
      : rgbDist(r, g, b, sr, sg, sb) <= tolerance;

  const queue = [];
  const trySeed = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (matchesBg(data[i], data[i + 1], data[i + 2])) {
      visited[idx] = 1;
      queue.push(idx);
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    mask[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nidx = ny * width + nx;
      if (visited[nidx]) continue;
      const i = nidx * channels;
      if (matchesBg(data[i], data[i + 1], data[i + 2])) {
        visited[nidx] = 1;
        queue.push(nidx);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (mask[i]) data[i * channels + 3] = 0;
  }
  return { mask, blackSeed };
}

/**
 * Soft feather along flood boundary.
 * Black pet BGs use a tight 1px feather; other sheets keep ~1.5px.
 */
function featherBoundary(data, width, height, mask, softPx = 1.5) {
  const channels = 4;
  const radius = Math.ceil(softPx);
  const out = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx]) continue;
      let near = false;
      let minD = 99;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) {
            near = true;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minD) minD = d;
          }
        }
      }
      if (near && minD <= softPx) {
        const i = idx * channels;
        const factor = Math.max(0, Math.min(1, (minD - 0.2) / Math.max(0.5, softPx)));
        out[i + 3] = Math.round(out[i + 3] * factor);
      }
    }
  }
  out.copy(data);
}

function contentBBox(data, width, height, threshold = ALPHA_CONTENT) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function loadRgba(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), width: info.width, height: info.height };
}

async function saveRgbaPng(data, width, height, outPath) {
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath);
}

async function processIsland(id) {
  const files = listWorldFiles();
  // Prefer new land-<id>.* oval sprites over legacy Meadow.png / Lagoon.jpg etc.
  const match =
    files.find((f) => f.toLowerCase().startsWith(`land-${id}.`)) ||
    files.find((f) => f.toLowerCase().startsWith(id.toLowerCase() + "."));
  if (!match) throw new Error(`Island not found: ${id}`);
  const file = path.join(worldDir, match);

  const { data, width, height } = await loadRgba(file);

  // Only flood opaque backgrounds; already-transparent oval lands keep orbiting islets
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let avgA = 0;
  for (const i of corners) avgA += data[i + 3];
  avgA /= 4;
  if (avgA > 200) {
    const { mask, blackSeed } = floodFillOuterBg(data, width, height);
    featherBoundary(data, width, height, mask, blackSeed ? 1 : 1.5);
  }

  const bbox = contentBBox(data, width, height);
  if (!bbox) throw new Error(`Island empty after fill: ${id}`);

  // Generous pad so rim islets / waterfall sprays aren't over-cropped
  const pad = Math.max(TRIM_MARGIN, 48);
  const left = Math.max(0, bbox.left - pad);
  const top = Math.max(0, bbox.top - pad);
  const right = Math.min(width, bbox.left + bbox.width + pad);
  const bottom = Math.min(height, bbox.top + bbox.height + pad);
  const tw = right - left;
  const th = bottom - top;

  const cropped = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const srcStart = ((top + y) * width + left) * 4;
    data.copy(cropped, y * tw * 4, srcStart, srcStart + tw * 4);
  }

  const tmp = path.join(outLands, `.tmp-${id}.png`);
  await saveRgbaPng(cropped, tw, th, tmp);
  const meta = await sharp(tmp).metadata();
  // Cap longest edge at LAND_MAX_W while preserving true 1:1 aspect
  const scale = Math.min(1, LAND_MAX_W / Math.max(meta.width, meta.height));
  const outW = Math.round(meta.width * scale);
  const outH = Math.round(meta.height * scale);
  const outName = `land-${id}.png`;
  const outPath = path.join(outLands, outName);
  await sharp(tmp).resize(outW, outH, { kernel: sharp.kernel.lanczos3 }).png().toFile(outPath);
  fs.unlinkSync(tmp);

  const finalMeta = await sharp(outPath).metadata();
  return {
    src: `/assets-built/lands/${outName}`,
    w: finalMeta.width,
    h: finalMeta.height,
  };
}

async function processBackdrops() {
  /** @type {Record<string, { day: string, night: string }>} */
  const result = {};
  for (const id of ISLAND_IDS) {
    const map = BACKDROP_MAP[id];
    const daySrc = resolveWorldFile(map.day);
    const nightSrc = resolveWorldFile(map.night);
    const dayOut = `backdrop-${id}-day.png`;
    const nightOut = `backdrop-${id}-night.png`;
    // Keep fully opaque — never flood-fill skies
    await sharp(daySrc).flatten({ background: "#000000" }).png().toFile(path.join(outBackdrops, dayOut));
    await sharp(nightSrc).flatten({ background: "#000000" }).png().toFile(path.join(outBackdrops, nightOut));
    result[id] = {
      day: `/assets-built/backdrops/${dayOut}`,
      night: `/assets-built/backdrops/${nightOut}`,
    };
  }
  return result;
}

async function extractCell(data, width, height, col, row, cellW, cellH) {
  const left = col * cellW;
  const top = row * cellH;
  const out = Buffer.alloc(cellW * cellH * 4);
  for (let y = 0; y < cellH; y++) {
    const srcStart = ((top + y) * width + left) * 4;
    data.copy(out, y * cellW * 4, srcStart, srcStart + cellW * 4);
  }
  return { data: out, width: cellW, height: cellH };
}

async function processSheetCell(cellData, cellW, cellH) {
  // Check if already transparent
  const corners = [
    0,
    (cellW - 1) * 4,
    (cellH - 1) * cellW * 4,
    ((cellH - 1) * cellW + (cellW - 1)) * 4,
  ];
  let avgA = 0;
  for (const i of corners) avgA += cellData[i + 3];
  avgA /= 4;

  if (avgA > 240) {
    const { mask, blackSeed } = floodFillOuterBg(cellData, cellW, cellH);
    featherBoundary(cellData, cellW, cellH, mask, blackSeed ? 1 : 1.5);
  }

  const bbox = contentBBox(cellData, cellW, cellH);
  if (!bbox) {
    return sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
  }

  const extracted = await sharp(cellData, {
    raw: { width: cellW, height: cellH, channels: 4 },
  })
    .extract(bbox)
    .png()
    .toBuffer();
  return extracted;
}

async function processWorldSheets() {
  /** @type {Record<string, { src: string, w: number, h: number }>} */
  const worldSprites = {};
  const worldIndex = {
    buildings: {
      tier1: { shared: [...SHEET_FRAME_IDS["buildings-sheet"]], themes: {} },
      tier2: {},
      tier3: {},
    },
    crops: {
      tier1: [...SHEET_FRAME_IDS["crops-sheet"]],
      tier2: [...SHEET_FRAME_IDS["crops-tier2"]],
      tier3: [...SHEET_FRAME_IDS["crops-tier3"]],
    },
    props: {
      tier1: [...SHEET_FRAME_IDS["props-sheet"]],
      tier2: [...SHEET_FRAME_IDS["props-tier2"]],
      tier3: [...SHEET_FRAME_IDS["props-tier3"]],
    },
    clutter: {
      tier1: [...SHEET_FRAME_IDS["clutter-sheet"]],
      tier2: [...SHEET_FRAME_IDS["clutter-tier2"]],
      tier3: [...SHEET_FRAME_IDS["clutter-tier3"]],
    },
  };

  for (const island of ["lagoon", "snack", "retro", "hollow"]) {
    worldIndex.buildings.tier1.themes[island] = [...SHEET_FRAME_IDS[`theme-${island}`]];
  }
  for (const island of ISLAND_IDS) {
    worldIndex.buildings.tier2[island] = [...SHEET_FRAME_IDS[`upgrades-${island}`]];
    worldIndex.buildings.tier3[island] = [...SHEET_FRAME_IDS[`upgrades-${island}-tier3`]];
  }

  for (const [stem, ids] of Object.entries(SHEET_FRAME_IDS)) {
    const file = resolveWorldFile(stem);
    process.stdout.write(`  sheet ${stem} … `);
    const { data, width, height } = await loadRgba(file);
    const cellW = Math.floor(width / 3);
    const cellH = Math.floor(height / 3);

    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cell = await extractCell(data, width, height, col, row, cellW, cellH);
      const pngBuf = await processSheetCell(cell.data, cell.width, cell.height);
      const id = ids[i];
      const outPath = path.join(outWorld, `${id}.png`);
      await sharp(pngBuf).png().toFile(outPath);
      const meta = await sharp(outPath).metadata();
      worldSprites[id] = {
        src: `/assets-built/world/${id}.png`,
        w: meta.width,
        h: meta.height,
      };
    }
    console.log("ok");
  }

  return { worldSprites, worldIndex };
}

async function placeInFrame(spriteBuf) {
  const meta = await sharp(spriteBuf).metadata();
  let w = meta.width;
  let h = meta.height;
  let pipeline = sharp(spriteBuf).ensureAlpha();
  if (w > FRAME - BOTTOM_PAD || h > FRAME - BOTTOM_PAD) {
    const max = FRAME - BOTTOM_PAD;
    const scale = Math.min(max / w, max / h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    pipeline = pipeline.resize(w, h, { fit: "inside", kernel: sharp.kernel.lanczos3 });
  }
  const resized = await pipeline.png().toBuffer();
  const rm = await sharp(resized).metadata();
  w = rm.width;
  h = rm.height;
  const left = Math.round((FRAME - w) / 2);
  const top = FRAME - BOTTOM_PAD - h;
  return sharp({
    create: {
      width: FRAME,
      height: FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

async function processRascal(id) {
  const folder = path.join(petsDir, id);
  const files = fs.readdirSync(folder);
  const iconFile = files.find((f) => /^icon\./i.test(f));
  const sheets = ["sheet1.png", "sheet2.png", "sheet3.png"]
    .map((n) => files.find((f) => f.toLowerCase() === n))
    .filter(Boolean);

  const outDir = path.join(outRascals, id);
  ensureDir(outDir);

  const entry = {
    id,
    name: titleFromId(id),
    icon: null,
    atlas: null,
    frameSize: FRAME,
    poseCount: 0,
  };

  if (iconFile) {
    const iconOut = path.join(outDir, "icon.png");
    await sharp(path.join(folder, iconFile))
      .ensureAlpha()
      .resize(256, 256, { fit: "inside", withoutEnlargement: false })
      .png()
      .toFile(iconOut);
    entry.icon = `/assets-built/rascals/${id}/icon.png`;
  }

  if (sheets.length < 3) {
    return { entry, warning: `only ${sheets.length}/3 sheets` };
  }

  const frames = [];
  for (const sheetName of sheets) {
    const { data, width, height } = await loadRgba(path.join(folder, sheetName));
    const cellW = Math.floor(width / 3);
    const cellH = Math.floor(height / 3);
    for (let i = 0; i < 9; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cell = await extractCell(data, width, height, col, row, cellW, cellH);
      // Remove pure-black sheet backgrounds; tight RGB<=14 keeps dark outlines
      const corners = [
        0,
        (cell.width - 1) * 4,
        (cell.height - 1) * cell.width * 4,
        ((cell.height - 1) * cell.width + (cell.width - 1)) * 4,
      ];
      let avgA = 0;
      for (const ci of corners) avgA += cell.data[ci + 3];
      avgA /= 4;
      if (avgA > 200) {
        const { mask, blackSeed } = floodFillOuterBg(cell.data, cell.width, cell.height);
        featherBoundary(cell.data, cell.width, cell.height, mask, blackSeed ? 1 : 1.5);
      }
      const bbox = contentBBox(cell.data, cell.width, cell.height);
      let spriteBuf;
      if (!bbox) {
        spriteBuf = await sharp({
          create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .png()
          .toBuffer();
      } else {
        spriteBuf = await sharp(cell.data, {
          raw: { width: cell.width, height: cell.height, channels: 4 },
        })
          .extract(bbox)
          .png()
          .toBuffer();
      }
      frames.push(await placeInFrame(spriteBuf));
    }
  }

  const composites = frames.map((buf, i) => ({
    input: buf,
    left: (i % ATLAS_COLS) * FRAME,
    top: Math.floor(i / ATLAS_COLS) * FRAME,
  }));

  const atlasPath = path.join(outDir, "atlas.png");
  await sharp({
    create: {
      width: ATLAS_COLS * FRAME,
      height: ATLAS_ROWS * FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(atlasPath);

  entry.atlas = `/assets-built/rascals/${id}/atlas.png`;
  entry.poseCount = frames.length;
  return { entry };
}

async function main() {
  console.log("Tiny Rascals — build-assets\n");
  for (const d of [outLands, outBackdrops, outWorld, outRascals, path.dirname(manifestPath)]) {
    ensureDir(d);
  }

  console.log("Islands…");
  const lands = {};
  for (const id of ISLAND_IDS) {
    process.stdout.write(`  ${id} … `);
    lands[id] = await processIsland(id);
    console.log(`${lands[id].w}x${lands[id].h}`);
  }

  console.log("Backdrops…");
  const backdrops = await processBackdrops();
  console.log(`  ${ISLAND_IDS.length * 2} day/night skies`);

  console.log("World sheets…");
  const { worldSprites, worldIndex } = await processWorldSheets();
  console.log(`  ${Object.keys(worldSprites).length} sprites`);

  console.log("Rascals…");
  const petFolders = fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log(`  ${petFolders.length} pet folders`);
  const rascals = [];
  const warnings = [];
  for (const id of petFolders) {
    process.stdout.write(`  ${id} … `);
    try {
      const { entry, warning } = await processRascal(id);
      rascals.push(entry);
      if (warning) {
        warnings.push(`${id}: ${warning}`);
        console.log(`ok (${warning})`);
      } else {
        console.log("ok");
      }
    } catch (err) {
      warnings.push(`${id}: ${err.message}`);
      console.log(`FAIL ${err.message}`);
      rascals.push({
        id,
        name: titleFromId(id),
        icon: null,
        atlas: null,
        frameSize: FRAME,
        poseCount: 0,
      });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    lands,
    backdrops,
    world: worldIndex,
    worldSprites,
    rascals,
    poseNames: POSE_NAMES,
    counts: {
      lands: Object.keys(lands).length,
      backdrops: ISLAND_IDS.length * 2,
      worldSprites: Object.keys(worldSprites).length,
      rascals: rascals.length,
      rascalsWithAtlas: rascals.filter((r) => r.atlas).length,
    },
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("\nDone.");
  console.log(`  lands:         ${manifest.counts.lands}`);
  console.log(`  backdrops:     ${manifest.counts.backdrops}`);
  console.log(`  worldSprites:  ${manifest.counts.worldSprites}`);
  console.log(`  rascals:       ${manifest.counts.rascals} (${manifest.counts.rascalsWithAtlas} with atlas)`);
  console.log(`  manifest → ${path.relative(root, manifestPath)}`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
