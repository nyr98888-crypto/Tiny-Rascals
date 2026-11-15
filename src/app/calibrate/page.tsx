"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import manifest from "@/data/assetManifest.json";
import { SHEET_ACTIONS } from "@/game/poses";
import { defaultPetSheetMap, type CellRC } from "@/game/spriteMap";

type SheetKey = "1" | "2" | "3";
type PetSheetMap = Partial<Record<SheetKey, Partial<Record<string, CellRC>>>>;
type SpriteMapFile = {
  version: number;
  sheetActions: Record<SheetKey, string[]>;
  pets: Record<string, PetSheetMap>;
};

const SHEET_LABELS: Record<SheetKey, string> = {
  "1": "Working & Care",
  "2": "Movement & Physics",
  "3": "Emotions",
};

function cellLabel(
  map: PetSheetMap | undefined,
  sheet: SheetKey,
  row: number,
  col: number,
  actions: readonly string[]
): string {
  const sheetMap = map?.[sheet];
  if (sheetMap) {
    for (const [action, rc] of Object.entries(sheetMap)) {
      if (rc && rc[0] === row && rc[1] === col) return action;
    }
  }
  const idx = row * 3 + col;
  return actions[idx] ?? "";
}

export default function CalibratePage() {
  const rascals = useMemo(
    () =>
      [...manifest.rascals].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      ),
    []
  );

  const [map, setMap] = useState<SpriteMapFile | null>(null);
  const [petId, setPetId] = useState(rascals[0]?.id ?? "");
  const [sheet, setSheet] = useState<SheetKey>("1");
  const [action, setAction] = useState(SHEET_ACTIONS["1"][0]);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/sprite-map")
      .then((r) => r.json())
      .then((data: SpriteMapFile) => setMap(data))
      .catch(() =>
        setMap({
          version: 1,
          sheetActions: {
            "1": [...SHEET_ACTIONS["1"]],
            "2": [...SHEET_ACTIONS["2"]],
            "3": [...SHEET_ACTIONS["3"]],
          },
          pets: {},
        })
      );
  }, []);

  useEffect(() => {
    const actions = SHEET_ACTIONS[sheet];
    if (!actions.includes(action)) setAction(actions[0]);
  }, [sheet, action]);

  const pet = rascals.find((r) => r.id === petId);
  const sheets = (pet as { sheets?: Partial<Record<SheetKey, string | null>> } | undefined)
    ?.sheets;
  const sheetSrc =
    sheets?.[sheet] ||
    (pet as { srcSheets?: Partial<Record<SheetKey, string | null>> } | undefined)?.srcSheets?.[
      sheet
    ] ||
    null;

  const actions = SHEET_ACTIONS[sheet];
  const petMap = map?.pets[petId];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rascals;
    return rascals.filter(
      (r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [filter, rascals]);

  const assignCell = useCallback(
    async (row: number, col: number) => {
      if (!map || !petId || !action) return;
      setSaving(true);
      setStatus(`Saving ${action} → [${row},${col}]…`);
      try {
        const res = await fetch("/api/sprite-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petId, sheet, action, row, col }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        setMap(data.map as SpriteMapFile);
        setStatus(`Saved ${petId} sheet ${sheet}: ${action} → [${row},${col}]`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [map, petId, sheet, action]
  );

  const ensureDefaults = useCallback(async () => {
    if (!map || !petId) return;
    const next: SpriteMapFile = {
      ...map,
      pets: {
        ...map.pets,
        [petId]: map.pets[petId] ?? defaultPetSheetMap(),
      },
    };
    setSaving(true);
    try {
      const res = await fetch("/api/sprite-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMap(data.map as SpriteMapFile);
      setStatus(`Wrote default [0..8] mapping for ${petId}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [map, petId]);

  return (
    <div className="calibrate-root">
      <style>{`
        .calibrate-root {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: 100%;
          font-family: "Segoe UI", system-ui, sans-serif;
        }
        .calibrate-side {
          border-right: 1px solid rgba(224,180,74,0.28);
          background: #1a1d27;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .calibrate-side h1 {
          font-size: 1.05rem;
          margin: 0;
          color: #e0b44a;
        }
        .calibrate-side input {
          width: 100%;
          padding: 0.45rem 0.6rem;
          border-radius: 8px;
          border: 1px solid rgba(224,180,74,0.3);
          background: #12141a;
          color: #f3ead7;
        }
        .calibrate-list {
          overflow: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .calibrate-list button {
          text-align: left;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0.5rem;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: #f3ead7;
          cursor: pointer;
        }
        .calibrate-list button:hover { background: #232735; }
        .calibrate-list button.active {
          border-color: #e0b44a;
          background: #232735;
        }
        .calibrate-list img {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 6px;
          background: #12141a;
        }
        .calibrate-main {
          padding: 1.25rem 1.5rem 2.5rem;
        }
        .calibrate-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 1rem;
        }
        .calibrate-toolbar a {
          color: #e0b44a;
          text-decoration: none;
          margin-right: 0.5rem;
        }
        .calibrate-toolbar button,
        .action-chip {
          border: 1px solid rgba(224,180,74,0.35);
          background: #1a1d27;
          color: #f3ead7;
          border-radius: 8px;
          padding: 0.4rem 0.7rem;
          cursor: pointer;
        }
        .calibrate-toolbar button.active,
        .action-chip.active {
          border-color: #e0b44a;
          background: #2a3142;
          color: #e0b44a;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin: 0.75rem 0 1.25rem;
        }
        .sheet-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 140px));
          gap: 6px;
          width: fit-content;
          background: #0c0e14;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid rgba(224,180,74,0.25);
        }
        .sheet-cell {
          position: relative;
          width: 140px;
          height: 140px;
          border: 2px solid rgba(243,234,215,0.15);
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          background:
            linear-gradient(45deg, #1a1d27 25%, transparent 25%) -10px 0 / 20px 20px,
            linear-gradient(-45deg, #1a1d27 25%, transparent 25%) -10px 0 / 20px 20px,
            linear-gradient(45deg, transparent 75%, #1a1d27 75%) 0 0 / 20px 20px,
            linear-gradient(-45deg, transparent 75%, #1a1d27 75%) 0 0 / 20px 20px,
            #12141a;
        }
        .sheet-cell:hover { border-color: #e0b44a; }
        .sheet-cell.tagged { border-color: rgba(224,180,74,0.7); }
        .sheet-cell img {
          width: 300%;
          height: 300%;
          max-width: none;
          image-rendering: auto;
          pointer-events: none;
          user-select: none;
        }
        .sheet-cell span {
          position: absolute;
          left: 4px;
          right: 4px;
          bottom: 4px;
          font-size: 0.68rem;
          line-height: 1.15;
          padding: 2px 4px;
          border-radius: 4px;
          background: rgba(18,20,26,0.82);
          color: #e0b44a;
          text-align: center;
        }
        .calibrate-status {
          margin-top: 1rem;
          color: rgba(243,234,215,0.7);
          font-size: 0.9rem;
        }
        .calibrate-note {
          margin: 0 0 1rem;
          color: rgba(243,234,215,0.65);
          max-width: 52rem;
          line-height: 1.4;
        }
        .missing-sheet {
          padding: 2rem;
          border: 1px dashed rgba(224,180,74,0.35);
          border-radius: 12px;
          color: rgba(243,234,215,0.55);
        }
        @media (max-width: 820px) {
          .calibrate-root { grid-template-columns: 1fr; }
          .calibrate-side { height: auto; position: relative; max-height: 40vh; }
        }
      `}</style>

      <aside className="calibrate-side">
        <h1>Sprite Calibrator</h1>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rascals…"
          aria-label="Filter rascals"
        />
        <div className="calibrate-list">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === petId ? "active" : ""}
              onClick={() => setPetId(r.id)}
            >
              {r.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.icon} alt="" />
              ) : (
                <span style={{ width: 36, height: 36 }} />
              )}
              <span>{r.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="calibrate-main">
        <div className="calibrate-toolbar">
          <a href="/">← Game</a>
          <strong>{pet?.name ?? petId}</strong>
          {(["1", "2", "3"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={sheet === s ? "active" : ""}
              onClick={() => setSheet(s)}
            >
              Sheet {s} · {SHEET_LABELS[s]}
            </button>
          ))}
          <button type="button" disabled={saving} onClick={() => void ensureDefaults()}>
            Write defaults
          </button>
        </div>

        <p className="calibrate-note">
          Images are read-only. Select an action tag, then click a cell to store its{" "}
          <code>[row, col]</code> in <code>src/data/sprite-map.json</code>. Missing sheets{" "}
          <code>2</code>/<code>3</code> are skipped cleanly in-game.
        </p>

        <div className="action-row">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              className={`action-chip ${action === a ? "active" : ""}`}
              onClick={() => setAction(a)}
            >
              {a}
            </button>
          ))}
        </div>

        {!sheetSrc ? (
          <div className="missing-sheet">No sheet {sheet} for this rascal.</div>
        ) : (
          <div className="sheet-grid" role="grid" aria-label={`Sheet ${sheet}`}>
            {[0, 1, 2].map((row) =>
              [0, 1, 2].map((col) => {
                const label = cellLabel(petMap, sheet, row, col, actions);
                const tagged = Boolean(
                  petMap?.[sheet] &&
                    Object.values(petMap[sheet]!).some(
                      (rc) => rc && rc[0] === row && rc[1] === col
                    )
                );
                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    className={`sheet-cell ${tagged ? "tagged" : ""}`}
                    disabled={saving}
                    title={`Assign ${action} → [${row},${col}]`}
                    onClick={() => void assignCell(row, col)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sheetSrc}
                      alt=""
                      style={{
                        transform: `translate(${-col * 33.333}%, ${-row * 33.333}%)`,
                      }}
                    />
                    <span>
                      [{row},{col}] {label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        <p className="calibrate-status">{status || "Ready — images never modified."}</p>
      </main>
    </div>
  );
}
