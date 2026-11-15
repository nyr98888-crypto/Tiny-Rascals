import {
  ISLAND_ORDER,
  type GameSave,
  type IslandId,
  type IslandProgress,
  type Resources,
  type Vec2,
} from "./types";

const KEY = "tiny-rascals-save-v1";

function emptyLayouts(): Record<IslandId, Record<string, Vec2>> {
  return {
    meadow: {},
    lagoon: {},
    snack: {},
    retro: {},
    hollow: {},
  };
}

function defaultIsland(unlocked: boolean): IslandProgress {
  return {
    unlocked,
    buildingTier: 1,
    propTier: 1,
    cropTier: 1,
    clutterTier: 1,
    dockRepaired: unlocked,
  };
}

export function defaultSave(starterPets: string[]): GameSave {
  const islands = {} as Record<IslandId, IslandProgress>;
  for (const id of ISLAND_ORDER) {
    islands[id] = defaultIsland(id === "meadow");
  }
  islands.meadow.dockRepaired = false;

  const spawned = {} as GameSave["spawned"];
  for (const id of ISLAND_ORDER) spawned[id] = [];
  const picks = starterPets.slice(0, 8);
  picks.forEach((petId, i) => {
    spawned.meadow.push({
      petId,
      x: 0.35 + (i % 4) * 0.1,
      y: 0.55 + Math.floor(i / 4) * 0.08,
      xp: 0,
      level: 1,
    });
  });

  return {
    version: 3,
    activeIsland: "meadow",
    dayNight: 0.25,
    manualNight: null,
    resources: { wood: 12, berries: 8, crops: 4, gems: 0 },
    islands,
    discovered: [...new Set(picks)],
    spawned,
    layoutOverrides: emptyLayouts(),
    lastSeen: Date.now(),
    sandboxPreviewAll: true,
    muted: false,
  };
}

export function loadSave(starterPets: string[]): GameSave {
  if (typeof window === "undefined") return defaultSave(starterPets);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave(starterPets);
    const parsed = JSON.parse(raw) as GameSave & { clutterOffsets?: Record<string, Vec2> };
    if (![1, 2, 3].includes(parsed.version)) return defaultSave(starterPets);

    if (!parsed.layoutOverrides) parsed.layoutOverrides = emptyLayouts();
    for (const id of ISLAND_ORDER) {
      if (!parsed.layoutOverrides[id]) parsed.layoutOverrides[id] = {};
    }

    // v1→v2 cleared old clutter; v2→v3 promotes flat clutterOffsets into per-island maps
    if (parsed.version < 2) {
      parsed.layoutOverrides = emptyLayouts();
    } else if (parsed.version < 3 && parsed.clutterOffsets) {
      for (const [entId, pos] of Object.entries(parsed.clutterOffsets)) {
        const island = ISLAND_ORDER.find((i) => entId.startsWith(`${i}-`));
        if (island) parsed.layoutOverrides[island][entId] = pos;
      }
      delete parsed.clutterOffsets;
    }
    parsed.version = 3;

    applyOfflineIdle(parsed);
    return parsed;
  } catch {
    return defaultSave(starterPets);
  }
}

export function writeSave(save: GameSave) {
  save.lastSeen = Date.now();
  localStorage.setItem(KEY, JSON.stringify(save));
}

function applyOfflineIdle(save: GameSave) {
  const elapsed = Math.max(0, Date.now() - (save.lastSeen || Date.now()));
  const hours = Math.min(12, elapsed / 3_600_000);
  if (hours < 0.02) return;
  const rascalCount = Object.values(save.spawned).reduce((n, a) => n + a.length, 0);
  const rate = 2 + rascalCount * 0.35;
  save.resources.wood += Math.floor(hours * rate);
  save.resources.berries += Math.floor(hours * rate * 0.8);
  save.resources.crops += Math.floor(hours * rate * 0.5);
  save.resources.gems += Math.floor(hours * 0.15);
}

export function canAfford(res: Resources, cost: Partial<Resources>) {
  return (
    res.wood >= (cost.wood ?? 0) &&
    res.berries >= (cost.berries ?? 0) &&
    res.crops >= (cost.crops ?? 0) &&
    res.gems >= (cost.gems ?? 0)
  );
}

export function spend(res: Resources, cost: Partial<Resources>) {
  res.wood -= cost.wood ?? 0;
  res.berries -= cost.berries ?? 0;
  res.crops -= cost.crops ?? 0;
  res.gems -= cost.gems ?? 0;
}

export const UPGRADE_COSTS = {
  building: { wood: 20, berries: 10, crops: 5, gems: 0 },
  prop: { wood: 12, berries: 8, crops: 4, gems: 0 },
  crop: { wood: 8, berries: 12, crops: 6, gems: 0 },
  clutter: { wood: 10, berries: 6, crops: 4, gems: 0 },
  dock: { wood: 30, berries: 15, crops: 10, gems: 1 },
} as const;

export const NEXT_ISLAND: Partial<Record<IslandId, IslandId>> = {
  meadow: "lagoon",
  lagoon: "snack",
  snack: "retro",
  retro: "hollow",
};
