import manifest from "@/data/assetManifest.json";
import { CozyAudio } from "./audio";
import { buildIslandEntities, landToScreen } from "./layouts";
import { loadSave, writeSave, canAfford, spend, UPGRADE_COSTS, NEXT_ISLAND } from "./save";
import { TextureManager } from "./textures";
import { clampToWalkBounds } from "./walkBounds";
import type {
  GameSave,
  IslandId,
  Particle,
  Rascal,
  WorldEntity,
} from "./types";
import { ISLAND_ORDER } from "./types";

const POSE = {
  walk: 9,
  hop: 10,
  dash: 11,
  trip: 12,
  sleep: 7,
  wash: 6,
  wave: 18,
  heart: 19,
  eat: 20,
  crown: 23,
  dig: 1,
  water: 0,
  harvest: 2,
};

type Listener = () => void;

export class GameEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  textures = new TextureManager();
  audio = new CozyAudio();
  save: GameSave;
  entities: WorldEntity[] = [];
  rascals: Rascal[] = [];
  particles: Particle[] = [];

  camX = 0;
  camY = 0;
  zoom = 0.7;
  targetZoom = 0.7;
  minZoom = 0.5;
  maxZoom = 2.4;
  bob = 0;
  time = 0;
  dpr = 1;
  /** Smoothed 0..1 night amount for sky cross-fade + lighting. */
  nightBlend = 0;

  landW = 2048;
  landH = 868;
  landX = 0;
  landY = 0;

  dragging = false;
  dragLast = { x: 0, y: 0 };
  heldRascal: Rascal | null = null;
  decorateMode = false;
  dragEntity: WorldEntity | null = null;
  /** Normalized grab offset so entities don't jump on pointer-down. */
  grabOffset = { dx: 0, dy: 0 };
  hoverEntity: WorldEntity | null = null;
  hoverRascal: Rascal | null = null;

  private raf = 0;
  private lastTs = 0;
  private listeners = new Set<Listener>();
  private giftShown = false;
  giftMessage: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;

    const starters = manifest.rascals.filter((r) => r.atlas).map((r) => r.id);
    this.save = loadSave(starters);
    this.audio.setMuted(this.save.muted);
    this.reloadIsland();
    this.bindInput();
    this.handleGiftQuery();
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private handleGiftQuery() {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const gift = params.get("gift");
    if (!gift || this.giftShown) return;
    this.giftShown = true;
    try {
      const decoded = JSON.parse(atob(gift)) as { wood?: number; berries?: number; crops?: number; gems?: number; pet?: string; from?: string };
      this.save.resources.wood += decoded.wood ?? 5;
      this.save.resources.berries += decoded.berries ?? 5;
      this.save.resources.crops += decoded.crops ?? 3;
      this.save.resources.gems += decoded.gems ?? 1;
      if (decoded.pet && !this.save.discovered.includes(decoded.pet)) {
        this.save.discovered.push(decoded.pet);
        this.spawnPet(decoded.pet, 0.55, 0.86);
      }
      this.giftMessage = `Care package from ${decoded.from ?? "a friend"} arrived by boat!`;
      this.audio.gift();
      this.burst(0.55, 0.86, "#e0b44a", 18);
      writeSave(this.save);
      this.emit();
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* ignore bad gift */
    }
  }

  makeGiftLink() {
    const payload = {
      wood: 8,
      berries: 6,
      crops: 4,
      gems: 1,
      pet: manifest.rascals.find((r) => r.atlas && !this.save.discovered.includes(r.id))?.id,
      from: "Tiny Rascals",
    };
    const gift = btoa(JSON.stringify(payload));
    return `${window.location.origin}${window.location.pathname}?gift=${gift}`;
  }

  async start() {
    await this.loadActiveTextures();
    this.resize();
    this.frameIsland();
    this.nightBlend = this.nightTarget();
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener("resize", this.resize);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.unbindInput();
  }

  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.recomputeZoomLimits();
  };

  private async loadActiveTextures() {
    const island = this.save.activeIsland;
    const land = manifest.lands[island];
    const sky = manifest.backdrops[island];
    const keep = new Set<string>([land.src, sky.day, sky.night]);
    const srcs = [land.src, sky.day, sky.night];

    for (const e of this.entities) {
      const spr = manifest.worldSprites[e.spriteId as keyof typeof manifest.worldSprites];
      if (spr) {
        srcs.push(spr.src);
        keep.add(spr.src);
      }
    }
    for (const r of this.rascals) {
      const pet = manifest.rascals.find((p) => p.id === r.petId);
      if (pet?.atlas) {
        srcs.push(pet.atlas);
        keep.add(pet.atlas);
      }
      if (pet?.icon) keep.add(pet.icon);
    }
    await this.textures.loadMany(srcs);
    this.textures.disposeExcept(keep);
    this.landW = land.w;
    this.landH = land.h;
    this.recomputeZoomLimits();
  }

  reloadIsland() {
    const island = this.save.activeIsland;
    const prog = this.save.islands[island];
    const overrides = this.save.layoutOverrides?.[island] ?? {};
    this.entities = buildIslandEntities(manifest, island, prog, overrides);
    this.rascals = (this.save.spawned[island] || []).map((s, i) => ({
      id: `${island}-rascal-${i}-${s.petId}`,
      petId: s.petId,
      x: s.x,
      y: s.y,
      vx: 0,
      vy: 0,
      state: "WANDER_PATH" as const,
      pose: POSE.walk,
      poseTimer: 0,
      facing: 1 as const,
      target: null,
      interactWith: null,
      socialWith: null,
      squash: 1,
      held: false,
      xp: s.xp,
      level: s.level,
      bounce: 0,
    }));
    void this.loadActiveTextures().then(() => {
      this.frameIsland();
      this.emit();
    });
    this.emit();
  }

  setIsland(id: IslandId) {
    const prog = this.save.islands[id];
    if (!prog.unlocked && !this.save.sandboxPreviewAll) return;
    this.persistRascals();
    this.save.activeIsland = id;
    writeSave(this.save);
    this.reloadIsland();
  }

  private persistRascals() {
    const island = this.save.activeIsland;
    this.save.spawned[island] = this.rascals.map((r) => ({
      petId: r.petId,
      x: r.x,
      y: r.y,
      xp: r.xp,
      level: r.level,
    }));
  }

  spawnPet(petId: string, x = 0.5, y = 0.85) {
    const island = this.save.activeIsland;
    this.rascals.push({
      id: `${island}-rascal-${Date.now()}`,
      petId,
      x,
      y,
      vx: 0,
      vy: 0,
      state: "WANDER_PATH",
      pose: POSE.wave,
      poseTimer: 1.2,
      facing: 1,
      target: null,
      interactWith: null,
      socialWith: null,
      squash: 1,
      held: false,
      xp: 0,
      level: 1,
      bounce: 0.4,
    });
    if (!this.save.discovered.includes(petId)) this.save.discovered.push(petId);
    this.persistRascals();
    writeSave(this.save);
    void this.loadActiveTextures();
    this.emit();
  }

  toggleDecorate() {
    this.decorateMode = !this.decorateMode;
    if (!this.decorateMode) {
      this.dragEntity = null;
      this.hoverEntity = null;
      this.canvas.classList.remove("decorate");
    } else {
      this.canvas.classList.add("decorate");
    }
    this.emit();
  }

  /** Snap active island back to curated default layout. */
  resetLayout() {
    const island = this.save.activeIsland;
    this.save.layoutOverrides[island] = {};
    writeSave(this.save);
    this.dragEntity = null;
    this.reloadIsland();
    this.audio.chirp();
    this.emit();
  }

  private persistEntityLayout(e: WorldEntity) {
    if (!e.movable) return;
    const island = this.save.activeIsland;
    if (!this.save.layoutOverrides[island]) this.save.layoutOverrides[island] = {};
    this.save.layoutOverrides[island][e.id] = { x: e.x, y: e.y };
  }

  toggleMute() {
    this.save.muted = !this.save.muted;
    this.audio.setMuted(this.save.muted);
    writeSave(this.save);
    this.emit();
  }

  toggleSandbox() {
    this.save.sandboxPreviewAll = !this.save.sandboxPreviewAll;
    if (this.save.sandboxPreviewAll) {
      for (const id of ISLAND_ORDER) this.save.islands[id].unlocked = true;
    }
    writeSave(this.save);
    this.emit();
  }

  setManualNight(v: boolean | null) {
    this.save.manualNight = v;
    // Snap blend partway so the cross-fade starts immediately on click
    const target = this.nightTarget();
    this.nightBlend += (target - this.nightBlend) * 0.45;
    writeSave(this.save);
    this.emit();
  }

  /**
   * Opaque island ≈ 78% of land texture width. Target ~84% of viewport for the
   * visible island (~18% larger than the prior ~70% framing).
   */
  private viewTextureFill() {
    return 0.84 / 0.78; // ≈ 1.077
  }

  private recomputeZoomLimits() {
    const w = Math.max(320, this.canvas.clientWidth || 1280);
    const fill = this.viewTextureFill();
    const fit = (fill * w) / Math.max(1, this.landW);
    this.minZoom = ((0.84 * 0.95) / 0.78 * w) / Math.max(1, this.landW);
    this.maxZoom = this.minZoom * 2.4;
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom || fit));
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom || fit));
  }

  /** Apply default framing once land size is known (first load / island switch). */
  frameIsland() {
    const w = Math.max(320, this.canvas.clientWidth || 1280);
    this.recomputeZoomLimits();
    const fit = (this.viewTextureFill() * w) / Math.max(1, this.landW);
    this.targetZoom = fit;
    this.zoom = fit;
    this.camX = 0;
    this.camY = this.landH * 0.02;
  }

  private clampOnIsland(x: number, y: number) {
    return clampToWalkBounds(x, y, this.save.activeIsland);
  }

  tryUpgrade(kind: "building" | "prop" | "crop" | "clutter" | "dock") {
    const island = this.save.activeIsland;
    const prog = this.save.islands[island];
    const cost = UPGRADE_COSTS[kind];
    if (!canAfford(this.save.resources, cost)) return false;

    if (kind === "dock") {
      if (prog.dockRepaired) return false;
      spend(this.save.resources, cost);
      prog.dockRepaired = true;
      const next = NEXT_ISLAND[island];
      if (next) this.save.islands[next].unlocked = true;
      this.attractNewRascal();
    } else {
      const key =
        kind === "building"
          ? "buildingTier"
          : kind === "prop"
            ? "propTier"
            : kind === "crop"
              ? "cropTier"
              : "clutterTier";
      if (prog[key] >= 3) return false;
      spend(this.save.resources, cost);
      prog[key] = (prog[key] + 1) as 1 | 2 | 3;
      this.attractNewRascal();
    }
    writeSave(this.save);
    this.reloadIsland();
    this.audio.chirp();
    this.emit();
    return true;
  }

  private attractNewRascal() {
    const candidates = manifest.rascals.filter(
      (r) => r.atlas && !this.save.discovered.includes(r.id)
    );
    if (!candidates.length) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.spawnPet(pick.id, 0.52, 0.87);
    this.burst(0.52, 0.87, "#7dcea0", 14);
  }

  private bindInput() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private unbindInput() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private screenToWorld(sx: number, sy: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const wx = (sx - w / 2) / this.zoom + this.camX;
    const wy = (sy - h / 2) / this.zoom + this.camY;
    return { x: wx, y: wy };
  }

  private worldToNorm(wx: number, wy: number) {
    return {
      x: (wx - this.landX) / this.landW,
      y: (wy - this.landY) / this.landH,
    };
  }

  private hitRascal(wx: number, wy: number) {
    for (let i = this.rascals.length - 1; i >= 0; i--) {
      const r = this.rascals[i];
      const p = landToScreen(r.x, r.y, this.landX, this.landY, this.landW, this.landH);
      const s = 70;
      if (Math.abs(wx - p.x) < s * 0.45 && wy < p.y + 10 && wy > p.y - s) return r;
    }
    return null;
  }

  /** Hit-test any decorate-movable entity (buildings, stations, crops, clutter). */
  private hitDecorateEntity(wx: number, wy: number) {
    const ranked = [...this.entities]
      .filter((e) => e.movable)
      .sort((a, b) => b.footY - a.footY);
    for (const e of ranked) {
      const p = landToScreen(e.x, e.y, this.landX, this.landY, this.landW, this.landH);
      const spr = manifest.worldSprites[e.spriteId as keyof typeof manifest.worldSprites];
      if (!spr) continue;
      const dw = Math.max(40, spr.w * e.scale);
      const dh = Math.max(40, spr.h * e.scale);
      if (wx > p.x - dw / 2 && wx < p.x + dw / 2 && wy > p.y - dh && wy < p.y + 10) {
        return e;
      }
    }
    return null;
  }

  private onPointerDown = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);
    this.canvas.setPointerCapture(ev.pointerId);

    if (this.decorateMode) {
      const ent = this.hitDecorateEntity(world.x, world.y);
      if (ent) {
        const n = this.worldToNorm(world.x, world.y);
        this.grabOffset = { dx: n.x - ent.x, dy: n.y - ent.y };
        this.dragEntity = ent;
        this.audio.pop();
        return;
      }
      // Pan camera while decorating if nothing grabbed
      this.dragging = true;
      this.canvas.classList.add("dragging");
      this.dragLast = { x: sx, y: sy };
      return;
    }

    const rascal = this.hitRascal(world.x, world.y);
    if (rascal) {
      const n = this.worldToNorm(world.x, world.y);
      this.grabOffset = { dx: n.x - rascal.x, dy: n.y - rascal.y };
      rascal.held = true;
      rascal.state = "HELD";
      rascal.bounce = 0.35;
      rascal.squash = 0.75;
      this.heldRascal = rascal;
      this.audio.pop();
      this.burstNorm(rascal.x, rascal.y - 0.05, "#e0b44a", 8);
      return;
    }

    this.dragging = true;
    this.canvas.classList.add("dragging");
    this.dragLast = { x: sx, y: sy };
  };

  private onPointerMove = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);
    this.hoverRascal = this.decorateMode ? null : this.hitRascal(world.x, world.y);
    this.hoverEntity = this.decorateMode && !this.dragEntity
      ? this.hitDecorateEntity(world.x, world.y)
      : null;

    if (this.heldRascal) {
      const raw = this.worldToNorm(world.x, world.y);
      const n = this.clampOnIsland(
        raw.x - this.grabOffset.dx,
        raw.y - this.grabOffset.dy
      );
      this.heldRascal.x = n.x;
      this.heldRascal.y = n.y;
      return;
    }
    if (this.dragEntity) {
      const raw = this.worldToNorm(world.x, world.y);
      const n = this.clampOnIsland(
        raw.x - this.grabOffset.dx,
        raw.y - this.grabOffset.dy
      );
      this.dragEntity.x = n.x;
      this.dragEntity.y = n.y;
      this.dragEntity.footY = n.y;
      return;
    }
    if (this.dragging) {
      const dx = sx - this.dragLast.x;
      const dy = sy - this.dragLast.y;
      this.camX -= dx / this.zoom;
      this.camY -= dy / this.zoom;
      this.dragLast = { x: sx, y: sy };
    }
  };

  private onPointerUp = () => {
    this.dragging = false;
    this.canvas.classList.remove("dragging");

    if (this.dragEntity) {
      const clamped = this.clampOnIsland(this.dragEntity.x, this.dragEntity.y);
      this.dragEntity.x = clamped.x;
      this.dragEntity.y = clamped.y;
      this.dragEntity.footY = clamped.y;
      this.persistEntityLayout(this.dragEntity);
      this.dragEntity = null;
      this.grabOffset = { dx: 0, dy: 0 };
      writeSave(this.save);
      this.emit();
    }

    if (this.heldRascal) {
      const r = this.heldRascal;
      const drop = this.clampOnIsland(r.x, r.y);
      r.x = drop.x;
      r.y = drop.y;
      r.held = false;
      r.bounce = 0.45;
      r.squash = 1.25;
      this.grabOffset = { dx: 0, dy: 0 };
      const prop = this.nearestInteractable(r.x, r.y, 0.08);
      const friend = this.nearestRascal(r, 0.07);
      if (prop) {
        r.state = "USE_PROP";
        r.interactWith = prop.id;
        r.poseTimer = 2.5;
        r.pose = this.poseForInteract(prop.interact);
        if (prop.interact === "tub") this.audio.splash();
        else if (prop.interact === "tree") this.audio.chop();
        else this.audio.chirp();
        this.gainResourceFrom(prop);
      } else if (friend) {
        r.state = "SOCIAL_EMOTE";
        friend.state = "SOCIAL_EMOTE";
        r.socialWith = friend.id;
        friend.socialWith = r.id;
        r.pose = POSE.wave;
        friend.pose = POSE.heart;
        r.poseTimer = 2;
        friend.poseTimer = 2;
        this.audio.chirp();
      } else {
        r.state = "WANDER_PATH";
        r.target = null;
      }
      this.heldRascal = null;
      this.persistRascals();
      writeSave(this.save);
      this.emit();
    }
  };

  private onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0012);
    this.targetZoom = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, this.targetZoom * factor)
    );
  };

  private poseForInteract(kind: WorldEntity["interact"]) {
    switch (kind) {
      case "tub":
        return POSE.wash;
      case "bed":
        return POSE.sleep;
      case "campfire":
      case "picnic":
        return POSE.eat;
      case "tree":
        return POSE.dig;
      case "bush":
      case "soil":
        return POSE.harvest;
      case "bench":
        return POSE.eat;
      default:
        return POSE.wave;
    }
  }

  private nearestInteractable(x: number, y: number, radius: number) {
    let best: WorldEntity | null = null;
    let bestD = radius;
    for (const e of this.entities) {
      if (!e.interact) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private nearestRascal(self: Rascal, radius: number) {
    let best: Rascal | null = null;
    let bestD = radius;
    for (const r of this.rascals) {
      if (r === self) continue;
      const d = Math.hypot(r.x - self.x, r.y - self.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private gainResourceFrom(prop: WorldEntity) {
    const res = this.save.resources;
    if (prop.interact === "tree") {
      res.wood += 1;
      this.floatText(prop.x, prop.y, "+1 Wood");
    } else if (prop.interact === "bush") {
      res.berries += 1;
      this.floatText(prop.x, prop.y, "+1 Berry");
    } else if (prop.interact === "soil") {
      res.crops += 1;
      this.floatText(prop.x, prop.y, "+1 Crop");
    } else if (prop.interact === "egg") {
      res.gems += 1;
      this.floatText(prop.x, prop.y, "+1 Gem");
    }
    writeSave(this.save);
    this.emit();
  }

  private floatText(nx: number, ny: number, text: string) {
    const p = landToScreen(nx, ny, this.landX, this.landY, this.landW, this.landH);
    this.particles.push({
      x: p.x,
      y: p.y - 40,
      vx: 0,
      vy: -28,
      life: 1.2,
      maxLife: 1.2,
      color: "#e0b44a",
      size: 14,
      text,
    });
  }

  private burstNorm(nx: number, ny: number, color: string, n: number) {
    const p = landToScreen(nx, ny, this.landX, this.landY, this.landW, this.landH);
    this.burst(p.x, p.y, color, n);
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.6 + Math.random() * 0.5,
        maxLife: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private update(dt: number) {
    this.time += dt;
    this.bob = Math.sin(this.time * 0.7) * 10;
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 8);

    // Day/night cycle ~90s full day unless manual
    if (this.save.manualNight === null) {
      this.save.dayNight = (this.save.dayNight + dt / 90) % 1;
    }
    const nightTarget = this.nightTarget();
    // Snappy but smooth cross-fade (~0.35s)
    this.nightBlend += (nightTarget - this.nightBlend) * Math.min(1, dt * 6);

    this.landX = -this.landW / 2;
    this.landY = -this.landH / 2 + this.bob;

    for (const r of this.rascals) this.updateRascal(r, dt);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Passive income trickle
    if (Math.random() < dt * 0.08) {
      const workers = this.rascals.filter((r) => r.state === "GATHER_OR_FARM");
      if (workers.length) {
        const w = workers[0];
        const prop = this.entities.find((e) => e.id === w.interactWith);
        if (prop) this.gainResourceFrom(prop);
      }
    }
  }

  /** Keep AI pathfinding locked to the entity's live decorate position. */
  private syncAiTargetToEntity(r: Rascal) {
    if (!r.interactWith) return;
    const ent = this.entities.find((e) => e.id === r.interactWith);
    if (!ent) return;
    if (!r.target) r.target = { x: ent.x, y: ent.y };
    else {
      r.target.x = ent.x;
      r.target.y = ent.y;
    }
  }

  private pickTaskEntity(
    kinds: NonNullable<WorldEntity["interact"]>[]
  ): WorldEntity | undefined {
    const pool = this.entities.filter((e) => kinds.includes(e.interact!));
    if (!pool.length) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private updateRascal(r: Rascal, dt: number) {
    r.poseTimer = Math.max(0, r.poseTimer - dt);
    r.bounce = Math.max(0, r.bounce - dt);
    r.squash += (1 - r.squash) * Math.min(1, dt * 8);
    if (r.held) return;

    // While walking/working toward a station, chase its current coords
    if (r.interactWith && (r.state === "WANDER_PATH" || r.state === "GATHER_OR_FARM" || r.state === "USE_PROP")) {
      this.syncAiTargetToEntity(r);
    }

    if (r.level >= 5 && r.poseTimer <= 0 && Math.random() < dt * 0.02) {
      r.pose = POSE.crown;
      r.poseTimer = 1.5;
    }

    if (r.state === "USE_PROP" || r.state === "SOCIAL_EMOTE" || r.state === "TRIP") {
      if (r.poseTimer <= 0) {
        r.state = "WANDER_PATH";
        r.interactWith = null;
        r.socialWith = null;
        r.target = null;
      }
      return;
    }

    if (r.state === "GATHER_OR_FARM") {
      if (r.poseTimer <= 0) {
        r.state = "WANDER_PATH";
        r.interactWith = null;
        r.target = null;
        r.xp += 3;
        if (r.xp > r.level * 20) {
          r.level += 1;
          r.pose = POSE.crown;
          r.poseTimer = 1.5;
          this.burstNorm(r.x, r.y, "#e0b44a", 12);
        }
      }
      return;
    }

    // Chance to start gather / prop / building visit / social
    if (!r.target && Math.random() < dt * 0.35) {
      const roll = Math.random();
      if (roll < 0.22) {
        // CHOP_WOOD / PICK_BERRY / FARM_CROP / egg
        const prop = this.pickTaskEntity(["tree", "bush", "soil", "egg"]);
        if (prop) {
          r.target = { x: prop.x, y: prop.y };
          r.interactWith = prop.id;
          r.state = "WANDER_PATH";
        }
      } else if (roll < 0.42) {
        // TAKE_BATH / SLEEP_NEST / sit / eat
        const prop = this.pickTaskEntity(["tub", "bed", "bench", "campfire", "picnic"]);
        if (prop) {
          r.target = { x: prop.x, y: prop.y };
          r.interactWith = prop.id;
        }
      } else if (roll < 0.55) {
        // VISIT_BUILDING
        const bldg = this.pickTaskEntity(["building"]);
        if (bldg) {
          r.target = { x: bldg.x, y: bldg.y };
          r.interactWith = bldg.id;
        }
      } else if (roll < 0.65) {
        const friend = this.nearestRascal(r, 0.25);
        if (friend) r.target = { x: friend.x, y: friend.y };
      } else {
        const wander = this.clampOnIsland(
          0.2 + Math.random() * 0.6,
          0.2 + Math.random() * 0.55
        );
        r.target = wander;
      }
    }

    if (!r.target) {
      r.pose = POSE.walk;
      return;
    }

    const dx = r.target.x - r.x;
    const dy = r.target.y - r.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.random() < 0.02 ? 0.22 : 0.12;
    if (speed > 0.18 && Math.random() < dt * 0.4) {
      r.state = "TRIP";
      r.pose = POSE.trip;
      r.poseTimer = 0.8;
      r.target = null;
      return;
    }

    if (dist < 0.02) {
      const prop = this.entities.find((e) => e.id === r.interactWith);
      if (prop && ["tree", "bush", "soil", "egg"].includes(prop.interact || "")) {
        r.state = "GATHER_OR_FARM";
        r.pose = this.poseForInteract(prop.interact);
        r.poseTimer = 2 + Math.random();
        this.gainResourceFrom(prop);
      } else if (prop) {
        r.state = "USE_PROP";
        r.pose = this.poseForInteract(prop.interact);
        r.poseTimer = 2 + Math.random();
      } else {
        const friend = this.nearestRascal(r, 0.06);
        if (friend && friend.state === "WANDER_PATH") {
          r.state = "SOCIAL_EMOTE";
          friend.state = "SOCIAL_EMOTE";
          r.pose = POSE.wave;
          friend.pose = POSE.heart;
          r.poseTimer = 2;
          friend.poseTimer = 2;
        }
      }
      r.target = null;
      return;
    }

    r.x += (dx / dist) * speed * dt;
    r.y += (dy / dist) * speed * dt;
    const feet = this.clampOnIsland(r.x, r.y);
    r.x = feet.x;
    r.y = feet.y;
    r.facing = dx >= 0 ? 1 : -1;
    r.pose = speed > 0.18 ? POSE.dash : Math.sin(this.time * 8 + r.x * 10) > 0 ? POSE.walk : POSE.hop;
  }

  private nightTarget() {
    if (this.save.manualNight === true) return 1;
    if (this.save.manualNight === false) return 0;
    // 0 day → twilight → 1 night → back
    const t = this.save.dayNight;
    if (t < 0.35) return 0;
    if (t < 0.45) return (t - 0.35) / 0.1;
    if (t < 0.75) return 1;
    if (t < 0.85) return 1 - (t - 0.75) / 0.1;
    return 0;
  }

  private nightFactor() {
    return this.nightBlend;
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const island = this.save.activeIsland;
    const dayImg = this.textures.get(manifest.backdrops[island].day);
    const nightImg = this.textures.get(manifest.backdrops[island].night);
    const landImg = this.textures.get(manifest.lands[island].src);
    const night = this.nightFactor();

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // Sky (parallax slightly)
    const skyScale = Math.max(w / this.zoom / 1584, h / this.zoom / 672) * 1.15;
    const skyW = 1584 * skyScale;
    const skyH = 672 * skyScale;
    const skyX = -skyW / 2 + this.camX * 0.15;
    const skyY = -skyH / 2 + this.camY * 0.08 - 40;
    if (dayImg) ctx.drawImage(dayImg, skyX, skyY, skyW, skyH);
    if (nightImg && night > 0) {
      ctx.globalAlpha = night;
      ctx.drawImage(nightImg, skyX, skyY, skyW, skyH);
      ctx.globalAlpha = 1;
    }

    // Soft twilight tint
    if (night > 0.05 && night < 0.95) {
      ctx.fillStyle = `rgba(255, 170, 90, ${0.08 * Math.sin(night * Math.PI)})`;
      ctx.fillRect(skyX, skyY, skyW, skyH);
    }

    if (landImg) {
      ctx.drawImage(landImg, this.landX, this.landY, this.landW, this.landH);
    }

    // Y-sorted draw list
    type DrawItem =
      | { kind: "entity"; e: WorldEntity; y: number }
      | { kind: "rascal"; r: Rascal; y: number };
    const items: DrawItem[] = [
      ...this.entities.map((e) => ({
        kind: "entity" as const,
        e,
        y: landToScreen(e.x, e.y, this.landX, this.landY, this.landW, this.landH).y,
      })),
      ...this.rascals.map((r) => ({
        kind: "rascal" as const,
        r,
        y: landToScreen(r.x, r.y, this.landX, this.landY, this.landW, this.landH).y,
      })),
    ];
    items.sort((a, b) => a.y - b.y);

    for (const item of items) {
      if (item.kind === "entity") this.drawEntity(item.e, night);
      else this.drawRascal(item.r);
    }

    // Night light halos
    if (night > 0.2) {
      for (const e of this.entities) {
        if (
          e.spriteId.includes("lantern") ||
          e.spriteId.includes("campfire") ||
          e.spriteId.includes("bonfire") ||
          e.spriteId.includes("brazier") ||
          e.interact === "campfire"
        ) {
          const p = landToScreen(e.x, e.y, this.landX, this.landY, this.landW, this.landH);
          const g = ctx.createRadialGradient(p.x, p.y - 30, 4, p.x, p.y - 30, 120);
          g.addColorStop(0, `rgba(255, 210, 120, ${0.55 * night})`);
          g.addColorStop(0.45, `rgba(255, 170, 80, ${0.22 * night})`);
          g.addColorStop(1, "rgba(255, 180, 80, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 30, 120, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Fireflies
      if (night > 0.6) {
        for (let i = 0; i < 12; i++) {
          const fx = this.landX + ((Math.sin(this.time * 0.4 + i) * 0.5 + 0.5) * this.landW);
          const fy = this.landY + this.landH * (0.35 + (i % 5) * 0.08) + Math.sin(this.time + i) * 8;
          ctx.fillStyle = `rgba(200, 255, 160, ${0.35 + 0.35 * Math.sin(this.time * 3 + i)})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Particles in world space roughly
    for (const p of this.particles) {
      if (p.text) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.font = "bold 16px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Chimney / steam puffs
    for (const e of this.entities) {
      if (e.kind !== "building" && e.interact !== "tub") continue;
      if (Math.sin(this.time * 2 + e.x * 10) > 0.7) {
        const p = landToScreen(e.x, e.y, this.landX, this.landY, this.landW, this.landH);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = e.interact === "tub" ? "#cfefff" : "#dddddd";
        ctx.beginPath();
        ctx.ellipse(p.x + 10, p.y - 80 - (this.time % 2) * 20, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  private drawEntity(e: WorldEntity, night: number) {
    const spr = manifest.worldSprites[e.spriteId as keyof typeof manifest.worldSprites];
    if (!spr) return;
    const img = this.textures.get(spr.src);
    if (!img) return;
    const dragging = this.dragEntity === e;
    const hovering = this.decorateMode && this.hoverEntity === e && !dragging;
    const lift = dragging ? 6 : 0;
    const p = landToScreen(e.x, e.y, this.landX, this.landY, this.landW, this.landH);
    const dw = spr.w * e.scale;
    const dh = spr.h * e.scale;
    const drawY = p.y - lift;

    // Shadow (stays on ground while sprite lifts)
    this.ctx.fillStyle = `rgba(0,0,0,${0.22 + night * 0.1 + (dragging ? 0.08 : 0)})`;
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + 4, dw * 0.28 * (dragging ? 0.85 : 1), dh * 0.05, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Golden selection ring in decorate mode
    if (dragging || hovering) {
      this.ctx.strokeStyle = dragging
        ? "rgba(224, 180, 74, 0.95)"
        : "rgba(224, 180, 74, 0.55)";
      this.ctx.lineWidth = dragging ? 2.5 : 1.5;
      this.ctx.beginPath();
      this.ctx.ellipse(p.x, p.y + 2, Math.max(18, dw * 0.32), Math.max(8, dh * 0.06), 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.drawImage(img, p.x - dw / 2, drawY - dh, dw, dh);
  }

  private drawRascal(r: Rascal) {
    const pet = manifest.rascals.find((p) => p.id === r.petId);
    if (!pet?.atlas) return;
    const img = this.textures.get(pet.atlas);
    if (!img) return;
    const p = landToScreen(r.x, r.y, this.landX, this.landY, this.landW, this.landH);
    const frame = Math.max(0, Math.min(26, r.pose | 0));
    const col = frame % 3;
    const row = Math.floor(frame / 3);
    const fs = pet.frameSize || 160;
    const bounceY = r.bounce > 0 ? Math.sin(r.bounce * Math.PI) * -18 : 0;
    const scaleY = r.squash;
    const scaleX = 2 - r.squash;
    const size = 84; // ~12% smaller than 96 for more walking room at larger island scale

    this.ctx.fillStyle = "rgba(0,0,0,0.25)";
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + 4, size * 0.28, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.save();
    this.ctx.translate(p.x, p.y + bounceY);
    this.ctx.scale(r.facing * scaleX, scaleY);
    if (this.hoverRascal === r && !r.held) {
      this.ctx.scale(1.06, 1.06);
    }
    this.ctx.drawImage(
      img,
      col * fs,
      row * fs,
      fs,
      fs,
      -size / 2,
      -size,
      size,
      size
    );
    this.ctx.restore();
  }

  dismissGift() {
    this.giftMessage = null;
    this.emit();
  }
}
