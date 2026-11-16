import {
  CLIPS,
  FARM_INTRO,
  SHEET_SRC,
  facingScaleX,
  type DragonAnim,
  type SheetId,
} from "./dragonSheets";

type Pt = { x: number; y: number };

const ALL_SHEETS = Object.keys(SHEET_SRC) as SheetId[];

export class SkyIslandEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private sheets = new Map<SheetId, HTMLImageElement>();
  private raf = 0;
  private last = 0;

  /** Dragon position in canvas/island-local pixels (origin top-left of canvas). */
  x = 0;
  y = 0;
  private target: Pt | null = null;
  private carrying = false;
  private anim: DragonAnim = "idle";
  private clip = CLIPS.idle;
  private frameCursor = 0;
  private frameT = 0;
  private movingRight = true;
  private introFarm = false;

  private dragging = false;
  private dragOffset = { x: 0, y: 0 };
  private pointerDownAt = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private heldMoved = false;
  private idleMoodTimer = 4 + Math.random() * 4;

  private drawW = 112;
  private drawH = 112;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  async start() {
    await this.loadSheets();
    this.resize();
    this.x = this.canvas.clientWidth * 0.5;
    this.y = this.canvas.clientHeight * 0.42;
    this.setAnim("idle");
    this.bind();
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
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
    this.unbind();
  }

  private async loadSheets() {
    await Promise.all(
      ALL_SHEETS.map(
        (id) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              this.sheets.set(id, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load ${SHEET_SRC[id]}`));
            // Cache-bust so freshly packed 768×768 sheets reload
            img.src = `${SHEET_SRC[id]}?v=768pack`;
          })
      )
    );
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(1.15, Math.max(0.75, w / 900));
    this.drawW = 112 * scale;
    this.drawH = 112 * scale;
    if (w > 10 && h > 10) this.clampToPlayable();
  };

  private setAnim(anim: DragonAnim, force = false) {
    if (!force && this.anim === anim) return;
    this.anim = anim;
    this.clip = anim === "farm" && this.introFarm ? FARM_INTRO : CLIPS[anim];
    this.frameCursor = 0;
    this.frameT = 0;
  }

  /** Public helpers for future HUD / chores. */
  playWork(kind: "chop" | "mine" | "dig" | "farm" | "cook") {
    this.target = null;
    this.carrying = false;
    if (kind === "farm") {
      this.introFarm = true;
      this.setAnim("farm", true);
      return;
    }
    if (kind === "cook") {
      this.setAnim("cookGather", true);
      return;
    }
    this.setAnim(kind, true);
  }

  toggleCarry() {
    this.carrying = !this.carrying;
    this.target = null;
    if (this.carrying) {
      // Standing carry pose = F2 (arms raised)
      this.setAnim("carryIdle", true);
    } else {
      this.setAnim("idle", true);
    }
  }

  private bind() {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointerleave", this.onUp);
    window.addEventListener("keydown", this.onKey);
  }

  private unbind() {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointerleave", this.onUp);
    window.removeEventListener("keydown", this.onKey);
  }

  private onKey = (ev: KeyboardEvent) => {
    const k = ev.key.toLowerCase();
    if (k === "1") this.playWork("chop");
    if (k === "2") this.playWork("mine");
    if (k === "3") this.playWork("dig");
    if (k === "4") this.playWork("farm");
    if (k === "5") this.playWork("cook");
    if (k === "c") this.toggleCarry();
    if (k === "e") this.setAnim("eat", true);
    if (k === "z") this.setAnim("sleep", true);
    if (k === "h") this.setAnim("hop", true);
  };

  private hitDragon(sx: number, sy: number) {
    return (
      Math.abs(sx - this.x) < this.drawW * 0.42 &&
      sy < this.y + 8 &&
      sy > this.y - this.drawH * 0.92
    );
  }

  private onDown = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    this.canvas.setPointerCapture(ev.pointerId);
    this.pointerDownAt = performance.now();
    this.pointerDownPos = { x: sx, y: sy };
    this.heldMoved = false;

    if (this.hitDragon(sx, sy)) {
      this.dragging = true;
      this.dragOffset = { x: sx - this.x, y: sy - this.y };
      this.target = null;
      this.setAnim("drag", true);
      return;
    }

    // Click-to-move on the island surface
    const p = this.clampPoint(sx, sy);
    this.target = p;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.carrying) {
      this.setAnim("carryWalk", true);
    } else {
      this.setAnim(dist > 220 ? "run" : "walk", true);
    }
  };

  private onMove = (ev: PointerEvent) => {
    if (!this.dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    this.x = sx - this.dragOffset.x;
    this.y = sy - this.dragOffset.y;
    this.clampToPlayable();
    if (Math.hypot(sx - this.pointerDownPos.x, sy - this.pointerDownPos.y) > 6) {
      this.heldMoved = true;
    }
  };

  private onUp = () => {
    if (this.dragging) {
      this.dragging = false;
      this.clampToPlayable();
      const elapsed = performance.now() - this.pointerDownAt;
      if (!this.heldMoved && elapsed < 220) {
        // Quick click on dragon → pet (unless carrying)
        this.setAnim(this.carrying ? "carryIdle" : "pet", true);
      } else {
        this.setAnim(this.carrying ? "carryIdle" : "placeWave", true);
      }
      return;
    }
  };

  private clampPoint(x: number, y: number): Pt {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Enlarged grass plateau matching the near-fullscreen island plate
    const cx = w * 0.5;
    const cy = h * 0.38;
    const rx = w * 0.44;
    const ry = h * 0.34;
    const dx = x - cx;
    const dy = y - cy;
    const e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (e <= 1) return { x, y };
    const s = Math.sqrt(1 / e);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  private clampToPlayable() {
    const p = this.clampPoint(this.x, this.y);
    this.x = p.x;
    this.y = p.y;
  }

  private update(dt: number) {
    if (this.dragging) {
      this.advanceFrames(dt);
      return;
    }

    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        this.x = this.target.x;
        this.y = this.target.y;
        this.target = null;
        // Carry mode holds F2 at rest; otherwise celebration hop
        this.setAnim(this.carrying ? "carryIdle" : "hop", true);
      } else {
        if (Math.abs(dx) > 0.5) this.movingRight = dx > 0;
        const sprint = this.anim === "run";
        const speed = (sprint ? 220 : 140) * (this.carrying ? 0.85 : 1);
        const step = Math.min(dist, speed * dt);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.clampToPlayable();
        if (this.carrying) {
          if (this.anim !== "carryWalk") this.setAnim("carryWalk", true);
        } else {
          const want: DragonAnim = dist > 180 ? "run" : "walk";
          if (this.anim !== want && (this.anim === "walk" || this.anim === "run")) {
            this.setAnim(want);
          }
        }
      }
    } else if (this.anim === "carryIdle") {
      // Stay in carry idle until the player moves or toggles C off
    } else if (
      this.anim === "idle" ||
      this.anim === "waddle" ||
      this.anim === "sleep"
    ) {
      this.idleMoodTimer -= dt;
      if (this.idleMoodTimer <= 0 && this.anim === "idle") {
        const roll = Math.random();
        if (roll < 0.35) this.setAnim("idleMood", true);
        else if (roll < 0.55) this.setAnim("waddle", true);
        else if (roll < 0.65) this.setAnim("hop", true);
        this.idleMoodTimer = 5 + Math.random() * 6;
      }
    }

    this.advanceFrames(dt);
  }

  private advanceFrames(dt: number) {
    const frames = this.clip.frames;
    if (!frames.length) return;
    this.frameT += dt;
    const step = 1 / Math.max(0.01, this.clip.fps);
    while (this.frameT >= step) {
      this.frameT -= step;
      if (this.frameCursor < frames.length - 1) {
        this.frameCursor++;
      } else if (this.clip.loop) {
        this.frameCursor = 0;
      } else {
        this.onClipEnd();
        break;
      }
    }
  }

  private onClipEnd() {
    if (this.anim === "farm" && this.introFarm) {
      this.introFarm = false;
      this.setAnim("farm", true);
      return;
    }
    if (this.anim === "cookGather") {
      this.setAnim("cook", true);
      return;
    }
    if (
      this.anim === "placeWave" ||
      this.anim === "pet" ||
      this.anim === "hop" ||
      this.anim === "idleMood" ||
      this.anim === "eat" ||
      this.anim === "waddle"
    ) {
      this.setAnim(this.carrying ? "carryIdle" : "idle", true);
      return;
    }
    // One-shot work clips stay on last frame until redirected
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const img = this.sheets.get(this.clip.sheet);
    if (!img) return;

    const frameW = img.naturalWidth / 3;
    const frameH = img.naturalHeight / 3;
    const frame = this.clip.frames[this.frameCursor] ?? this.clip.frames[0];
    const col = frame % 3;
    const row = Math.floor(frame / 3);
    const sx = col * frameW;
    const sy = row * frameH;

    const scaleX = facingScaleX(this.clip.nativeFacing, this.movingRight);
    const bob =
      this.anim === "drag" ? Math.sin(performance.now() / 140) * 4 : 0;

    // Soft contact shadow on the grass
    ctx.fillStyle = "rgba(20, 30, 20, 0.28)";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 2, this.drawW * 0.28, Math.max(5, this.drawH * 0.06), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.scale(scaleX, 1);
    ctx.drawImage(
      img,
      sx,
      sy,
      frameW,
      frameH,
      -this.drawW / 2,
      -this.drawH * 0.92,
      this.drawW,
      this.drawH
    );
    ctx.restore();
  }
}
