import { localToGlobal } from "./worldGrid";
import {
  ISLAND_ORDER,
  type GameSave,
  type IslandId,
  type IslandProgress,
  type Resources,
  type Vec2,
} from "./types";

const KEY = "tiny-rascals-save-v1";

/** Spawn ring in local plot UV (converted to global on write). */
function localSpawnPoint(k: number): Vec2 {
  const col = k % 3;
  const row = Math.floor(k / 3);
  return {
    x: 0.48 + (col - 1) * 0.06,
    y: 0.52 + row * 0.06,
  };
}

function emptyLayouts(): Record<IslandId, Record<string, Vec2>> {
  return {
    meadow: {},
    lagoon: {},
    snack: {},
    retro: {},
    hollow: {},
    shore: {},
  };
}

function emptySpawned(): GameSave["spawned"] {
  return {
    meadow: [],
    lagoon: [],
    snack: [],
    retro: [],
    hollow: [],
    shore: [],
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
    islands[id] = defaultIsland(true);
  }
  islands.meadow.dockRepaired = false;

  const spawned = emptySpawned();
  const picks = starterPets.filter(Boolean);
  const perIsland = Math.max(
    2,
    Math.ceil(Math.min(picks.length, 18) / ISLAND_ORDER.length)
  );
  ISLAND_ORDER.forEach((island, ii) => {
    for (let k = 0; k < perIsland; k++) {
      const petId = picks[(ii * perIsland + k) % picks.length] ?? picks[0];
      if (!petId) continue;
      const local = localSpawnPoint(k);
      const g = localToGlobal(island, local.x, local.y);
      spawned[island].push({
        petId,
        x: g.x,
        y: g.y,
        xp: 0,
        level: 1,
      });
    }
  });

  return {
    version: 9,
    activeIsland: "meadow",
    dayNight: 0.25,
    manualNight: null,
    resources: { wood: 12, berries: 8, crops: 4, tokens: 3, gems: 0, shells: 2 },
    islands,
    discovered: [
      ...new Set(
        Object.values(spawned).flatMap((list) => list.map((s) => s.petId))
      ),
    ],
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
    const parsed = JSON.parse(raw) as GameSave & {
      clutterOffsets?: Record<string, Vec2>;
    };
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(parsed.version)) {
      return defaultSave(starterPets);
    }

    if (!parsed.layoutOverrides) parsed.layoutOverrides = emptyLayouts();
    if (!parsed.spawned) parsed.spawned = emptySpawned();
    if (!parsed.islands) parsed.islands = {} as GameSave["islands"];
    if (!parsed.resources) {
      parsed.resources = {
        wood: 12,
        berries: 8,
        crops: 4,
        tokens: 3,
        gems: 0,
        shells: 0,
      };
    }

    for (const id of ISLAND_ORDER) {
      if (!parsed.layoutOverrides[id]) parsed.layoutOverrides[id] = {};
      if (!parsed.spawned[id]) parsed.spawned[id] = [];
      if (!parsed.islands[id]) parsed.islands[id] = defaultIsland(true);
    }

    if (parsed.version < 2) {
      parsed.layoutOverrides = emptyLayouts();
    } else if (parsed.version < 3 && parsed.clutterOffsets) {
      for (const [entId, pos] of Object.entries(parsed.clutterOffsets)) {
        const island = ISLAND_ORDER.find((i) => entId.startsWith(`${i}-`));
        if (island) parsed.layoutOverrides[island][entId] = pos;
      }
      delete parsed.clutterOffsets;
    }
    if (parsed.version < 4) {
      for (const id of ISLAND_ORDER) {
        const map = parsed.layoutOverrides[id];
        delete map[`${id}-prop-7`];
        delete map[`${id}-clutter-7`];
      }
    }
    if (parsed.version < 5) {
      parsed.layoutOverrides = emptyLayouts();
    }
    if (parsed.version < 6) {
      const pool =
        starterPets.length > 0
          ? starterPets
          : parsed.discovered.length > 0
            ? parsed.discovered
            : ["axolotl", "shiba", "frog", "otter", "penguin"];
      for (const island of ISLAND_ORDER) {
        if (parsed.spawned[island].length > 0) continue;
        for (let k = 0; k < 3; k++) {
          const petId = pool[(ISLAND_ORDER.indexOf(island) * 3 + k) % pool.length];
          const local = localSpawnPoint(k);
          parsed.spawned[island].push({
            petId,
            x: local.x,
            y: local.y,
            xp: 0,
            level: 1,
          });
          if (!parsed.discovered.includes(petId)) parsed.discovered.push(petId);
        }
        parsed.islands[island].unlocked = true;
      }
      parsed.sandboxPreviewAll = true;
    }
    if (parsed.version < 7) {
      parsed.activeIsland = "meadow";
      parsed.islands.meadow.unlocked = true;
    }
    if (parsed.version < 8) {
      if (typeof parsed.resources.tokens !== "number") parsed.resources.tokens = 0;
      parsed.activeIsland = "meadow";
    }

    // v8→v9: continuous 3×2 ranch — local UV → global UV; add shore + shells
    if (parsed.version < 9) {
      if (typeof parsed.resources.shells !== "number") parsed.resources.shells = 0;
      if (!parsed.islands.shore) parsed.islands.shore = defaultIsland(true);
      if (!parsed.spawned.shore) parsed.spawned.shore = [];
      if (!parsed.layoutOverrides.shore) parsed.layoutOverrides.shore = {};

      for (const id of ISLAND_ORDER) {
        if (id === "shore" && parsed.version < 9) {
          // seed a couple of shore rascals if empty
          if (parsed.spawned.shore.length === 0) {
            const pool =
              starterPets.length > 0
                ? starterPets
                : parsed.discovered.length > 0
                  ? parsed.discovered
                  : ["otter", "axolotl", "frog"];
            for (let k = 0; k < 2; k++) {
              const local = localSpawnPoint(k);
              const g = localToGlobal("shore", local.x, local.y);
              parsed.spawned.shore.push({
                petId: pool[k % pool.length],
                x: g.x,
                y: g.y,
                xp: 0,
                level: 1,
              });
            }
          }
          continue;
        }
        parsed.spawned[id] = (parsed.spawned[id] ?? []).map((s) => {
          const g = localToGlobal(id, s.x, s.y);
          return { ...s, x: g.x, y: g.y };
        });
        const map = parsed.layoutOverrides[id] ?? {};
        for (const [entId, pos] of Object.entries(map)) {
          map[entId] = localToGlobal(id, pos.x, pos.y);
        }
      }
      parsed.activeIsland = "meadow";
      parsed.sandboxPreviewAll = true;
    }

    if (typeof parsed.resources.shells !== "number") parsed.resources.shells = 0;
    if (typeof parsed.resources.tokens !== "number") parsed.resources.tokens = 0;
    parsed.version = 9;
    if (!parsed.activeIsland) parsed.activeIsland = "meadow";

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
  save.resources.tokens += Math.floor(hours * rate * 0.35);
  save.resources.gems += Math.floor(hours * 0.15);
  save.resources.shells += Math.floor(hours * rate * 0.25);
}

