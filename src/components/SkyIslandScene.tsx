"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeWorldBounds,
  islandHeight,
  islandRect,
  resolveActiveBridges,
  unlockedIslands,
  type IslandDef,
} from "@/data/worldMap";
import { RtsEngine, type RtsHudState } from "@/game/RtsEngine";
import { WoodenBridges } from "./WoodenBridges";

const SKY_SRC = "/world/sky_bg.png";

const ROLE_CLASS: Record<IslandDef["role"], string> = {
  hub: "role-hub",
  farm: "role-farm",
  quarry: "role-quarry",
  magic: "role-magic",
  harbor: "role-harbor",
};

export function SkyIslandScene() {
  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RtsEngine | null>(null);

  const [hud, setHud] = useState<RtsHudState>({
    follow: false,
    islands: unlockedIslands(),
    canExpand: true,
  });

  const bounds = useMemo(() => computeWorldBounds(hud.islands), [hud.islands]);
  const bridges = useMemo(() => resolveActiveBridges(), [hud.islands]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const world = worldRef.current;
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    if (!viewport || !world || !canvas || !minimap) return;

    const engine = new RtsEngine(viewport, world, canvas, minimap);
    engineRef.current = engine;
    const off = engine.onHud(setHud);
    void engine.start().catch((err) => console.error(err));

    return () => {
      off();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    <main id="app-root" className="rts-root">
      <section
        ref={viewportRef}
        className="rts-viewport"
        onContextMenu={(e) => e.preventDefault()}
      >
        <img className="sky-parallax" src={SKY_SRC} alt="" draggable={false} aria-hidden />

        <div
          ref={worldRef}
          className="rts-world"
          style={{
            width: bounds.worldWidth,
            height: bounds.worldHeight,
          }}
        >
          <WoodenBridges bridges={bridges} originX={bounds.minX} originY={bounds.minY} />

          {hud.islands.map((island, i) => {
            const r = islandRect(island);
            return (
              <img
                key={island.id}
                className={`island-plate ${ROLE_CLASS[island.role]} float-${i % 3}`}
                src={island.sprite}
                alt={island.name}
                draggable={false}
                style={{
                  left: r.left - bounds.minX,
                  top: r.top - bounds.minY,
                  width: island.width,
                  height: islandHeight(island),
                }}
              />
            );
          })}
        </div>

        <canvas ref={canvasRef} className="rts-canvas" aria-hidden />
      </section>

      <aside className="rts-hud" aria-label="RTS controls">
        <div className="minimap-wrap">
          <canvas ref={minimapRef} className="rts-minimap" width={220} height={105} />
          <span className="minimap-label">Realm</span>
        </div>

        <div className="hud-panel">
          <div className="hud-title">Sky Realm</div>
          <div className="island-chips">
            {hud.islands.map((island) => (
              <button
                key={island.id}
                type="button"
                className={`island-chip ${ROLE_CLASS[island.role]}`}
                onClick={() => engineRef.current?.focusIsland(island.id)}
              >
                {island.name}
              </button>
            ))}
          </div>
          <div className="hud-actions">
            <button
              type="button"
              className={hud.follow ? "active" : undefined}
              onClick={() => engineRef.current?.toggleFollow()}
            >
              {hud.follow ? "Following" : "Follow Dragon"}
            </button>
            <button
              type="button"
              className="expand-btn"
              disabled={!hud.canExpand}
              onClick={() => engineRef.current?.expandIsland()}
            >
              + Expand Island
            </button>
          </div>
          <p className="hud-hint">
            WASD / edges pan · Wheel zoom · Click move · Space+drag pan · Minimap jump
          </p>
        </div>
      </aside>
    </main>
  );
}
