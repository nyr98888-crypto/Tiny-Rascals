/** Lazy texture cache — load active island + spawned rascals only. */

export class TextureManager {
  private cache = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<HTMLImageElement>>();

  get(src: string): HTMLImageElement | null {
    return this.cache.get(src) ?? null;
  }

  async load(src: string): Promise<HTMLImageElement> {
    const hit = this.cache.get(src);
    if (hit) return hit;
    const pending = this.loading.get(src);
    if (pending) return pending;

    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(src, img);
        this.loading.delete(src);
        resolve(img);
      };
      img.onerror = () => {
        this.loading.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      img.src = src;
    });
    this.loading.set(src, p);
    return p;
  }

  async loadMany(srcs: string[]) {
    await Promise.all(srcs.map((s) => this.load(s).catch(() => null)));
  }

  /** Drop textures not in keep set (island switch). */
  disposeExcept(keep: Set<string>) {
    for (const key of [...this.cache.keys()]) {
      if (!keep.has(key)) this.cache.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.loading.clear();
  }
}
