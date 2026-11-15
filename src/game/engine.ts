import manifest from "@/data/assetManifest.json";
import { CozyAudio } from "./audio";
import { buildIslandEntities, landToScreen, ISO_Y } from "./layouts";
import { Pose, poseFromVelocity } from "./poses";
import { loadSave, writeSave, canAfford, spend, UPGRADE_COSTS, NEXT_ISLAND } from "./save";
import { TextureManager } from "./textures";
import { clampToWalkBounds } from "./walkBounds";
import type {
  GameSave,
  IslandId,
  Particle,
  Rascal,
  RascalTask,
  WorldEntity,
} from "./types";
import { ISLAND_ORDER } from "./types";

type Listener = () => void;

function freshRascal(
  id: string,
  petId: string,
  x: number,
  y: number,
  xp = 0,
  level = 1
): Rascal {
  return {
    id,
    petId,
    x,
    y,
    vx: 0,
    vy: 0,
    state: "WANDER_PATH",
    pose: Pose.IDLE,
    poseTimer: 0,
    facing: 1,
    target: null,
    interactWith: null,
    socialWith: null,
    task: null,
    taskStep: 0,
    poseChain: [],
    sprint: false,
    shake: 0,
    hidePropId: null,
    squash: 1,
    held: false,
    xp,
    level,
    bounce: 0,
  };
}

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

  /** Land texture pixel size (pre-isometric flatten). */
  landTexW = 2048;
  landTexH = 868;
  /** Display size at true 1:1 native aspect (islandScaleY === islandScaleX). */
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
  /** Distinguish click-cheer vs grab-hold. */
  pointerDownAt = 0;
  pointerDownNorm = { x: 0, y: 0 };
  heldMoved = false;

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
        this.spawnPet(decoded.pet, 0.5, 0.43);
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
    this.landTexW = land.w;
    this.landTexH = land.h;
    this.landW = land.w;
    this.landH = land.h * ISO_Y;
    this.recomputeZoomLimits();
  }

  reloadIsland() {
    const island = this.save.activeIsland;
    const prog = this.save.islands[island];
    const overrides = this.save.layoutOverrides?.[island] ?? {};
    this.entities = buildIslandEntities(manifest, island, prog, overrides);
    this.rascals = (this.save.spawned[island] || []).map((s, i) =>
      freshRascal(`${island}-rascal-${i}-${s.petId}`, s.petId, s.x, s.y, s.xp, s.level)
    );
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

  spawnPet(petId: string, x = 0.5, y = 0.43) {
    const island = this.save.activeIsland;
    const r = freshRascal(`${island}-rascal-${Date.now()}`, petId, x, y);
    r.pose = Pose.WAVE_HELLO;
    r.poseTimer = 1.2;
    r.bounce = 0.4;
    this.rascals.push(r);
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
   * Fit the full oval island (incl. waterfalls / orbiting islets) inside ~80% of
   * the viewport on both axes — balanced sky breathing room all around.
   */
  private computeFitZoom() {
    const w = Math.max(320, this.canvas.clientWidth || 1280);
    const h = Math.max(240, this.canvas.clientHeight || 720);
    return Math.min(
      (w * 0.8) / Math.max(1, this.landW),
      (h * 0.8) / Math.max(1, this.landH)
    );
  }

  private recomputeZoomLimits() {
    const fit = this.computeFitZoom();
    // 1.0x = 80% framed island (minZoom floor); close-ups up to 2.2x
    this.minZoom = fit;
    this.maxZoom = fit * 2.2;
    this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom || fit));
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom || fit));
  }

  /** Apply default framing once land size is known (first load / island switch). */
  frameIsland() {
    this.recomputeZoomLimits();
    const fit = this.computeFitZoom();
    this.targetZoom = fit;
    this.zoom = fit;
    // Center on the open oval plateau (≈ UV 0.5, 0.43)
    this.landX = -this.landW / 2;
    this.landY = -this.landH / 2;
    this.camX = this.landX + this.landW * 0.5;
    this.camY = this.landY + this.landH * 0.43;
    this.clampCamera();
  }

  /**
   * Keep the floating island comfortably inside the viewport at the current zoom.
   * When the view is larger than the island, lock to center; otherwise clamp so
   * the land AABB cannot be dragged fully off-screen.
   */
  private clampCamera() {
    const viewW = Math.max(320, this.canvas.clientWidth || 1280) / Math.max(0.01, this.zoom);
    const viewH = Math.max(240, this.canvas.clientHeight || 720) / Math.max(0.01, this.zoom);
    const slackX = Math.min(viewW * 0.12, this.landW * 0.08);
    const slackY = Math.min(viewH * 0.12, this.landH * 0.08);
    const cx = this.landX + this.landW / 2;
    const cy = this.landY + this.landH / 2;

    if (viewW >= this.landW - slackX * 2) {
      this.camX = cx;
    } else {
      const minX = this.landX + viewW / 2 - slackX;
      const maxX = this.landX + this.landW - viewW / 2 + slackX;
      this.camX = Math.min(maxX, Math.max(minX, this.camX));
    }

    if (viewH >= this.landH - slackY * 2) {
      this.camY = cy;
    } else {
      const minY = this.landY + viewH / 2 - slackY;
      const maxY = this.landY + this.landH - viewH / 2 + slackY;
      this.camY = Math.min(maxY, Math.max(minY, this.camY));
    }
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
    this.spawnPet(pick.id, 0.5, 0.43);
    this.burst(0.5, 0.43, "#7dcea0", 14);
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
        this.dragging = false; // decorate item drag never pans the camera
        this.canvas.classList.remove("dragging");
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
      this.pointerDownAt = performance.now();
      this.pointerDownNorm = { x: n.x, y: n.y };
      this.heldMoved = false;
      rascal.held = true;
      rascal.state = "HELD";
      rascal.shake = 0;
      rascal.pose = Pose.CROUCH;
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
      const prevX = this.heldRascal.x;
      const prevY = this.heldRascal.y;
      this.heldRascal.x = n.x;
      this.heldRascal.y = n.y;
      const move = Math.hypot(n.x - prevX, n.y - prevY);
      if (move > 0.004) this.heldMoved = true;
      // Shake accumulation while held mid-air
      this.heldRascal.shake += move * 18;
      if (this.heldRascal.shake > 0.35) {
        this.heldRascal.pose = Pose.SURPRISED;
      }
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
    if (this.dragging && !this.dragEntity && !this.heldRascal) {
      const dx = sx - this.dragLast.x;
      const dy = sy - this.dragLast.y;
      this.camX -= dx / this.zoom;
      this.camY -= dy / this.zoom;
      this.clampCamera();
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

      const elapsed = performance.now() - this.pointerDownAt;
      const travel = Math.hypot(r.x - this.pointerDownNorm.x, r.y - this.pointerDownNorm.y);
      const wasClick = elapsed < 220 && travel < 0.03 && !this.heldMoved;

      if (wasClick) {
        // Click cheer: CROUCH → JUMP_CHEER → CELEBRATE
        this.startPoseChain(r, [Pose.CROUCH, Pose.JUMP_CHEER, Pose.CELEBRATE], "click", 0.45);
        this.audio.chirp();
      } else if (r.shake > 0.8) {
        // Shaken in mid-air → dizzy on landing
        this.startPoseChain(r, [Pose.DIZZY_STARS, Pose.SHY], "trip_recover", 0.7);
        this.audio.pop();
      } else {
        const prop = this.nearestInteractable(r.x, r.y, 0.08);
        const friend = this.nearestRascal(r, 0.07);
        if (prop) {
          this.beginStationVisit(r, prop, true);
        } else if (friend) {
          this.beginSocial(r, friend);
        } else {
          r.state = "WANDER_PATH";
          r.target = null;
          r.task = null;
          r.sprint = true; // rush after being dropped
        }
      }
      r.shake = 0;
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
    this.clampCamera();
  };

  private findLandmark(kind: "barn" | "kitchen" | "clubhouse") {
    return this.entities.find((e) => e.interact === kind) ?? null;
  }

  private startPoseChain(
    r: Rascal,
    poses: number[],
    task: RascalTask,
    stepSec: number
  ) {
    r.state = "POSE_CHAIN";
    r.task = task;
    r.poseChain = [...poses];
    r.pose = poses[0];
    r.poseTimer = stepSec;
    r.target = null;
    r.sprint = false;
  }

  private beginSocial(a: Rascal, b: Rascal) {
    a.state = "SOCIAL_EMOTE";
    b.state = "SOCIAL_EMOTE";
    a.socialWith = b.id;
    b.socialWith = a.id;
    a.task = "social";
    b.task = "social";
    const useHeart = Math.random() < 0.5;
    a.pose = useHeart ? Pose.HEART_EYES : Pose.WAVE_HELLO;
    b.pose = useHeart ? Pose.WAVE_HELLO : Pose.HEART_EYES;
    a.poseTimer = 1.8;
    b.poseTimer = 1.8;
    a.target = null;
    b.target = null;
    this.audio.chirp();
  }

  private beginStationVisit(r: Rascal, prop: WorldEntity, fromDrop: boolean) {
    r.interactWith = prop.id;
    r.sprint = fromDrop;
    r.target = { x: prop.x, y: prop.y };
    r.state = "WANDER_PATH";
    const kind = prop.interact;
    if (kind === "soil") r.task = "farm";
    else if (kind === "bush") r.task = "bush";
    else if (kind === "tree") r.task = "tree";
    else if (kind === "kitchen") r.task = "cook";
    else if (kind === "tub") r.task = "bath";
    else if (kind === "bed" || kind === "clubhouse") r.task = "sleep";
    else if (kind === "bench" || kind === "campfire" || kind === "picnic") r.task = "eat";
    else r.task = null;
    r.taskStep = 0;
    if (kind === "tub") this.audio.splash();
    else if (kind === "tree") this.audio.chop();
    else this.audio.chirp();
  }

  private clearHideProp(r: Rascal) {
    if (!r.hidePropId) return;
    const e = this.entities.find((x) => x.id === r.hidePropId);
    if (e) e.hidden = false;
    r.hidePropId = null;
  }

  private nearestInteractable(x: number, y: number, radius: number) {
    let best: WorldEntity | null = null;
    let bestD = radius;
    for (const e of this.entities) {
      if (!e.interact || e.hidden) continue;
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
      if (r === self || r.held) continue;
      if (r.state === "SOCIAL_EMOTE" || r.state === "HELD") continue;
      const d = Math.hypot(r.x - self.x, r.y - self.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private award(resource: "wood" | "berries" | "crops" | "gems", nx: number, ny: number) {
    const labels = { wood: "+1 Wood", berries: "+1 Berries", crops: "+1 Crop", gems: "+1 Gem" };
    this.save.resources[resource] += 1;
    this.floatText(nx, ny, labels[resource]);
    writeSave(this.save);
    this.emit();
  }

  private choreParticles(r: Rascal, kind: RascalTask) {
    const p = landToScreen(r.x, r.y, this.landX, this.landY, this.landW, this.landH);
    if (kind === "cook") {
      this.burst(p.x, p.y - 50, "rgba(220,220,220,0.9)", 4);
    } else if (kind === "sweep") {
      this.burst(p.x, p.y - 10, "#8fbc6a", 5);
    } else if (kind === "bath") {
      this.burst(p.x, p.y - 20, "#9fdfff", 8);
    } else if (kind === "sleep") {
      this.particles.push({
        x: p.x + 12,
        y: p.y - 40,
        vx: 8,
        vy: -18,
        life: 1.4,
        maxLife: 1.4,
        color: "#dce6f5",
        size: 12,
        text: "Zzz",
      });
    } else if (kind === "eat") {
      this.burst(p.x, p.y - 30, "#e0b44a", 5);
    } else if (kind === "farm") {
      this.burst(p.x, p.y - 15, "#c4a574", 4);
    }
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
    this.bob = Math.sin(this.time * 0.7) * 8;
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 8);
    // Keep min/max in sync with viewport size without resetting the player's zoom
    {
      const fit = this.computeFitZoom();
      this.minZoom = fit;
      this.maxZoom = fit * 2.2;
      this.targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.targetZoom));
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    }

    // Day/night cycle ~90s full day unless manual
    if (this.save.manualNight === null) {
      this.save.dayNight = (this.save.dayNight + dt / 90) % 1;
    }
    const nightTarget = this.nightTarget();
    // Snappy but smooth cross-fade (~0.35s)
    this.nightBlend += (nightTarget - this.nightBlend) * Math.min(1, dt * 6);

    this.landX = -this.landW / 2;
    this.landY = -this.landH / 2 + this.bob;
    this.clampCamera();

    for (const r of this.rascals) this.updateRascal(r, dt);

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Passive income trickle from active chore workers
    if (Math.random() < dt * 0.06) {
      const workers = this.rascals.filter(
        (r) => r.state === "CHORE" || r.state === "HAUL"
      );
      if (workers.length && Math.random() < 0.25) {
        const w = workers[0];
        if (w.task === "bush") this.award("berries", w.x, w.y);
        else if (w.task === "tree") this.award("wood", w.x, w.y);
        else if (w.task === "farm") this.award("crops", w.x, w.y);
      }
    }
  }

  /** Keep AI pathfinding locked to the entity's live decorate position. */
  private syncAiTargetToEntity(r: Rascal) {
    if (!r.interactWith) return;
    const ent = this.entities.find((e) => e.id === r.interactWith);
    if (!ent || ent.hidden) return;
    if (!r.target) r.target = { x: ent.x, y: ent.y };
    else {
      r.target.x = ent.x;
      r.target.y = ent.y;
    }
  }

  private pickTaskEntity(
    kinds: NonNullable<WorldEntity["interact"]>[]
  ): WorldEntity | undefined {
    const pool = this.entities.filter((e) => e.interact && kinds.includes(e.interact) && !e.hidden);
    if (!pool.length) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private gainXp(r: Rascal, amount: number) {
    r.xp += amount;
    if (r.xp > r.level * 20) {
      r.level += 1;
      this.startPoseChain(r, [Pose.CELEBRATE, Pose.JUMP_CHEER], "click", 0.55);
      this.burstNorm(r.x, r.y, "#e0b44a", 12);
    }
  }

  private finishIdle(r: Rascal) {
    this.clearHideProp(r);
    r.state = "WANDER_PATH";
    r.interactWith = null;
    r.socialWith = null;
    r.task = null;
    r.taskStep = 0;
    r.target = null;
    r.sprint = false;
    r.poseChain = [];
    r.pose = Pose.IDLE;
  }

  private onArriveAtStation(r: Rascal) {
    const prop = this.entities.find((e) => e.id === r.interactWith);
    if (!prop) {
      // Social meetup?
      const friend = this.nearestRascal(r, 0.06);
      if (friend && friend.state === "WANDER_PATH") this.beginSocial(r, friend);
      else this.finishIdle(r);
      return;
    }

    if (r.task === "farm" && prop.interact === "soil") {
      r.state = "CHORE";
      r.taskStep = 0;
      r.pose = Pose.DIGGING;
      r.poseTimer = 1.6;
      prop.cropStage = 1;
      this.choreParticles(r, "farm");
      return;
    }
    if (r.task === "bush" && prop.interact === "bush") {
      r.state = "CHORE";
      r.taskStep = 0;
      r.pose = Pose.CARRY_BERRIES;
      r.poseTimer = 0.9;
      return;
    }
    if (r.task === "tree" && prop.interact === "tree") {
      r.state = "CHORE";
      r.taskStep = 0;
      r.pose = Pose.CARRY_LOGS;
      r.poseTimer = 0.9;
      this.audio.chop();
      return;
    }
    if (r.task === "cook" || prop.interact === "kitchen") {
      r.state = "CHORE";
      r.task = "cook";
      r.pose = Pose.COOKING;
      r.poseTimer = 2.4;
      this.choreParticles(r, "cook");
      return;
    }
    if (r.task === "bath" || prop.interact === "tub") {
      r.state = "CHORE";
      r.task = "bath";
      r.pose = Pose.BATHING;
      r.poseTimer = 2.6;
      prop.hidden = true;
      r.hidePropId = prop.id;
      this.audio.splash();
      this.choreParticles(r, "bath");
      return;
    }
    if (r.task === "sleep" || prop.interact === "bed" || prop.interact === "clubhouse") {
      r.state = "CHORE";
      r.task = "sleep";
      r.pose = Pose.SLEEPING;
      r.poseTimer = 3.0;
      this.choreParticles(r, "sleep");
      return;
    }
    if (r.task === "eat" || prop.interact === "bench" || prop.interact === "campfire" || prop.interact === "picnic") {
      r.state = "CHORE";
      r.task = "eat";
      r.taskStep = 0;
      r.pose = Pose.EAT_BERRY;
      r.poseTimer = 1.6;
      this.choreParticles(r, "eat");
      return;
    }
    if (prop.interact === "egg") {
      r.state = "CHORE";
      r.pose = Pose.SURPRISED;
      r.poseTimer = 1.2;
      this.award("gems", prop.x, prop.y);
      return;
    }
    if (prop.interact === "barn") {
      r.state = "CHORE";
      r.pose = Pose.WIPE_SWEAT;
      r.poseTimer = 1.2;
      return;
    }
    // Generic building visit
    r.state = "CHORE";
    r.pose = Pose.WAVE_HELLO;
    r.poseTimer = 1.4;
  }

  private advanceChore(r: Rascal, dt: number) {
    if (Math.random() < dt * 1.2) this.choreParticles(r, r.task);
    if (r.poseTimer > 0) return;

    if (r.task === "farm") {
      const soil = this.entities.find((e) => e.id === r.interactWith);
      if (r.taskStep === 0) {
        // Digging done → watering
        if (soil) soil.cropStage = 2;
        r.taskStep = 1;
        r.pose = Pose.WATERING;
        r.poseTimer = 1.5;
        this.choreParticles(r, "farm");
        return;
      }
      if (r.taskStep === 1) {
        // Watered → ripe, haul crop to barn
        if (soil) soil.cropStage = 3;
        const barn = this.findLandmark("barn");
        r.taskStep = 2;
        r.state = "HAUL";
        r.pose = Pose.CARRY_BERRIES;
        r.interactWith = barn?.id ?? null;
        r.target = barn ? { x: barn.x, y: barn.y } : null;
        r.sprint = false;
        if (!barn) {
          this.award("crops", r.x, r.y);
          this.gainXp(r, 3);
          this.finishIdle(r);
        }
        return;
      }
    }

    if (r.task === "bush" || r.task === "tree") {
      const barn = this.findLandmark("barn");
      r.state = "HAUL";
      r.pose = r.task === "bush" ? Pose.CARRY_BERRIES : Pose.CARRY_LOGS;
      r.interactWith = barn?.id ?? null;
      r.target = barn ? { x: barn.x, y: barn.y } : null;
      if (!barn) {
        this.award(r.task === "bush" ? "berries" : "wood", r.x, r.y);
        r.pose = Pose.WIPE_SWEAT;
        r.poseTimer = 1.1;
        r.state = "CHORE";
        r.taskStep = 99;
      }
      return;
    }

    if (r.task === "eat") {
      if (r.taskStep === 0) {
        r.taskStep = 1;
        r.pose = Math.random() < 0.5 ? Pose.LAUGH : Pose.HAPPY_DANCE;
        r.poseTimer = 1.4;
        return;
      }
      this.gainXp(r, 2);
      this.finishIdle(r);
      return;
    }

    if (r.taskStep === 99) {
      this.gainXp(r, 3);
      this.finishIdle(r);
      return;
    }

    if (r.task === "cook" || r.task === "bath" || r.task === "sleep" || r.task === "sweep") {
      this.gainXp(r, 2);
      this.finishIdle(r);
      return;
    }

    this.finishIdle(r);
  }

  private onArriveHaul(r: Rascal) {
    if (r.task === "bush") this.award("berries", r.x, r.y);
    else if (r.task === "tree") this.award("wood", r.x, r.y);
    else if (r.task === "farm") this.award("crops", r.x, r.y);
    r.state = "CHORE";
    r.pose = Pose.WIPE_SWEAT;
    r.poseTimer = 1.2;
    r.taskStep = 99;
    r.target = null;
    this.choreParticles(r, r.task);
  }

  private updateRascal(r: Rascal, dt: number) {
    r.poseTimer = Math.max(0, r.poseTimer - dt);
    r.bounce = Math.max(0, r.bounce - dt);
    r.squash += (1 - r.squash) * Math.min(1, dt * 8);
    if (r.held) return;

    if (r.state === "POSE_CHAIN") {
      if (r.poseTimer > 0) return;
      r.poseChain.shift();
      if (r.poseChain.length) {
        r.pose = r.poseChain[0];
        r.poseTimer = r.task === "trip_recover" ? 0.65 : 0.45;
        return;
      }
      this.finishIdle(r);
      return;
    }

    if (r.state === "SOCIAL_EMOTE" || r.state === "TRIP") {
      if (r.poseTimer <= 0) this.finishIdle(r);
      return;
    }

    if (r.state === "CHORE") {
      this.advanceChore(r, dt);
      return;
    }

    if (r.state === "HAUL" || r.state === "WANDER_PATH") {
      if (r.interactWith && r.state === "WANDER_PATH") this.syncAiTargetToEntity(r);
      if (r.interactWith && r.state === "HAUL") this.syncAiTargetToEntity(r);
    }

    // Pick a new task when idle
    if (r.state === "WANDER_PATH" && !r.target && Math.random() < dt * 0.38) {
      const roll = Math.random();
      if (roll < 0.18) {
        const soil = this.pickTaskEntity(["soil"]);
        if (soil) this.beginStationVisit(r, soil, false);
      } else if (roll < 0.32) {
        const bush = this.pickTaskEntity(["bush"]);
        if (bush) this.beginStationVisit(r, bush, false);
      } else if (roll < 0.44) {
        const tree = this.pickTaskEntity(["tree"]);
        if (tree) this.beginStationVisit(r, tree, false);
      } else if (roll < 0.54) {
        const kitchen = this.pickTaskEntity(["kitchen"]);
        if (kitchen) this.beginStationVisit(r, kitchen, false);
      } else if (roll < 0.64) {
        const prop = this.pickTaskEntity(["tub", "bed", "clubhouse"]);
        if (prop) this.beginStationVisit(r, prop, false);
      } else if (roll < 0.74) {
        const prop = this.pickTaskEntity(["bench", "campfire", "picnic"]);
        if (prop) this.beginStationVisit(r, prop, false);
      } else if (roll < 0.8) {
        // Sweep along paths
        r.task = "sweep";
        r.state = "CHORE";
        r.pose = Pose.SWEEPING;
        r.poseTimer = 1.8;
        this.choreParticles(r, "sweep");
      } else if (roll < 0.88) {
        const friend = this.nearestRascal(r, 0.28);
        if (friend) {
          r.target = { x: friend.x, y: friend.y };
          r.interactWith = null;
          r.task = "social";
        }
      } else {
        const wander = this.clampOnIsland(
          0.5 + (Math.random() - 0.5) * 0.6,
          0.43 + (Math.random() - 0.5) * 0.34
        );
        r.target = wander;
        r.task = null;
        r.interactWith = null;
      }
    }

    // Passing social wave
    if (r.state === "WANDER_PATH" && r.target && r.task !== "social") {
      const near = this.nearestRascal(r, 0.045);
      if (near && near.state === "WANDER_PATH" && Math.random() < dt * 0.15) {
        this.beginSocial(r, near);
        return;
      }
    }

    if (!r.target) {
      if (r.state === "WANDER_PATH") {
        r.vx = 0;
        r.vy = 0;
        r.pose = Pose.IDLE;
      }
      return;
    }

    const dx = r.target.x - r.x;
    const dy = r.target.y - r.y;
    const dist = Math.hypot(dx, dy);
    const sprinting = r.sprint || r.state === "HAUL" && dist > 0.12;
    const speed = sprinting ? 0.22 : 0.12;

    // 5% chance during sprint to trip → dizzy → shy
    if (sprinting && dist > 0.05 && Math.random() < dt * 0.05) {
      r.sprint = false;
      this.startPoseChain(
        r,
        [Pose.TRIP_FALL, Pose.DIZZY_STARS, Pose.SHY],
        "trip_recover",
        0.55
      );
      return;
    }

    if (dist < 0.022) {
      r.vx = 0;
      r.vy = 0;
      r.target = null;
      if (r.state === "HAUL") {
        this.onArriveHaul(r);
      } else if (r.task === "social") {
        const friend = this.nearestRascal(r, 0.08);
        if (friend) this.beginSocial(r, friend);
        else this.finishIdle(r);
      } else if (r.interactWith) {
        this.onArriveAtStation(r);
      } else {
        r.sprint = false;
        r.pose = Pose.IDLE;
      }
      return;
    }

    const stepX = (dx / dist) * speed * dt;
    const stepY = (dy / dist) * speed * dt * ISO_Y; // ISO_Y === 1 (native aspect)
    r.x += stepX;
    r.y += stepY;
    const feet = this.clampOnIsland(r.x, r.y);
    r.x = feet.x;
    r.y = feet.y;
    r.vx = stepX / Math.max(dt, 1e-4);
    r.vy = (stepY / Math.max(dt, 1e-4));

    if (r.state === "HAUL") {
      r.pose = r.task === "tree" ? Pose.CARRY_LOGS : Pose.CARRY_BERRIES;
      r.facing = dx >= 0 ? 1 : -1;
    } else {
      const gait = poseFromVelocity(r.vx, r.vy, sprinting);
      r.pose = gait.pose;
      r.facing = gait.facing;
    }
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

  /** Screen-space cover fill — sky never pans/zooms away to black void. */
  private drawSkyCover(
    dayImg: HTMLImageElement | null,
    nightImg: HTMLImageElement | null,
    night: number,
    w: number,
    h: number
  ) {
    const ctx = this.ctx;
    const cover = (img: HTMLImageElement) => {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };
    if (dayImg) cover(dayImg);
    if (nightImg && night > 0) {
      ctx.globalAlpha = night;
      cover(nightImg);
      ctx.globalAlpha = 1;
    }
    if (night > 0.05 && night < 0.95) {
      ctx.fillStyle = `rgba(255, 170, 90, ${0.08 * Math.sin(night * Math.PI)})`;
      ctx.fillRect(0, 0, w, h);
    }
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

    // Sky locked to viewport (screen space) — 100% cover, zero black edges
    this.drawSkyCover(dayImg, nightImg, night, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // Island at true 1:1 native aspect (no vertical squash)
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
    if (e.hidden) return;
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
    const size = 64; // ~24% smaller than 84 — roomy lawns on the wide island

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
