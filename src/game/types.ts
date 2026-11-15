export type IslandId = "meadow" | "lagoon" | "snack" | "retro" | "hollow";

export type RascalState =
  | "WANDER_PATH"
  | "CHORE"
  | "HAUL"
  | "USE_PROP"
  | "SOCIAL_EMOTE"
  | "POSE_CHAIN"
  | "TRIP"
  | "HELD";

export type RascalTask =
  | "farm"
  | "bush"
  | "tree"
  | "cook"
  | "sweep"
  | "bath"
  | "sleep"
  | "eat"
  | "social"
  | "click"
  | "trip_recover"
  | "milestone"
  | null;

export type EntityKind = "building" | "prop" | "crop" | "clutter" | "rascal";

export type InteractKind =
  | "tub"
  | "bed"
  | "bench"
  | "campfire"
  | "picnic"
  | "tree"
  | "bush"
  | "soil"
  | "egg"
  | "building"
  | "kitchen"
  | "barn"
  | "clubhouse";

export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  spriteId: string;
  x: number;
  y: number;
  scale: number;
  footY: number;
  movable: boolean;
  interact?: InteractKind;
  cropStage?: number;
  /** Temporarily hide prop (e.g. empty tub while Rascal bathing sprite includes tub). */
  hidden?: boolean;
}

export interface Rascal {
  id: string;
  petId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: RascalState;
  pose: number;
  poseTimer: number;
  facing: 1 | -1;
  target: Vec2 | null;
  /** Remaining road waypoints after `target` (Meadow/Lagoon path graph). */
  pathQueue: Vec2[];
  interactWith: string | null;
  socialWith: string | null;
  task: RascalTask;
  taskStep: number;
  poseChain: number[];
  sprint: boolean;
  shake: number;
  hidePropId: string | null;
  squash: number;
  held: boolean;
  xp: number;
  level: number;
  bounce: number;
}

export interface Resources {
  wood: number;
  berries: number;
  crops: number;
  gems: number;
}

export interface IslandProgress {
  unlocked: boolean;
  buildingTier: 1 | 2 | 3;
  propTier: 1 | 2 | 3;
  cropTier: 1 | 2 | 3;
  clutterTier: 1 | 2 | 3;
  dockRepaired: boolean;
}

export interface GameSave {
  version: 1 | 2 | 3 | 4 | 5 | 6;
  activeIsland: IslandId;
  dayNight: number;
  manualNight: boolean | null;
  resources: Resources;
  islands: Record<IslandId, IslandProgress>;
  discovered: string[];
  spawned: Record<IslandId, { petId: string; x: number; y: number; xp: number; level: number }[]>;
  /** @deprecated migrated into layoutOverrides */
  clutterOffsets?: Record<string, Vec2>;
  /** Per-island custom entity positions (decorate mode). Dock is never stored. */
  layoutOverrides: Record<IslandId, Record<string, Vec2>>;
  lastSeen: number;
  sandboxPreviewAll: boolean;
  muted: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
}

export const ISLAND_ORDER: IslandId[] = ["meadow", "lagoon", "snack", "retro", "hollow"];

export const ISLAND_LABELS: Record<IslandId, string> = {
  meadow: "Meadow",
  lagoon: "Lagoon",
  snack: "Snack",
  retro: "Retro",
  hollow: "Hollow",
};