export function canAfford(res: Resources, cost: Partial<Resources>) {
  return (
    res.wood >= (cost.wood ?? 0) &&
    res.berries >= (cost.berries ?? 0) &&
    res.crops >= (cost.crops ?? 0) &&
    res.tokens >= (cost.tokens ?? 0) &&
    res.gems >= (cost.gems ?? 0) &&
    res.shells >= (cost.shells ?? 0)
  );
}

export function spend(res: Resources, cost: Partial<Resources>) {
  res.wood -= cost.wood ?? 0;
  res.berries -= cost.berries ?? 0;
  res.crops -= cost.crops ?? 0;
  res.tokens -= cost.tokens ?? 0;
  res.gems -= cost.gems ?? 0;
  res.shells -= cost.shells ?? 0;
}

/** Upgrades pull from ranch resources. */
export const UPGRADE_COSTS = {
  building: { wood: 16, berries: 10, crops: 6, tokens: 4, gems: 0, shells: 0 },
  prop: { wood: 10, berries: 8, crops: 5, tokens: 3, gems: 0, shells: 0 },
  crop: { wood: 8, berries: 10, crops: 8, tokens: 2, gems: 0, shells: 0 },
  clutter: { wood: 8, berries: 6, crops: 4, tokens: 3, gems: 0, shells: 0 },
  dock: { wood: 24, berries: 12, crops: 10, tokens: 8, gems: 1, shells: 4 },
} as const;

export const NEXT_ISLAND: Partial<Record<IslandId, IslandId>> = {
  meadow: "shore",
  lagoon: "hollow",
  snack: "hollow",
  retro: "lagoon",
  hollow: "shore",
  shore: "meadow",
};

export const UNLOCK_NEIGHBORS: Partial<Record<IslandId, IslandId[]>> = {
  meadow: ["lagoon", "shore"],
  lagoon: ["retro", "meadow", "hollow"],
  snack: ["retro", "hollow"],
  retro: ["lagoon", "snack"],
  hollow: ["lagoon", "snack", "shore"],
  shore: ["meadow", "hollow"],
};
