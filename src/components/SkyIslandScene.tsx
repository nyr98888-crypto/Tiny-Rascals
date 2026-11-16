"use client";

import { useEffect, useRef } from "react";
import { SkyIslandEngine } from "@/game/SkyIslandEngine";

export function SkyIslandScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const islandRef = useRef<HTMLImageElement>(null);
  const engineRef = useRef<SkyIslandEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const island = islandRef.current;
    if (!canvas || !island) return;

    const syncCanvasToIsland = () => {
      const r = island.getBoundingClientRect();
      const root = island.offsetParent as HTMLElement | null;
      const rootRect = root?.getBoundingClientRect() ?? { left: 0, top: 0 };
      canvas.style.left = `${r.left - rootRect.left}px`;
      canvas.style.top = `${r.top - rootRect.top}px`;
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      canvas.style.right = "auto";
      canvas.style.bottom = "auto";
      engineRef.current?.resize();
    };

    const engine = new SkyIslandEngine(canvas);
    engineRef.current = engine;

    const onReady = () => {
      syncCanvasToIsland();
      void engine.start().catch((err) => console.error(err));
    };

    if (island.complete && island.naturalWidth > 0) onReady();
    else island.addEventListener("load", onReady, { once: true });

    const onResize = () => {
      syncCanvasToIsland();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    <main id="app-root" className="sky-island">
      <div className="sky-backdrop" aria-hidden />
      <img
        ref={islandRef}
        className="island-plate"
        src="/arena/island_plate.png"
        alt="Floating sky island arena"
        draggable={false}
      />
      <canvas ref={canvasRef} className="play-canvas" />
      <div className="hint-bar">
        Click to move · Drag the dragon · 1 chop · 2 mine · 3 dig · 4 farm · 5 cook · C carry
      </div>
    </main>
  );
}
