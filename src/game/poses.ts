/**
 * Exact 27-pose template shared by all Rascal atlases.
 * Sheet layout: 3×3 cells per sheet → atlas index = sheet*9 + cell.
 * Draw: col = index % 3, row = floor(index / 3).
 */
export const Pose = {
  // Sheet 1 — Chores & Care (0–8)
  WATERING: 0,
  DIGGING: 1,
  CARRY_BERRIES: 2,
  COOKING: 3,
  SWEEPING: 4,
  CARRY_LOGS: 5,
  BATHING: 6,
  SLEEPING: 7,
  WIPE_SWEAT: 8,

  // Sheet 2 — Movement & Slapstick (9–17)
  WALK_LEFT: 9,
  WALK_FRONT: 10,
  WALK_RIGHT: 11,
  CROUCH: 12,
  JUMP_CHEER: 13,
  HAPPY_DANCE: 14,
  SPRINT_RIGHT: 15,
  TRIP_FALL: 16,
  IDLE: 17,

  // Sheet 3 — Emotes & Eating (18–26)
  CELEBRATE: 18,
  LAUGH: 19,
  EAT_BERRY: 20,
  HEART_EYES: 21,
  SURPRISED: 22,
  SHY: 23,
  GRUMPY: 24,
  DIZZY_STARS: 25,
  WAVE_HELLO: 26,
} as const;

export type PoseId = (typeof Pose)[keyof typeof Pose];

/** Canonical names matching assetManifest.poseNames / build-assets POSE_NAMES. */
export const POSE_NAMES: readonly string[] = [
  "watering",
  "digging",
  "carry_berries",
  "cooking",
  "sweeping",
  "carry_logs",
  "bathing",
  "sleeping",
  "wipe_sweat",
  "walk_left",
  "walk_front",
  "walk_right",
  "crouch",
  "jump_cheer",
  "happy_dance",
  "sprint_right",
  "trip_fall",
  "idle",
  "celebrate",
  "laugh",
  "eat_berry",
  "heart_eyes",
  "surprised",
  "shy",
  "grumpy",
  "dizzy_stars",
  "wave_hello",
];

/** Pick a walk/sprint frame from velocity; sprint uses SPRINT_RIGHT (+ optional flip). */
export function poseFromVelocity(
  vx: number,
  vy: number,
  sprint: boolean
): { pose: PoseId; facing: 1 | -1 } {
  if (sprint) {
    return {
      pose: Pose.SPRINT_RIGHT,
      facing: vx < 0 ? -1 : 1,
    };
  }
  if (Math.abs(vx) >= Math.abs(vy) && Math.abs(vx) > 0.02) {
    if (vx < -0.1) return { pose: Pose.WALK_LEFT, facing: 1 };
    if (vx > 0.1) return { pose: Pose.WALK_RIGHT, facing: 1 };
  }
  if (Math.hypot(vx, vy) > 0.02) {
    return { pose: Pose.WALK_FRONT, facing: vx >= 0 ? 1 : -1 };
  }
  return { pose: Pose.IDLE, facing: 1 };
}
