import {
  DEFAULT_ZOOM,
  DRAGON_SIZE,
  EDGE_SCROLL_PX,
  EDGE_SCROLL_SPEED,
  ISLANDS,
  MAX_ZOOM,
  MIN_ZOOM,
  hubIsland,
  islandWalkEllipse,
  resolveActiveBridges,
  unlockNextIsland,
  unlockedIslands,
  type IslandDef,
  type ResolvedBridge,
} from "@/data/worldMap";
import { CLIPS, SHEET_SRC, facingScaleX } from "./dragonSheets";
import { findPath, pathLength } from "./astar";
import {
  nearestWalkable,
  rebuildWalkabilityGrid,
  type Pt,
  type WalkGridState,
} from "./walkGrid";

type Pulse = { x: number; y: number; life: number };

export type RtsHudState = {
  follow: boolean;
  islands: IslandDef[];
  canExpand: boolean;
};

type Listener = (s: RtsHudState) => void;

export class RtsEngine {
  viewport: HTMLElement;
  worldEl: HTMLElement;
  canvas: HTMLCanvasElement;
  minimap: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  miniCtx: CanvasRenderingContext2D;

  private sheets = new Map<string, HTMLImageElement>();
  private walk!: WalkGridState;
  private bridges: ResolvedBridge[] = [];

  camX = 2100;
  camY = 1000;
  zoom = DEFAULT_ZOOM;
  private targetCam: Pt | null = null;
  follow = false;

  private dragon: Pt = { x: 2100, y: 960 };
  private path: Pt[] = [];
  private pathI = 0;
  private movingRight = true;
  private anim: "idle" | "walk" | "run" = "idle";
  private frameCursor = 0;
  private frameT = 0;
  private selected = true;
  private pulses: Pulse[] = [];

  private raf = 0;
  private last = 0;
  private keys = new Set<string>();
  private edge = { l: false, r: false, t: false, b: false };
  private dragging = false;
  private dragLast = { x: 0, y: 0 };
  private spaceDown = false;
  private miniDrag = false;
  private listeners = new Set<Listener>();

