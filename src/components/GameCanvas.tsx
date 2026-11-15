"use client";

import { useEffect, useRef, useState } from "react";
import { GameEngine } from "@/game/engine";
import { Hud } from "./Hud";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let eng: GameEngine | null = null;
    try {
      eng = new GameEngine(canvas);
      setEngine(eng);
      void eng.start().catch((err) => {
        console.error("GameEngine start failed", err);
      });
    } catch (err) {
      console.error("GameEngine init failed", err);
    }
    return () => eng?.stop();
  }, []);

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <Hud engine={engine} />
    </div>
  );
}
