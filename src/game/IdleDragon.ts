import { CLIPS, SHEET_SRC } from "./dragonSheets";

/** Visual-only idle dragon — no input, no pathfinding. */
export class IdleDragon {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private sheet: HTMLImageElement | null = null;
  private raf = 0;
  private last = 0;
  private frameCursor = 0;
  private frameT = 0;
  private x = 0;
  private y = 0;
  private drawW = 120;
  private drawH = 120;
  private clip = CLIPS.idle;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
  }

  async start(anchor: { x: number; y: number }) {
    this.sheet = await loadImage(`${SHEET_SRC.pickup}?v=768pack`);
    this.resize();
    this.x = anchor.x;
    this.y = anchor.y;
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

  setAnchor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(1.25, Math.max(0.85, w / 1100));
    this.drawW = 128 * scale;
    this.drawH = 128 * scale;
  };

  private update(dt: number) {
    this.frameT += dt;
    const step = 1 / this.clip.fps;
    while (this.frameT >= step) {
      this.frameT -= step;
      this.frameCursor = (this.frameCursor + 1) % this.clip.frames.length;
    }
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!this.sheet) return;

    const img = this.sheet;
    const frameW = img.naturalWidth / 3;
    const frameH = img.naturalHeight / 3;
    const frame = this.clip.frames[this.frameCursor] ?? 0;
    const col = frame % 3;
    const row = Math.floor(frame / 3);

    ctx.fillStyle = "rgba(20, 30, 20, 0.28)";
    ctx.beginPath();
    ctx.ellipse(
      this.x,
      this.y + 2,
      this.drawW * 0.28,
      Math.max(5, this.drawH * 0.06),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.drawImage(
      img,
      col * frameW,
      row * frameH,
      frameW,
      frameH,
      this.x - this.drawW / 2,
      this.y - this.drawH * 0.92,
      this.drawW,
      this.drawH
    );
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
