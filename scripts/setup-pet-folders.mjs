/**
 * One-time reorganizer for public/pets:
 * - Each *-icon.* → public/pets/<slug>/icon.png
 * - Each *-sheet* → public/pets/_UNSORTED/ (filenames preserved)
 *
 * Leaves unrelated root files untouched. Safe to re-run (skips missing sources).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const petsDir = path.resolve(__dirname, "../public/pets");
const unsortedDir = path.join(petsDir, "_UNSORTED");

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function uniqueDest(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const { dir, name, ext } = path.parse(destPath);
  let n = 2;
  let candidate;
  do {
    candidate = path.join(dir, `${name}__${n}${ext}`);
    n += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function moveFile(src, dest) {
  const finalDest = uniqueDest(dest);
  ensureDir(path.dirname(finalDest));
  fs.renameSync(src, finalDest);
  return finalDest;
}

function main() {
  if (!fs.existsSync(petsDir)) {
    console.error(`Pets directory not found: ${petsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(petsDir, { withFileTypes: true });
  const rootFiles = entries.filter((e) => e.isFile()).map((e) => e.name);

  let iconsMoved = 0;
  let sheetsMoved = 0;
  const createdFolders = new Set();

  // 1) Icons → public/pets/<slug>/icon.png
  for (const name of rootFiles) {
    const match = name.match(/^(.+)-icon(\.[^.]+)$/i);
    if (!match) continue;
    if (!IMAGE_EXT.test(match[2])) continue;

    const slug = match[1];
    const src = path.join(petsDir, name);
    if (!fs.existsSync(src)) continue;

    const folder = path.join(petsDir, slug);
    ensureDir(folder);
    createdFolders.add(slug);

    const dest = path.join(folder, "icon.png");
    const finalDest = moveFile(src, dest);
    iconsMoved += 1;
    console.log(`icon  ${name} → ${path.relative(petsDir, finalDest)}`);
  }

  // Re-read root files after icon moves
  const remaining = fs
    .readdirSync(petsDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);

  // 2) Sheets → public/pets/_UNSORTED/ (keep original filenames)
  ensureDir(unsortedDir);
  for (const name of remaining) {
    // Glob-equivalent of *-sheet* (e.g. armadillo-sheet.png, sprout-sheet 2.png)
    if (!/^.+-sheet/i.test(name)) continue;

    const src = path.join(petsDir, name);
    if (!fs.existsSync(src)) continue;

    const dest = path.join(unsortedDir, name);
    const finalDest = moveFile(src, dest);
    sheetsMoved += 1;
    console.log(`sheet ${name} → _UNSORTED/${path.basename(finalDest)}`);
  }

  console.log("");
  console.log(`Done. Created ${createdFolders.size} character folder(s).`);
  console.log(`Moved ${iconsMoved} icon(s) and ${sheetsMoved} sheet file(s).`);
  console.log(`Sheets are in: ${unsortedDir}`);
  console.log("Drag sheets from _UNSORTED into matching character folders in Explorer.");
}

main();
