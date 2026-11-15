import spriteMapJson from "@/data/sprite-map.json";
import { SHEET_ACTIONS, poseToSheetAction } from "./poses";

export type CellRC = [number, number]; // [row, col] 0..2

type PetSheetMap = Partial<Record<"1" | "2" | "3", Partial<Record<string, CellRC>>>>;

type SpriteMapFile = {
  version: number;
  sheetActions: Record<"1" | "2" | "3", string[]>;
  pets: Record<string, PetSheetMap>;
};

let liveMap: SpriteMapFile = spriteMapJson as SpriteMapFile;

/** Allow calibrator / HMR to refresh the in-memory map. */
export function setSpriteMap(next: SpriteMapFile) {
  liveMap = next;
}

export function getSpriteMap(): SpriteMapFile {
  return liveMap;
}

function defaultCell(cellIndex: number): CellRC {
  return [Math.floor(cellIndex / 3), cellIndex % 3];
}

/** Resolve [row, col] for a pet action on a given sheet. */
export function cellForAction(
  petId: string,
  sheet: "1" | "2" | "3",
  action: string
): CellRC {
  const mapped = liveMap.pets[petId]?.[sheet]?.[action];
  if (mapped && mapped.length === 2) {
    return [
      Math.max(0, Math.min(2, mapped[0] | 0)),
      Math.max(0, Math.min(2, mapped[1] | 0)),
    ];
  }
  const actions = liveMap.sheetActions?.[sheet] ?? SHEET_ACTIONS[sheet];
  const idx = actions.indexOf(action);
  return defaultCell(idx >= 0 ? idx : 0);
}

/** Resolve sheet + cell for a logical pose index (0–26). */
export function resolvePoseCell(
  petId: string,
  pose: number
): { sheet: "1" | "2" | "3"; row: number; col: number; action: string } {
  const { sheet, action, cellIndex } = poseToSheetAction(pose);
  const [row, col] = cellForAction(petId, sheet, action);
  return { sheet, row, col, action: action || SHEET_ACTIONS[sheet][cellIndex] };
}

export function defaultPetSheetMap(): PetSheetMap {
  const out: PetSheetMap = {};
  for (const sheet of ["1", "2", "3"] as const) {
    const actions = SHEET_ACTIONS[sheet];
    const m: Record<string, CellRC> = {};
    actions.forEach((action, i) => {
      m[action] = defaultCell(i);
    });
    out[sheet] = m;
  }
  return out;
}