  constructor(
    viewport: HTMLElement,
    worldEl: HTMLElement,
    canvas: HTMLCanvasElement,
    minimap: HTMLCanvasElement
  ) {
    this.viewport = viewport;
    this.worldEl = worldEl;
    this.canvas = canvas;
    this.minimap = minimap;
    const ctx = canvas.getContext("2d");
    const mctx = minimap.getContext("2d");
    if (!ctx || !mctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.miniCtx = mctx;
  }

  onHud(fn: Listener) {
    this.listeners.add(fn);
    fn(this.hudState());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.hudState();
    for (const fn of this.listeners) fn(s);
  }

  private hudState(): RtsHudState {
    return {
      follow: this.follow,
      islands: unlockedIslands().map((i) => ({ ...i })),
      canExpand: ISLANDS.some((i) => !i.unlocked),
    };
  }

  async start() {
    await this.loadSheets();
    this.rebuildWorld();
    const hub = hubIsland();
    this.camX = hub.x;
    this.camY = hub.y - 40;
    const e = islandWalkEllipse(hub);
    this.dragon = { x: e.cx, y: e.cy };
    this.resize();
    this.applyCamera();
    this.bind();
    this.emit();
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.drawMinimap();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.unbind();
  }

  private async loadSheets() {
    for (const id of ["move", "pickup"] as const) {
      const img = await loadImage(`${SHEET_SRC[id]}?v=768pack`);
      this.sheets.set(id, img);
    }
  }

  /** Rebuild bridges, walk grid, world element size from registry. */
  rebuildWorld() {
    this.bridges = resolveActiveBridges();
    this.walk = rebuildWalkabilityGrid(unlockedIslands(), this.bridges);
    const { bounds } = this.walk;
    this.worldEl.style.width = `${bounds.worldWidth}px`;
    this.worldEl.style.height = `${bounds.worldHeight}px`;
    // Offset world content so island world-coords map into the padded box
    this.worldEl.style.setProperty("--ox", `${-bounds.minX}px`);
    this.worldEl.style.setProperty("--oy", `${-bounds.minY}px`);
    this.clampCamera();
    this.applyCamera();
    this.emit();
  }

  focusIsland(id: string) {
    const island = unlockedIslands().find((i) => i.id === id);
    if (!island) return;
    this.follow = false;
    this.targetCam = { x: island.x, y: island.y };
    this.emit();
  }

  toggleFollow() {
    this.follow = !this.follow;
    this.targetCam = null;
    this.emit();
  }

  expandIsland() {
    const next = unlockNextIsland();
    if (!next) return;
    this.rebuildWorld();
    this.follow = false;
    this.targetCam = { x: next.x, y: next.y };
    this.emit();
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.minimap.width = 220 * dpr;
    this.minimap.height = 105 * dpr;
    this.miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clampCamera();
    this.applyCamera();
  };

  private bind() {
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    this.viewport.addEventListener("pointerleave", this.onPointerLeave);
    this.viewport.addEventListener("wheel", this.onWheel, { passive: false });
    this.minimap.addEventListener("pointerdown", this.onMiniDown);
    this.minimap.addEventListener("pointermove", this.onMiniMove);
    this.minimap.addEventListener("pointerup", this.onMiniUp);
  }

  private unbind() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.viewport.removeEventListener("pointermove", this.onPointerMove);
    this.viewport.removeEventListener("pointerdown", this.onPointerDown);
    this.viewport.removeEventListener("pointerup", this.onPointerUp);
    this.viewport.removeEventListener("pointerleave", this.onPointerLeave);
    this.viewport.removeEventListener("wheel", this.onWheel);
    this.minimap.removeEventListener("pointerdown", this.onMiniDown);
    this.minimap.removeEventListener("pointermove", this.onMiniMove);
    this.minimap.removeEventListener("pointerup", this.onMiniUp);
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    const k = ev.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      ev.preventDefault();
      this.keys.add(k);
      this.follow = false;
      this.targetCam = null;
    }
    if (ev.code === "Space") {
      this.spaceDown = true;
      ev.preventDefault();
    }
  };

  private onKeyUp = (ev: KeyboardEvent) => {
    this.keys.delete(ev.key.toLowerCase());
    if (ev.code === "Space") this.spaceDown = false;
  };

  private onPointerMove = (ev: PointerEvent) => {
    const rect = this.viewport.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const m = EDGE_SCROLL_PX;
    this.edge.l = sx < m;
    this.edge.r = sx > rect.width - m;
    this.edge.t = sy < m;
    this.edge.b = sy > rect.height - m;

    if (this.dragging) {
      const dx = ev.clientX - this.dragLast.x;
      const dy = ev.clientY - this.dragLast.y;
      this.dragLast = { x: ev.clientX, y: ev.clientY };
      this.camX -= dx / this.zoom;
      this.camY -= dy / this.zoom;
      this.follow = false;
      this.targetCam = null;
      this.clampCamera();
      this.applyCamera();
    }
  };

  private onPointerLeave = () => {
    this.edge = { l: false, r: false, t: false, b: false };
    this.dragging = false;
  };

  private onPointerDown = (ev: PointerEvent) => {
    if (ev.button === 1 || (ev.button === 0 && this.spaceDown)) {
      this.dragging = true;
      this.dragLast = { x: ev.clientX, y: ev.clientY };
      this.follow = false;
      this.targetCam = null;
      this.viewport.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button === 0 || ev.button === 2) {
      ev.preventDefault();
      const world = this.screenToWorld(ev.clientX, ev.clientY);
      this.issueMoveOrder(world.x, world.y);
    }
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const before = this.screenToWorld(ev.clientX, ev.clientY);
    const factor = Math.exp(-ev.deltaY * 0.0011);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    // Anchor toward cursor
    const afterX = this.camX + (sx - rect.width / 2) / this.zoom;
    const afterY = this.camY + (sy - rect.height / 2) / this.zoom;
    this.camX += before.x - afterX;
    this.camY += before.y - afterY;
    this.clampCamera();
    this.applyCamera();
  };

  private onMiniDown = (ev: PointerEvent) => {
    this.miniDrag = true;
    this.minimap.setPointerCapture(ev.pointerId);
    this.jumpFromMinimap(ev);
  };
  private onMiniMove = (ev: PointerEvent) => {
    if (this.miniDrag) this.jumpFromMinimap(ev);
  };
  private onMiniUp = () => {
    this.miniDrag = false;
  };

  private jumpFromMinimap(ev: PointerEvent) {
    const rect = this.minimap.getBoundingClientRect();
    const u = (ev.clientX - rect.left) / rect.width;
    const v = (ev.clientY - rect.top) / rect.height;
    const b = this.walk.bounds;
    this.camX = b.minX + u * b.worldWidth;
    this.camY = b.minY + v * b.worldHeight;
    this.follow = false;
    this.targetCam = null;
    this.clampCamera();
    this.applyCamera();
    this.emit();
  }

  private issueMoveOrder(wx: number, wy: number) {
    const goal = nearestWalkable(this.walk, wx, wy);
    this.pulses.push({ x: goal.x, y: goal.y, life: 0.45 });
    const path = findPath(this.walk, this.dragon, goal);
    if (!path.length) return;
    this.path = path;
    this.pathI = 0;
    const len = pathLength(path);
    this.anim = len > 280 ? "run" : "walk";
    this.frameCursor = 0;
    this.frameT = 0;
    this.selected = true;
  }

  private screenToWorld(clientX: number, clientY: number): Pt {
    const rect = this.viewport.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: this.camX + (sx - rect.width / 2) / this.zoom,
      y: this.camY + (sy - rect.height / 2) / this.zoom,
    };
  }

  private worldToScreen(wx: number, wy: number) {
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    return {
      x: w / 2 + (wx - this.camX) * this.zoom,
      y: h / 2 + (wy - this.camY) * this.zoom,
    };
  }

  private clampCamera() {
    const b = this.walk.bounds;
    const vw = this.viewport.clientWidth / this.zoom;
    const vh = this.viewport.clientHeight / this.zoom;
    const halfW = vw / 2;
    const halfH = vh / 2;
    if (vw >= b.worldWidth) this.camX = b.minX + b.worldWidth / 2;
    else this.camX = Math.min(b.maxX - halfW, Math.max(b.minX + halfW, this.camX));
    if (vh >= b.worldHeight) this.camY = b.minY + b.worldHeight / 2;
    else this.camY = Math.min(b.maxY - halfH, Math.max(b.minY + halfH, this.camY));
  }

  private applyCamera() {
    const b = this.walk.bounds;
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    // World element is sized to bounds; content shifted by --ox/--oy
    const tx = w / 2 - (this.camX - b.minX) * this.zoom;
    const ty = h / 2 - (this.camY - b.minY) * this.zoom;
    this.worldEl.style.transform = `translate(${tx}px, ${ty}px) scale(${this.zoom})`;
    // Parallax sky
    const sky = this.viewport.querySelector(".sky-parallax") as HTMLElement | null;
    if (sky) {
      const px = -((this.camX - b.minX) / b.worldWidth) * 40;
      const py = -((this.camY - b.minY) / b.worldHeight) * 24;
      sky.style.transform = `translate(${px}px, ${py}px) scale(1.08)`;
    }
  }

  private update(dt: number) {
    // Keyboard pan
    let kx = 0;
    let ky = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) kx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) kx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) ky -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) ky += 1;
    if (kx || ky) {
      const sp = (EDGE_SCROLL_SPEED / this.zoom) * dt;
      const len = Math.hypot(kx, ky) || 1;
      this.camX += (kx / len) * sp;
      this.camY += (ky / len) * sp;
      this.clampCamera();
      this.applyCamera();
    }

    // Edge scroll
    if (!this.dragging) {
      const sp = (EDGE_SCROLL_SPEED / this.zoom) * dt;
      if (this.edge.l) this.camX -= sp;
      if (this.edge.r) this.camX += sp;
      if (this.edge.t) this.camY -= sp;
      if (this.edge.b) this.camY += sp;
      if (this.edge.l || this.edge.r || this.edge.t || this.edge.b) {
        this.follow = false;
        this.targetCam = null;
        this.clampCamera();
        this.applyCamera();
      }
    }

    // Smooth focus glide
    if (this.targetCam) {
      const k = Math.min(1, dt * 5);
      this.camX += (this.targetCam.x - this.camX) * k;
      this.camY += (this.targetCam.y - this.camY) * k;
      if (Math.hypot(this.targetCam.x - this.camX, this.targetCam.y - this.camY) < 8) {
        this.targetCam = null;
      }
      this.clampCamera();
      this.applyCamera();
    }

    if (this.follow) {
      this.camX += (this.dragon.x - this.camX) * Math.min(1, dt * 6);
      this.camY += (this.dragon.y - this.camY) * Math.min(1, dt * 6);
      this.clampCamera();
      this.applyCamera();
    }

    // Dragon path follow
    if (this.path.length && this.pathI < this.path.length) {
      const dest = this.path[this.pathI];
      const dx = dest.x - this.dragon.x;
      const dy = dest.y - this.dragon.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 5) {
        this.pathI++;
        if (this.pathI >= this.path.length) {
          this.path = [];
          this.anim = "idle";
          this.frameCursor = 0;
        }
      } else {
        if (Math.abs(dx) > 0.4) this.movingRight = dx > 0;
        const speed = this.anim === "run" ? 260 : 150;
        const step = Math.min(dist, speed * dt);
        this.dragon.x += (dx / dist) * step;
        this.dragon.y += (dy / dist) * step;
      }
    }

    // Anim frames
    const clip = CLIPS[this.anim === "idle" ? "idle" : this.anim === "run" ? "run" : "walk"];
    this.frameT += dt;
    const step = 1 / clip.fps;
    while (this.frameT >= step) {
      this.frameT -= step;
      this.frameCursor = (this.frameCursor + 1) % clip.frames.length;
    }

    for (const p of this.pulses) p.life -= dt;
    this.pulses = this.pulses.filter((p) => p.life > 0);
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Selection ring
    if (this.selected) {
      const s = this.worldToScreen(this.dragon.x, this.dragon.y);
      ctx.strokeStyle = "rgba(80, 220, 90, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 4, 22 * this.zoom, 10 * this.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(120, 255, 140, 0.35)";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 4, 28 * this.zoom, 13 * this.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ground-target pulses
    for (const p of this.pulses) {
      const s = this.worldToScreen(p.x, p.y);
      const t = 1 - p.life / 0.45;
      ctx.strokeStyle = `rgba(90, 230, 110, ${1 - t})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, (14 + t * 28) * this.zoom, (7 + t * 14) * this.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Dragon
    const clip =
      this.anim === "idle" ? CLIPS.idle : this.anim === "run" ? CLIPS.run : CLIPS.walk;
    const sheetId = clip.sheet;
    const img = this.sheets.get(sheetId);
    if (!img) return;
    const frameW = img.naturalWidth / 3;
    const frameH = img.naturalHeight / 3;
    const frame = clip.frames[this.frameCursor % clip.frames.length];
    const col = frame % 3;
    const row = Math.floor(frame / 3);
    const s = this.worldToScreen(this.dragon.x, this.dragon.y);
    const dw = DRAGON_SIZE * this.zoom;
    const dh = DRAGON_SIZE * this.zoom;
    const scaleX = facingScaleX(clip.nativeFacing, this.movingRight);

    ctx.fillStyle = "rgba(15, 25, 15, 0.3)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 3, dw * 0.28, Math.max(4, dh * 0.06), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(scaleX, 1);
    ctx.drawImage(
      img,
      col * frameW,
      row * frameH,
      frameW,
      frameH,
      -dw / 2,
      -dh * 0.92,
      dw,
      dh
    );
    ctx.restore();
  }

  private drawMinimap() {
    const ctx = this.miniCtx;
    const mw = 220;
    const mh = 105;
    const b = this.walk.bounds;
    ctx.clearRect(0, 0, mw, mh);
    ctx.fillStyle = "rgba(12, 20, 32, 0.82)";
    ctx.fillRect(0, 0, mw, mh);
    ctx.strokeStyle = "rgba(224, 180, 74, 0.45)";
    ctx.strokeRect(0.5, 0.5, mw - 1, mh - 1);

    const sx = (x: number) => ((x - b.minX) / b.worldWidth) * mw;
    const sy = (y: number) => ((y - b.minY) / b.worldHeight) * mh;

    // Islands
    for (const i of unlockedIslands()) {
      const e = islandWalkEllipse(i);
      ctx.fillStyle =
        i.role === "hub"
          ? "rgba(120, 190, 110, 0.85)"
          : i.role === "farm"
            ? "rgba(150, 200, 90, 0.8)"
            : i.role === "quarry"
              ? "rgba(140, 170, 200, 0.8)"
              : i.role === "magic"
                ? "rgba(170, 130, 220, 0.8)"
                : "rgba(100, 170, 190, 0.8)";
      ctx.beginPath();
      ctx.ellipse(sx(e.cx), sy(e.cy), (e.rx / b.worldWidth) * mw, (e.ry / b.worldHeight) * mh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bridges
    ctx.strokeStyle = "rgba(180, 140, 80, 0.9)";
    ctx.lineWidth = 2;
    for (const br of this.bridges) {
      ctx.beginPath();
      ctx.moveTo(sx(br.x1), sy(br.y1));
      ctx.lineTo(sx(br.x2), sy(br.y2));
      ctx.stroke();
    }

    // Camera rect
    const vw = this.viewport.clientWidth / this.zoom;
    const vh = this.viewport.clientHeight / this.zoom;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      sx(this.camX - vw / 2),
      sy(this.camY - vh / 2),
      (vw / b.worldWidth) * mw,
      (vh / b.worldHeight) * mh
    );

    // Dragon
    ctx.fillStyle = "#4da3ff";
    ctx.beginPath();
    ctx.arc(sx(this.dragon.x), sy(this.dragon.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed ${src}`));
    img.src = src;
  });
}
