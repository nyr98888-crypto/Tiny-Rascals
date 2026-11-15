import type { IslandId, WorldEntity } from "./types";
import type assetManifest from "@/data/assetManifest.json";

type Manifest = typeof assetManifest;

/**
 * Normalized foot positions (0..1 on land texture).
 * Keeps landmarks/props off the dirt/sand/frosting crossroads.
 */
const POS = {
  // Top grass lobe ABOVE the north path circle (fills empty y < 0.34)
  barn: { x: 0.48, y: 0.08 },
  bush: { x: 0.58, y: 0.12 },

  // Left grass plateau — Greenhouse + crop row in the outer grass (west of road)
  greenhouse: { x: 0.16, y: 0.33 },
  soilA: { x: 0.12, y: 0.42 },
  soilB: { x: 0.15, y: 0.42 },
  soilC: { x: 0.18, y: 0.42 },

  // Right grass plateau — Bakery/Kitchen + Wood Tree
  kitchen: { x: 0.82, y: 0.34 },
  tree: { x: 0.88, y: 0.38 },

  // Bottom clearings flanking the dock path (not on the bridge)
  tub: { x: 0.24, y: 0.54 },
  bed: { x: 0.3, y: 0.57 },
  clubhouse: { x: 0.76, y: 0.54 },
  egg: { x: 0.7, y: 0.57 },

  // Dock approach — POST kiosk right of bridge; gift boat in water by SE pier
  kiosk: { x: 0.6, y: 0.59 },
  dock: { x: 0.5, y: 0.78 },
  boat: { x: 0.65, y: 0.69 },

  // Moveable decor — grass clearings only (never on crossroads)
  bench: { x: 0.14, y: 0.46 },
  campfire: { x: 0.36, y: 0.6 },
  picnic: { x: 0.64, y: 0.6 },
  fenceL: { x: 0.12, y: 0.28 },
  fenceR: { x: 0.88, y: 0.28 },
  lantern: { x: 0.36, y: 0.16 },
  mailbox: { x: 0.86, y: 0.52 },
  flowers: { x: 0.12, y: 0.56 },
  leaves: { x: 0.88, y: 0.48 },
};

const MEADOW_LANDMARKS = [
  "building_shed", // top storage barn
  "building_greenhouse", // left garden
  "building_kitchen", // right bakery
  "building_clubhouse", // bottom cabin
];

function pickCrop(manifest: Manifest, tier: 1 | 2 | 3, index: number) {
  const list =
    tier === 1
      ? manifest.world.crops.tier1
      : tier === 2
        ? manifest.world.crops.tier2
        : manifest.world.crops.tier3;
  const stage3 = list.filter((id) => id.endsWith("_3"));
  return stage3[index % stage3.length] ?? list[index % list.length];
}

function pickProp(manifest: Manifest, tier: 1 | 2 | 3, slot: number) {
  const list =
    tier === 1
      ? manifest.world.props.tier1
      : tier === 2
        ? manifest.world.props.tier2
        : manifest.world.props.tier3;
  return list[slot];
}

function pickClutter(manifest: Manifest, tier: 1 | 2 | 3, slot: number) {
  const list =
    tier === 1
      ? manifest.world.clutter.tier1
      : tier === 2
        ? manifest.world.clutter.tier2
        : manifest.world.clutter.tier3;
  return list[slot];
}

/** Four quadrant landmarks: top barn, left garden, right kitchen, bottom clubhouse. */
function landmarkSprites(
  manifest: Manifest,
  island: IslandId,
  tier: 1 | 2 | 3
): [string, string, string, string] {
  if (tier === 1) {
    if (island === "meadow") return MEADOW_LANDMARKS as [string, string, string, string];
    const theme =
      (manifest.world.buildings.tier1.themes as Record<string, string[]>)[island] ??
      MEADOW_LANDMARKS;
    return [theme[0], theme[1], theme[2], theme[3]];
  }
  if (tier === 2) {
    const list = (manifest.world.buildings.tier2 as Record<string, string[]>)[island];
    return [list[0], list[1], list[2], list[3]];
  }
  const list = (manifest.world.buildings.tier3 as Record<string, string[]>)[island];
  return [list[0], list[1], list[2], list[3]];
}

function harborSprite(manifest: Manifest, island: IslandId, tier: 1 | 2 | 3) {
  if (tier === 1) return "building_harbor_t1";
  if (tier === 2) {
    return (manifest.world.buildings.tier2 as Record<string, string[]>)[island][8];
  }
  return (manifest.world.buildings.tier3 as Record<string, string[]>)[island][8];
}

function place(
  defaults: { x: number; y: number },
  id: string,
  overrides: Record<string, { x: number; y: number }>
) {
  const off = overrides[id];
  return off ? { x: off.x, y: off.y } : defaults;
}

