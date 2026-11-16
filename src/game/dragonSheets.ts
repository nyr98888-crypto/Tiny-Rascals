/** 3×3 sheet frame indices are 0-based (F1 → 0). */

export type DragonAnim =
  | "idle"
  | "waddle"
  | "hop"
  | "walk"
  | "run"
  | "carryWalk"
  | "drag"
  | "placeWave"
  | "pet"
  | "eat"
  | "sleep"
  | "idleMood"
  | "chop"
  | "mine"
  | "dig"
  | "farm"
  | "cookGather"
  | "cook";

export type SheetId =
  | "move"
  | "carry"
  | "pickup"
  | "moods"
  | "idleHop"
  | "chop"
  | "mine"
  | "dig"
  | "farm"
  | "cook";

export const SHEET_SRC: Record<SheetId, string> = {
  move: "/pets/dragon_blue/dragon_move.png",
  carry: "/pets/dragon_blue/dragon_carry_emotions.png",
  pickup: "/pets/dragon_blue/dragon_pickup_front.png",
  moods: "/pets/dragon_blue/dragon_base_moods.png",
  idleHop: "/pets/dragon_blue/dragon_idle_hop.png",
  chop: "/pets/dragon_blue/dragon_chop.png",
  mine: "/pets/dragon_blue/dragon_mine.png",
  dig: "/pets/dragon_blue/dragon_dig.png",
  farm: "/pets/dragon_blue/dragon_farm.png",
  cook: "/pets/dragon_blue/dragon_food_cook.png",
};

export type AnimClip = {
  sheet: SheetId;
  /** Inclusive frame indices (0-based). */
  frames: number[];
  fps: number;
  loop: boolean;
  /**
   * Native art facing: "right" means scaleX=1 when moving right.
   * Carry sheet faces LEFT natively → invert flip rules.
   */
  nativeFacing: "right" | "left" | "front";
};

export const CLIPS: Record<DragonAnim, AnimClip> = {
  idle: { sheet: "pickup", frames: [0, 1, 2], fps: 3.2, loop: true, nativeFacing: "front" },
  waddle: { sheet: "pickup", frames: [3, 4, 5], fps: 6, loop: true, nativeFacing: "front" },
  hop: { sheet: "pickup", frames: [6, 7, 8], fps: 8, loop: false, nativeFacing: "front" },
  walk: { sheet: "move", frames: [3, 4, 5], fps: 8, loop: true, nativeFacing: "right" },
  run: { sheet: "move", frames: [6, 7, 8], fps: 11, loop: true, nativeFacing: "right" },
  carryWalk: { sheet: "carry", frames: [0, 1, 2], fps: 8, loop: true, nativeFacing: "left" },
  drag: { sheet: "moods", frames: [3, 4], fps: 6, loop: true, nativeFacing: "front" },
  placeWave: { sheet: "moods", frames: [5], fps: 1.5, loop: false, nativeFacing: "front" },
  pet: { sheet: "moods", frames: [6], fps: 1.2, loop: false, nativeFacing: "front" },
  eat: { sheet: "moods", frames: [7], fps: 1.2, loop: false, nativeFacing: "front" },
  sleep: { sheet: "moods", frames: [8], fps: 1, loop: true, nativeFacing: "front" },
  idleMood: {
    sheet: "idleHop",
    frames: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    fps: 5,
    loop: false,
    nativeFacing: "front",
  },
  chop: { sheet: "chop", frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], fps: 9, loop: true, nativeFacing: "front" },
  mine: { sheet: "mine", frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], fps: 9, loop: true, nativeFacing: "front" },
  dig: { sheet: "dig", frames: [0, 1, 2, 3, 4, 5, 6, 7, 8], fps: 9, loop: true, nativeFacing: "front" },
  farm: { sheet: "farm", frames: [3, 4, 5, 6, 7], fps: 7, loop: true, nativeFacing: "front" },
  cookGather: { sheet: "cook", frames: [0, 1, 2], fps: 6, loop: true, nativeFacing: "front" },
  cook: { sheet: "cook", frames: [3, 4, 5, 6, 7, 8], fps: 7, loop: true, nativeFacing: "front" },
};

/** Farm planting intro before the F4–F8 loop. */
export const FARM_INTRO: AnimClip = {
  sheet: "farm",
  frames: [0, 1, 2],
  fps: 6,
  loop: false,
  nativeFacing: "front",
};

export function facingScaleX(
  nativeFacing: AnimClip["nativeFacing"],
  movingRight: boolean
): number {
  if (nativeFacing === "front") return 1;
  if (nativeFacing === "right") return movingRight ? 1 : -1;
  // native faces LEFT
  return movingRight ? -1 : 1;
}
