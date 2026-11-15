/**
 * Normalize every public/pets/<id>/ folder:
 * - icon.* → icon.png
 * - remaining images → centered 3x3 sheets: sheet1.png, sheet2.png, sheet3.png
 * - rewrite public/pets/manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const petsDir = path.resolve(__dirname, "../public/pets");
const manifestPath = path.join(petsDir, "manifest.json");

const ALPHA_THRESHOLD = 15;
const CELL = 256;
const SPRITE_MAX = 224;
const BOTTOM_PAD = 16;
const SHEET_SIZE = CELL * 3; // 768
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

function isImage(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function publicUrl(...parts) {
  return "/" + ["pets", ...parts].map((p) => encodeURIComponent(p)).join("/");
}

async function findOpaqueBBox(raw, width, height, channels, threshold = ALPHA_THRESHOLD) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = raw[(y * width + x) * channels + (channels - 1)];
      if (a > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function emptyCell() {
  return sharp({
    create: {
      width: CELL,
      height: CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

async function spriteToCell(spriteInput, spriteWidth, spriteHeight) {
  let w = spriteWidth;
  let h = spriteHeight;
  let pipeline = sharp(spriteInput).ensureAlpha();

  if (w > SPRITE_MAX || h > SPRITE_MAX) {
    const scale = Math.min(SPRITE_MAX / w, SPRITE_MAX / h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    pipeline = pipeline.resize(w, h, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    });
  }

  const spriteBuf = await pipeline.png().toBuffer();
  const meta = await sharp(spriteBuf).metadata();
  w = meta.width;
  h = meta.height;

  const left = Math.round((CELL - w) / 2);
  const top = CELL - BOTTOM_PAD - h;

  return sharp({
    create: {
      width: CELL,
      height: CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: spriteBuf, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

async function normalizeSheet(inputPath, outputPath) {
  const image = sharp(inputPath).ensureAlpha();
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error(`Invalid image dimensions: ${inputPath}`);
  }

  const sectorW = Math.floor(width / 3);
  const sectorH = Math.floor(height / 3);
  if (sectorW < 1 || sectorH < 1) {
    throw new Error(`Image too small for 3x3 grid: ${inputPath} (${width}x${height})`);
  }

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  const composites = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const left = col * sectorW;
      const top = row * sectorH;

      // Build a raw sector buffer for bbox scan
      const sectorRaw = Buffer.alloc(sectorW * sectorH * channels);
      for (let y = 0; y < sectorH; y++) {
        const srcStart = ((top + y) * width + left) * channels;
        const dstStart = y * sectorW * channels;
        data.copy(sectorRaw, dstStart, srcStart, srcStart + sectorW * channels);
      }

      const bbox = await findOpaqueBBox(sectorRaw, sectorW, sectorH, channels);
      let cellBuf;

      if (!bbox) {
        cellBuf = await emptyCell();
      } else {
        const spriteBuf = await sharp(inputPath)
          .ensureAlpha()
          .extract({
            left: left + bbox.left,
            top: top + bbox.top,
            width: bbox.width,
            height: bbox.height,
          })
          .png()
          .toBuffer();

        cellBuf = await spriteToCell(spriteBuf, bbox.width, bbox.height);
      }

      composites.push({
        input: cellBuf,
        left: col * CELL,
        top: row * CELL,
      });
    }
  }

  await sharp({
    create: {
      width: SHEET_SIZE,
      height: SHEET_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

function pickIconAndSheets(folderId, files) {
  const images = files.filter(isImage).sort(naturalCompare);
  let icon = images.find((f) => /^icon\./i.test(f)) ?? null;
  let rest = images.filter((f) => f !== icon);

  if (!icon) {
    const byFolderName = images.find(
      (f) => path.parse(f).name.toLowerCase() === folderId.toLowerCase()
    );
    if (byFolderName) {
      icon = byFolderName;
      rest = images.filter((f) => f !== icon);
    }
  }

  if (!icon) {
    const nonGenerated = images.filter(
      (f) => !/^(remove-bg|gpt-image)/i.test(f)
    );
    if (nonGenerated.length === 1) {
      icon = nonGenerated[0];
      rest = images.filter((f) => f !== icon);
    }
  }

  // Prefer the three non-normalized raw sheets; if already normalized, reuse sheetN
  const rawSheets = rest
    .filter((f) => !/^sheet[123]\.png$/i.test(f))
    .sort(naturalCompare);
  const normalizedSheets = ["sheet1.png", "sheet2.png", "sheet3.png"].filter((f) =>
    rest.some((r) => r.toLowerCase() === f)
  );

  let sheets;
  if (rawSheets.length >= 3) {
    sheets = rawSheets.slice(0, 3);
  } else if (normalizedSheets.length === 3 && rawSheets.length === 0) {
    sheets = ["sheet1.png", "sheet2.png", "sheet3.png"];
  } else if (rest.length >= 3) {
    sheets = rest.slice(0, 3);
  } else {
    sheets = rest;
  }

  return { icon, sheets };
}

async function writeAtomic(targetPath, producer) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp.png`
  );
  try {
    await producer(tmp);
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw err;
  }
}

async function normalizeFolder(folderId) {
  const folder = path.join(petsDir, folderId);
  const files = fs.readdirSync(folder);
  const { icon, sheets } = pickIconAndSheets(folderId, files);

  if (!icon) {
    return { ok: false, reason: "no icon.* (or folder-name fallback) found" };
  }
  if (sheets.length !== 3) {
    return {
      ok: false,
      reason: `expected 3 sheet images, found ${sheets.length}`,
    };
  }

  const iconSrc = path.join(folder, icon);
  const sheetSrcs = sheets.map((s) => path.join(folder, s));

  // Write normalized outputs (temp → final)
  await writeAtomic(path.join(folder, "icon.png"), async (tmp) => {
    await sharp(iconSrc).ensureAlpha().png().toFile(tmp);
  });

  for (let i = 0; i < 3; i++) {
    const outName = `sheet${i + 1}.png`;
    await writeAtomic(path.join(folder, outName), async (tmp) => {
      await normalizeSheet(sheetSrcs[i], tmp);
    });
  }

  // Remove every other image so folder is strictly 4 files
  const keep = new Set(["icon.png", "sheet1.png", "sheet2.png", "sheet3.png"]);
  for (const name of fs.readdirSync(folder)) {
    if (!isImage(name)) continue;
    if (keep.has(name)) continue;
    fs.unlinkSync(path.join(folder, name));
  }

  return { ok: true };
}

function writeManifest(ids) {
  const pets = ids.map((id) => ({
    id,
    name: titleFromId(id),
    icon: publicUrl(id, "icon.png"),
    sheets: [
      publicUrl(id, "sheet1.png"),
      publicUrl(id, "sheet2.png"),
      publicUrl(id, "sheet3.png"),
    ],
  }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: pets.length,
    basePath: "/pets",
    pets,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

async function main() {
  if (!fs.existsSync(petsDir)) {
    console.error(`Pets directory not found: ${petsDir}`);
    process.exit(1);
  }

  const folders = fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith("_"))
    .sort(naturalCompare);

  console.log(`Normalizing ${folders.length} pet folder(s)…\n`);

  const okIds = [];
  const failures = [];

  for (const id of folders) {
    const started = Date.now();
    process.stdout.write(`  ${id} … `);
    try {
      const result = await normalizeFolder(id);
      if (!result.ok) {
        console.log(`SKIP (${result.reason})`);
        failures.push({ id, reason: result.reason });
        continue;
      }
      okIds.push(id);
      console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (err) {
      const reason = err?.message ?? String(err);
      console.log(`FAIL (${reason})`);
      failures.push({ id, reason });
    }
  }

  const manifest = writeManifest(okIds);

  console.log(`\nDone. Normalized ${okIds.length}/${folders.length} pets.`);
  console.log(`Manifest → ${path.relative(process.cwd(), manifestPath)} (${manifest.count} entries)`);
  if (failures.length) {
    console.log(`\nSkipped/failed (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
