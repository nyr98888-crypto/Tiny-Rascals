"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import manifest from "@/data/assetManifest.json";
import { AREA_CODE } from "@/game/mapGraph";
import { ISLAND_ORDER, ISLAND_LABELS, type IslandId } from "@/game/types";
import type { WorldLayoutFile } from "@/game/worldLayouts";

const ORDER = ISLAND_ORDER;

export default function CalibrateMapPage() {
  const [layout, setLayout] = useState<WorldLayoutFile | null>(null);
  const [island, setIsland] = useState<IslandId>("meadow");
  const [status, setStatus] = useState("");
  const [drag, setDrag] = useState<{ kind: "plot" | "clearing" | "node"; id: string } | null>(
    null
  );

  const land = manifest.lands[island];
  const aspect = land.w / land.h;

  useEffect(() => {
    void fetch("/api/world-layouts")
      .then((r) => r.json())
      .then((data: WorldLayoutFile) => setLayout(data))
      .catch(() => setStatus("Failed to load world-layouts.json"));
  }, []);

  const save = useCallback(async () => {
    if (!layout) return;
    setStatus("Saving…");
    try {
      const res = await fetch("/api/world-layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setLayout(data.layout);
      setStatus("Saved to src/data/world-layouts.json (images untouched)");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }, [layout]);

  const movePin = (kind: "plot" | "clearing" | "node", id: string, x: number, y: number) => {
    if (!layout) return;
    const next = structuredClone(layout);
    if (kind === "plot") {
      const p = next.shared.plots.find((q) => q.id === id);
      if (p) {
        p.x = x;
        p.y = y;
      }
    } else if (kind === "clearing") {
      const c = next.shared.clearings.find((q) => q.id === id);
      if (c) {
        c.x = x;
        c.y = y;
      }
    } else {
      next.shared.nodes[id] = { x, y };
    }
    // Sync spur nodes
    for (const plot of next.shared.plots) {
      const key = plot.id.replace("plot-", "plot_");
      if (next.shared.nodes[key]) next.shared.nodes[key] = { x: plot.x, y: plot.y };
    }
    for (const c of next.shared.clearings) {
      const key = c.id.replace("clear-", "clear_");
      if (next.shared.nodes[key]) next.shared.nodes[key] = { x: c.x, y: c.y };
    }
    setLayout(next);
  };

  const onMapPointer = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !layout) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
    movePin(drag.kind, drag.id, x, y);
  };

  const pins = useMemo(() => {
    if (!layout) return [];
    const out: { kind: "plot" | "clearing" | "node"; id: string; x: number; y: number; color: string }[] =
      [];
    for (const p of layout.shared.plots) {
      out.push({ kind: "plot", id: p.id, x: p.x, y: p.y, color: "#e8a046" });
    }
    for (const c of layout.shared.clearings) {
      out.push({ kind: "clearing", id: c.id, x: c.x, y: c.y, color: "#5ad2be" });
    }
    for (const [id, pos] of Object.entries(layout.shared.nodes)) {
      if (id.startsWith("plot_") || id.startsWith("clear_")) continue;
      out.push({
        kind: "node",
        id,
        x: pos.x,
        y: pos.y,
        color:
          id.includes("portal") ? "#e07a6a" : id.includes("bridge") ? "#9ec5ff" : "#e0b44a",
      });
    }
    return out;
  }, [layout]);

  return (
    <div style={{ padding: "1.25rem 1.5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <a href="/" style={{ color: "#e0b44a", textDecoration: "none" }}>
          ← Game
        </a>
        <strong>Map Layout Calibrator</strong>
        <span style={{ opacity: 0.65, fontSize: "0.9rem" }}>
          Images are read-only · edits → world-layouts.json
        </span>
        <button
          type="button"
          onClick={() => void save()}
          style={{
            marginLeft: "auto",
            border: "1px solid rgba(224,180,74,0.4)",
            background: "#1a1d27",
            color: "#f3ead7",
            borderRadius: 8,
            padding: "0.4rem 0.75rem",
            cursor: "pointer",
          }}
        >
          Save Layout
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "1rem 0" }}>
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setIsland(id)}
            style={{
              border: `1px solid ${island === id ? "#e0b44a" : "rgba(224,180,74,0.3)"}`,
              background: island === id ? "#2a3142" : "#1a1d27",
              color: island === id ? "#e0b44a" : "#f3ead7",
              borderRadius: 8,
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
          >
            {AREA_CODE[id]} · {ISLAND_LABELS[id]}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 960,
          aspectRatio: `${aspect}`,
          background: "#0c0e14",
          borderRadius: 12,
          border: "1px solid rgba(224,180,74,0.25)",
          overflow: "hidden",
          touchAction: "none",
        }}
        onPointerMove={onMapPointer}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={land.src}
          alt={ISLAND_LABELS[island]}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", userSelect: "none" }}
        />
        {layout?.shared.edges.map(([a, b]) => {
          const na = layout.shared.nodes[a];
          const nb = layout.shared.nodes[b];
          if (!na || !nb) return null;
          return (
            <svg
              key={`${a}-${b}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              <line
                x1={`${na.x * 100}%`}
                y1={`${na.y * 100}%`}
                x2={`${nb.x * 100}%`}
                y2={`${nb.y * 100}%`}
                stroke="rgba(224,180,74,0.55)"
                strokeWidth="2"
              />
            </svg>
          );
        })}
        {pins.map((pin) => (
          <button
            key={`${pin.kind}-${pin.id}`}
            type="button"
            title={pin.id}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ kind: pin.kind, id: pin.id });
            }}
            style={{
              position: "absolute",
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid #12141a",
              background: pin.color,
              cursor: "grab",
              padding: 0,
              zIndex: 2,
            }}
          />
        ))}
      </div>

      <p style={{ marginTop: "0.75rem", opacity: 0.7, fontSize: "0.9rem" }}>
        {status ||
          "Drag pins onto tilled plots (amber), clearings (teal), and road/bridge nodes (gold/blue/red)."}
      </p>
    </div>
  );
}