export function buildIslandEntities(
  manifest: Manifest,
  island: IslandId,
  tiers: {
    buildingTier: 1 | 2 | 3;
    propTier: 1 | 2 | 3;
    cropTier: 1 | 2 | 3;
    clutterTier: 1 | 2 | 3;
  },
  layoutOverrides: Record<string, { x: number; y: number }> = {}
): WorldEntity[] {
  const entities: WorldEntity[] = [];
  const [barn, greenhouse, kitchen, clubhouse] = landmarkSprites(
    manifest,
    island,
    tiers.buildingTier
  );

  const landmarks: {
    id: string;
    spriteId: string;
    pos: { x: number; y: number };
    scale: number;
  }[] = [
    { id: "barn", spriteId: barn, pos: POS.barn, scale: 0.48 },
    { id: "greenhouse", spriteId: greenhouse, pos: POS.greenhouse, scale: 0.5 },
    { id: "kitchen", spriteId: kitchen, pos: POS.kitchen, scale: 0.5 },
    { id: "clubhouse", spriteId: clubhouse, pos: POS.clubhouse, scale: 0.48 },
  ];

  for (const lm of landmarks) {
    const id = `${island}-bldg-${lm.id}`;
    const pos = place(lm.pos, id, layoutOverrides);
    entities.push({
      id,
      kind: "building",
      spriteId: lm.spriteId,
      x: pos.x,
      y: pos.y,
      scale: lm.scale,
      footY: pos.y,
      movable: true,
      interact: "building",
    });
  }

  // Harbor dock stays anchored — never movable / never overridden
  entities.push({
    id: `${island}-dock`,
    kind: "building",
    spriteId: harborSprite(manifest, island, tiers.buildingTier),
    x: POS.dock.x,
    y: POS.dock.y,
    scale: 0.48,
    footY: POS.dock.y,
    movable: false,
  });

  const propMap: {
    slot: number;
    pos: { x: number; y: number };
    interact: WorldEntity["interact"];
    scale: number;
  }[] = [
    { slot: 0, pos: POS.tub, interact: "tub", scale: 0.32 },
    { slot: 1, pos: POS.bed, interact: "bed", scale: 0.32 },
    { slot: 3, pos: POS.tree, interact: "tree", scale: 0.42 },
    { slot: 4, pos: POS.bush, interact: "bush", scale: 0.34 },
    { slot: 7, pos: POS.kiosk, interact: "building", scale: 0.28 },
    { slot: 8, pos: POS.egg, interact: "egg", scale: 0.28 },
  ];

  for (const p of propMap) {
    const id = `${island}-prop-${p.slot}`;
    const pos = place(p.pos, id, layoutOverrides);
    entities.push({
      id,
      kind: "prop",
      spriteId: pickProp(manifest, tiers.propTier, p.slot),
      x: pos.x,
      y: pos.y,
      scale: p.scale,
      footY: pos.y,
      movable: true,
      interact: p.interact,
    });
  }

  const soils = [POS.soilA, POS.soilB, POS.soilC];
  soils.forEach((defaultPos, i) => {
    const id = `${island}-crop-${i}`;
    const pos = place(defaultPos, id, layoutOverrides);
    entities.push({
      id,
      kind: "crop",
      spriteId: pickCrop(manifest, tiers.cropTier, i),
      x: pos.x,
      y: pos.y,
      scale: 0.28,
      footY: pos.y,
      movable: true,
      interact: "soil",
      cropStage: 3,
    });
  });

  const clutterMap: {
    slot: number;
    pos: { x: number; y: number };
    interact?: WorldEntity["interact"];
    scale: number;
  }[] = [
    { slot: 0, pos: POS.bench, interact: "bench", scale: 0.3 },
    { slot: 1, pos: POS.campfire, interact: "campfire", scale: 0.28 },
    { slot: 2, pos: POS.picnic, interact: "picnic", scale: 0.3 },
    { slot: 3, pos: POS.fenceL, scale: 0.26 },
    { slot: 4, pos: POS.lantern, scale: 0.26 },
    { slot: 5, pos: POS.flowers, scale: 0.24 },
    { slot: 6, pos: POS.mailbox, scale: 0.26 },
    { slot: 7, pos: POS.boat, scale: 0.38 },
    { slot: 8, pos: POS.leaves, scale: 0.24 },
  ];

  for (const c of clutterMap) {
    const id = `${island}-clutter-${c.slot}`;
    const pos = place(c.pos, id, layoutOverrides);
    entities.push({
      id,
      kind: "clutter",
      spriteId: pickClutter(manifest, tiers.clutterTier, c.slot),
      x: pos.x,
      y: pos.y,
      scale: c.scale,
      footY: pos.y,
      movable: true,
      interact: c.interact,
    });
  }

  return entities;
}

export function landToScreen(
  nx: number,
  ny: number,
  landX: number,
  landY: number,
  landW: number,
  landH: number
) {
  return {
    x: landX + nx * landW,
    y: landY + ny * landH,
  };
}
