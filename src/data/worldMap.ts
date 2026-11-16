/** Scalable, data-driven sky-realm registry. */

export type IslandRole = "hub" | "farm" | "quarry" | "magic" | "harbor";

export type IslandDef = {
  id: string;
  name: string;
  role: IslandRole;
  /** World-space center */
  x: number;
  y: number;
  width: number;
  sprite: string;
  unlocked: boolean;
};

export type BridgeDef = {
  id: string;
  fromIslandId: string;
  toIslandId: string;
  /** Corridor thickness in world px (default 140). */
  width?: number;
};

export const ISLAND_SPRITE = "/world/island_plate.png";
/** Native plate aspect 3168×1344 */
export const ISLAND_ASPECT = 1344 / 3168;

export const DEFAULT_ISLAND_W = 1400;
export const CLIFF_INSET = 35;
export const TILE = 32;
export const WORLD_PAD = 480; // sky margin around outermost islands

export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 1.4;
export const DEFAULT_ZOOM = 0.62;
export const DRAGON_SIZE = 120;
export const EDGE_SCROLL_PX = 24;
export const EDGE_SCROLL_SPEED = 900;

/** Mutable registry — unlocks mutate `unlocked` in place. */
export const ISLANDS: IslandDef[] = [
  {
    id: "farm",
    name: "Farm Meadow",
    role: "farm",
    x: 900,
    y: 1100,
    width: DEFAULT_ISLAND_W,
    sprite: ISLAND_SPRITE,
    unlocked: true,
  },
  {
    id: "hub",
    name: "Sanctuary Hub",
    role: "hub",
    x: 2600,
    y: 1100,
    width: DEFAULT_ISLAND_W,
    sprite: ISLAND_SPRITE,
    unlocked: true,
  },
  {
    id: "quarry",
    name: "Crystal Quarry",
    role: "quarry",
    x: 4300,
    y: 1100,
    width: DEFAULT_ISLAND_W,
    sprite: ISLAND_SPRITE,
    unlocked: true,
  },
  {
    id: "arcane",
    name: "Arcane Peak",
    role: "magic",
    x: 2600,
    y: 200,
    width: 1200,
    sprite: ISLAND_SPRITE,
    unlocked: false,
  },
  {
    id: "harbor",
    name: "South Harbor",
    role: "harbor",
    x: 2600,
    y: 2050,
    width: 1200,
    sprite: ISLAND_SPRITE,
    unlocked: false,
  },
];

export const BRIDGES: BridgeDef[] = [
  { id: "bridge-farm-hub", fromIslandId: "farm", toIslandId: "hub", width: 140 },
  { id: "bridge-hub-quarry", fromIslandId: "hub", toIslandId: "quarry", width: 140 },
  { id: "bridge-hub-arcane", fromIslandId: "hub", toIslandId: "arcane", width: 130 },
  { id: "bridge-hub-harbor", fromIslandId: "hub", toIslandId: "harbor", width: 130 },
];

export function islandHeight(island: IslandDef) {
  return Math.round(island.width * ISLAND_ASPECT);
}

export function getIsland(id: string) {
  return ISLANDS.find((i) => i.id === id) ?? null;
}

export function unlockedIslands() {
  return ISLANDS.filter((i) => i.unlocked);
}

export function unlockedBridges() {
  return BRIDGES.filter((b) => {
    const a = getIsland(b.fromIslandId);
    const c = getIsland(b.toIslandId);
    return !!(a?.unlocked && c?.unlocked);
  });
}

export function islandRect(island: IslandDef) {
  const h = islandHeight(island);
  return {
    left: island.x - island.width / 2,
    top: island.y - h / 2,
    width: island.width,
    height: h,
  };
}

/** Grass plateau ellipse inset from cliff rim. */
export function islandWalkEllipse(island: IslandDef) {
  const h = islandHeight(island);
  return {
    cx: island.x,
    cy: island.y - h * 0.06,
    rx: island.width / 2 - CLIFF_INSET,
    ry: h * 0.34,
  };
}

/** Side-path anchor on the rim facing another island. */
export function islandEdgeAnchor(island: IslandDef, toward: IslandDef) {
  const e = islandWalkEllipse(island);
  const dx = toward.x - island.x;
  const dy = toward.y - island.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Ellipse support point in direction (ux, uy)
  const denom = Math.hypot(ux * e.ry, uy * e.rx) || 1;
  return {
    x: e.cx + ((ux * e.rx * e.ry) / denom) * 0.94,
    y: e.cy + ((uy * e.rx * e.ry) / denom) * 0.94,
  };
}

export type ResolvedBridge = {
  id: string;
  fromIslandId: string;
  toIslandId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angle: number; // radians
  width: number;
  /** Axis-aligned corridor used for walkability */
  corridor: { x: number; y: number; w: number; h: number };
};

export function resolveBridge(def: BridgeDef): ResolvedBridge | null {
  const a = getIsland(def.fromIslandId);
  const b = getIsland(def.toIslandId);
  if (!a?.unlocked || !b?.unlocked) return null;
  const p1 = islandEdgeAnchor(a, b);
  const p2 = islandEdgeAnchor(b, a);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const width = def.width ?? 140;
  // Thick AABB overlapping deeply into both ellipses
  const pad = width * 0.35;
  const minX = Math.min(p1.x, p2.x) - pad;
  const maxX = Math.max(p1.x, p2.x) + pad;
  const minY = Math.min(p1.y, p2.y) - width / 2;
  const maxY = Math.max(p1.y, p2.y) + width / 2;
  return {
    id: def.id,
    fromIslandId: def.fromIslandId,
    toIslandId: def.toIslandId,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    length,
    angle,
    width,
    corridor: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

export function resolveActiveBridges() {
  return BRIDGES.map(resolveBridge).filter((b): b is ResolvedBridge => !!b);
}

export type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  worldWidth: number;
  worldHeight: number;
};

/** Bounding box of unlocked islands + sky padding. */
export function computeWorldBounds(islands = unlockedIslands()): WorldBounds {
  if (!islands.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 4200,
      maxY: 2000,
      worldWidth: 4200,
      worldHeight: 2000,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of islands) {
    const r = islandRect(i);
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.left + r.width);
    maxY = Math.max(maxY, r.top + r.height);
  }
  minX -= WORLD_PAD;
  minY -= WORLD_PAD;
  maxX += WORLD_PAD;
  maxY += WORLD_PAD;
  return {
    minX,
    minY,
    maxX,
    maxY,
    worldWidth: maxX - minX,
    worldHeight: maxY - minY,
  };
}

/** Unlock next locked island in registry order. Returns the island or null. */
export function unlockNextIsland(): IslandDef | null {
  const next = ISLANDS.find((i) => !i.unlocked);
  if (!next) return null;
  next.unlocked = true;
  return next;
}

export function hubIsland() {
  return unlockedIslands().find((i) => i.role === "hub") ?? unlockedIslands()[0] ?? ISLANDS[1];
}
