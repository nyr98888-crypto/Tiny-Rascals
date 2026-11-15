/**
 * Standardized 27-pose template across sheets `1`, `2`, and `3`.
 * Logical index = (sheet-1)*9 + cellIndex (default row-major).
 * Actual cell [row,col] may differ per pet via sprite-map.json.
 */
export const Pose = {
  // Sheet 1 — Working & Care (0–8)
  WATERING: 0,
  DIGGING: 1,
  CARRY_BERRIES: 2,
  COOKING: 3,
  SWEEPING: 4,
  CARRY_LOGS: 5,
  BATHING: 6,
  SLEEPING: 7,
  TIRED: 8,

  // Sheet 2 — Movement & Physics (9–17)
  WALK_LEFT: 9,
  WALK_STEP: 10,
  WALK_RIGHT: 11,
  CROUCH: 12,
  JUMP: 13,
  LAND: 14,
  SPRINT: 15,
  TRIP: 16,
  IDLE_FRONT: 17,

  // Sheet 3 — Emotions (18–26)
  CHEER: 18,
  LAUGH: 19,
  EAT: 20,
  HEART_EYES: 21,
  SURPRISED: 22,
  SMIRK: 23,
  GRUMPY: 24,
  DIZZY: 25,
  WAVE: 26,

  // Back-compat aliases used by older AI call sites
  WIPE_SWEAT: 8,
  WALK_FRONT: 10,
  JUMP_CHEER: 13,
  HAPPY_DANCE: 14,
  SPRINT_RIGHT: 15,
  TRIP_FALL: 16,
  IDLE: 17,
  CELEBRATE: 18,
  EAT_BERRY: 20,
  SHY: 23,
  DIZZY_STARS: 25,
  WAVE_HELLO: 26,
} as const;

export type PoseId = number;

/** Action tags per sheet cell (default row-major 0..8). */
export const SHEET_ACTIONS: Record<"1" | "2" | "3", readonly string[]> = {
  "1": [
    "watering",
    "digging",
    "berries",
    "cooking",
    "sweeping",
    "wood",
    "bathing",
    "sleeping",
    "tired",
  ],
  "2": [
    "walk_left",
    "walk_step",
    "walk_right",
    "crouch",
    "jump",
    "land",
    "sprint",
    "trip",
    "idle_front",
  ],
  "3": [
    "cheer",
    "laugh",
    "eat",
    "heart_eyes",
    "surprised",
    "smirk",
    "grumpy",
    "dizzy",
    "wave",
  ],
};

export const POSE_NAMES: readonly string[] = [
  ...SHEET_ACTIONS["1"],
  ...SHEET_ACTIONS["2"],
  ...SHEET_ACTIONS["3"],
];

export function poseToSheetAction(pose: number): {
  sheet: "1" | "2" | "3";
  action: string;
  cellIndex: number;
} {
  const p = Math.max(0, Math.min(26, pose | 0));
  const sheetNum = (Math.floor(p / 9) + 1) as 1 | 2 | 3;
  const sheet = String(sheetNum) as "1" | "2" | "3";
  const cellIndex = p % 9;
  return { sheet, action: SHEET_ACTIONS[sheet][cellIndex], cellIndex };
}

/** Pick a walk/sprint frame from velocity. */
export function poseFromVelocity(
  vx: number,
  vy: number,
  sprint: boolean
): { pose: PoseId; facing: 1 | -1 } {
  if (sprint) {
    return { pose: Pose.SPRINT, facing: vx < 0 ? -1 : 1 };
  }
  if (Math.abs(vx) >= Math.abs(vy) && Math.abs(vx) > 0.02) {
    if (vx < -0.1) return { pose: Pose.WALK_LEFT, facing: 1 };
    if (vx > 0.1) return { pose: Pose.WALK_RIGHT, facing: 1 };
  }
  if (Math.hypot(vx, vy) > 0.02) {
    return { pose: Pose.WALK_STEP, facing: vx >= 0 ? 1 : -1 };
  }
  return { pose: Pose.IDLE_FRONT, facing: 1 };
}
