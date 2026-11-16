"use client";

import { useEffect, useRef } from "react";
import { IdleDragon } from "@/game/IdleDragon";
import { WoodenBridges } from "./WoodenBridges";

const ISLAND_SRC = "/world/island_plate.png";
const SKY_SRC = "/world/sky_bg.png";

/** Center clearing of the middle island plate (viewport coords). */
function centerClearingAnchor(centerIsland: HTMLImageElement): { x: number; y: number } {
  const r = centerIsland.getBoundingClientRect();
  // Dirt hub sits near the visual center of the grassy plateau
  return {
    x: r.left + r.width * 0.5,
    y: r.top + r.height * 0.42,
  };
}

export function SkyIslandScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const centerRef = useRef<HTMLImageElement>(null);
  const dragonRef = useRef<IdleDragon | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const center = centerRef.current;
    if (!canvas || !center) return;

    const dragon = new IdleDragon(canvas);
    dragonRef.current = dragon;

    const place = () => {
      const anchor = centerClearingAnchor(center);
      dragon.setAnchor(anchor.x, anchor.y);
      dragon.resize();
    };

    const onReady = () => {
      place();
      void dragon.start(centerClearingAnchor(center)).catch((err) => console.error(err));
    };

    if (center.complete && center.naturalWidth > 0) onReady();
    else center.addEventListener("load", onReady, { once: true });

    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      dragon.stop();
      dragonRef.current = null;
    };
  }, []);

  return (
    <main id="app-root" className="sky-island">
      <img
        className="sky-backdrop"
        src={SKY_SRC}
        alt=""
        draggable={false}
        aria-hidden
      />

      <WoodenBridges />

      <img
        className="island-plate left"
        src={ISLAND_SRC}
        alt="Left floating island"
        draggable={false}
      />
      <img
        ref={centerRef}
        className="island-plate center"
        src={ISLAND_SRC}
        alt="Center main floating island"
        draggable={false}
      />
      <img
        className="island-plate right"
        src={ISLAND_SRC}
        alt="Right floating island"
        draggable={false}
      />

      <canvas ref={canvasRef} className="dragon-canvas" aria-hidden />

      <div className="hint-bar">3-island sky layout · visual pass</div>
    </main>
  );
}
