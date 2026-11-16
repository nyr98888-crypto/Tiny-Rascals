export type IslandId =
  | "meadow"
  | "lagoon"
  | "snack"
  | "retro"
  | "hollow"
  | "shore";

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
  /** a4 Tokens/Stone */
  tokens: number;
  gems: number;
  /** a6 Shore shells */
  shells: number;
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
  /** v9: continuous 3×2 ranch + shore plot; spawned x/y are global UV. */
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  activeIsland: IslandId;
  dayNight: number;
  manualNight: boolean | null;
  resources: Resources;
  islands: Record<IslandId, IslandProgress>;
  discovered: string[];
  /** Positions are global UV (0–1 across the full 3×2 ranch). */
  spawned: Record<IslandId, { petId: string; x: number; y: number; xp: number; level: number }[]>;
  /** @deprecated migrated into layoutOverrides */
  clutterOffsets?: Record<string, Vec2>;
  /** Per-plot custom entity positions (decorate mode). Stored as global UV. */
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

/** Bottom plot bar order (matches 3×2 left→right, top→bottom). */
export const ISLAND_ORDER: IslandId[] = [
  "retro",
  "lagoon",
  "meadow",
  "snack",
  "hollow",
  "shore",
];

export const ISLAND_LABELS: Record<IslandId, string> = {
  retro: "Ruins",
  lagoon: "Lagoon",
  meadow: "Meadow",
  snack: "Orchard",
  hollow: "Hollow",
  shore: "Shore",
};
