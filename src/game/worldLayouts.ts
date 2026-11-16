import worldLayoutsJson from "@/data/world-layouts.json";
import type { Vec2 } from "./types";

export type PlotDef = { id: string; x: number; y: number; label?: string };
export type ClearingDef = { id: string; x: number; y: number; r: number; label?: string };
export type WorldLayoutFile = {
  version: number;
  shared: {
    plots: PlotDef[];
    clearings: ClearingDef[];
    nodes: Record<string, Vec2>;
    edges: [string, string][];
  };
};

let live: WorldLayoutFile = structuredClone(worldLayoutsJson) as unknown as WorldLayoutFile;

export function getWorldLayout(): WorldLayoutFile {
  return live;
}

export function setWorldLayout(next: WorldLayoutFile) {
  live = next;
  // Keep plot spur nodes in sync with plot positions
  for (const plot of live.shared.plots) {
    const key = plot.id.replace("plot-", "plot_");
    if (live.shared.nodes[key]) {
      live.shared.nodes[key] = { x: plot.x, y: plot.y };
    }
  }
  for (const c of live.shared.clearings) {
    const key = c.id.replace("clear-", "clear_");
    if (live.shared.nodes[key]) {
      live.shared.nodes[key] = { x: c.x, y: c.y };
    }
  }
}

export function exportWorldLayout(): WorldLayoutFile {
  return structuredClone(live);
}
