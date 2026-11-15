/**
 * Scans public/pets/<character-id>/ folders and writes a sprite manifest.
 *
 * Expected layout (after normalize-pets.mjs):
 *   icon.png, sheet1.png, sheet2.png, sheet3.png
 *
 * Ignores underscore-prefixed folders (_UNSORTED, etc.).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const petsDir = path.join(rootDir, "public", "pets");
const outPath = path.join(petsDir, "manifest.json");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const EXPECTED_SHEETS = ["sheet1.png", "sheet2.png", "sheet3.png"];

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function publicUrl(...parts) {
  return "/" + ["pets", ...parts].map((p) => encodeURIComponent(p)).join("/");
}

function buildManifest() {
  if (!fs.existsSync(petsDir)) {
    console.error(`Pets directory not found: ${petsDir}`);
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith("_"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const pets = [];
  const warnings = [];

  for (const id of dirs) {
    const folder = path.join(petsDir, id);
    const files = new Set(
      fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter(isImageFile)
    );

    const iconFile = [...files].find((f) => /^icon\./i.test(f)) ?? null;
    const sheets = EXPECTED_SHEETS.filter((name) => files.has(name));

    // Fallback: any non-icon images if sheetN not present yet
    const fallbackSheets =
      sheets.length === 0
        ? [...files].filter((f) => !/^icon\./i.test(f)).sort()
        : sheets;

    if (!iconFile) warnings.push(`${id}: missing icon.*`);
    if (fallbackSheets.length === 0) warnings.push(`${id}: no sprite sheets`);
    if (sheets.length > 0 && sheets.length < 3) {
      warnings.push(`${id}: expected sheet1–3.png, found ${sheets.length}`);
    }

    pets.push({
      id,
      name: titleFromId(id),
      icon: iconFile ? publicUrl(id, iconFile) : null,
      sheets: fallbackSheets.map((f) => publicUrl(id, f)),
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: pets.length,
    basePath: "/pets",
    pets,
  };

  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Wrote ${pets.length} pet(s) → ${path.relative(rootDir, outPath)}`);
  if (warnings.length) {
    console.log(`\n${warnings.length} note(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

buildManifest();
