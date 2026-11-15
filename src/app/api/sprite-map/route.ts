import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { SHEET_ACTIONS } from "@/game/poses";

export const runtime = "nodejs";

const MAP_PATH = path.join(process.cwd(), "src", "data", "sprite-map.json");

type CellRC = [number, number];
type PetSheetMap = Partial<Record<"1" | "2" | "3", Partial<Record<string, CellRC>>>>;
type SpriteMapFile = {
  version: number;
  sheetActions: Record<"1" | "2" | "3", string[]>;
  pets: Record<string, PetSheetMap>;
};

function readMap(): SpriteMapFile {
  const raw = fs.readFileSync(MAP_PATH, "utf8");
  return JSON.parse(raw) as SpriteMapFile;
}

function writeMap(map: SpriteMapFile) {
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
}

export async function GET() {
  try {
    return NextResponse.json(readMap());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read sprite-map";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Persist per-pet [row,col] action tags into sprite-map.json.
 * Never touches public/pets or any image files.
 *
 * Body shapes:
 * - Full replace: { version, sheetActions, pets }
 * - Assign one cell: { petId, sheet, action, row, col }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    if (body.pets && typeof body.pets === "object") {
      const next: SpriteMapFile = {
        version: typeof body.version === "number" ? body.version : 1,
        sheetActions: (body.sheetActions as SpriteMapFile["sheetActions"]) ?? {
          "1": [...SHEET_ACTIONS["1"]],
          "2": [...SHEET_ACTIONS["2"]],
          "3": [...SHEET_ACTIONS["3"]],
        },
        pets: body.pets as SpriteMapFile["pets"],
      };
      writeMap(next);
      return NextResponse.json({ ok: true, map: next });
    }

    const petId = String(body.petId ?? "");
    const sheet = String(body.sheet ?? "") as "1" | "2" | "3";
    const action = String(body.action ?? "");
    const row = Number(body.row);
    const col = Number(body.col);

    if (!petId || !["1", "2", "3"].includes(sheet) || !action) {
      return NextResponse.json(
        { error: "petId, sheet (1|2|3), and action are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(row) || !Number.isFinite(col) || row < 0 || row > 2 || col < 0 || col > 2) {
      return NextResponse.json({ error: "row and col must be 0..2" }, { status: 400 });
    }

    const map = readMap();
    if (!map.pets[petId]) map.pets[petId] = {};
    if (!map.pets[petId][sheet]) map.pets[petId][sheet] = {};
    map.pets[petId][sheet]![action] = [row | 0, col | 0];
    writeMap(map);
    return NextResponse.json({ ok: true, map });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write sprite-map";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
