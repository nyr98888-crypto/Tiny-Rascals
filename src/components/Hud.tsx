"use client";

import { useEffect, useState } from "react";
import type { GameEngine } from "@/game/engine";
import { ISLAND_LABELS, ISLAND_ORDER, type IslandId } from "@/game/types";
import { UPGRADE_COSTS } from "@/game/save";
import manifest from "@/data/assetManifest.json";

type DexFilter = "all" | "unlocked" | "locked" | IslandId;

const FOOD =
  /toast|taco|ramen|pizza|burger|boba|coffee|avocado|pineapple|onigiri|mochi|potato|mushroom|pepperoni|nitro|shaker|cup|mug/;
const GADGET =
  /wifi|arcade|cartridge|toolbox|keycap|cassette|tire|cone|toaster|ufo|pc|dumbbell|glove|stereo|boombox|lantern|mecha|windup/;

function petBiome(id: string): IslandId {
  if (FOOD.test(id)) return "snack";
  if (GADGET.test(id)) return "retro";
  if (/lava|magma|ember|hollow|gargoyle|skeleton|mimic|golem|dragon/.test(id)) return "hollow";
  if (/koi|jellyfish|otter|penguin|frog|axolotl|fish|lagoon|duck/.test(id)) return "lagoon";
  return "meadow";
}

export function Hud({ engine }: { engine: GameEngine | null }) {
  const [, bump] = useState(0);
  const [dexOpen, setDexOpen] = useState(false);
  const [dexFilter, setDexFilter] = useState<DexFilter>("all");
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [giftLink, setGiftLink] = useState<string | null>(null);

  useEffect(() => {
    if (!engine) return;
    const unsub = engine.onChange(() => bump((n) => n + 1));
    return () => {
      unsub();
    };
  }, [engine]);

  if (!engine) return null;
  const save = engine.save;

  const filteredRascals = manifest.rascals.filter((r) => {
    const known = save.discovered.includes(r.id);
    if (dexFilter === "unlocked") return known;
    if (dexFilter === "locked") return !known;
    if (dexFilter === "all") return true;
    return petBiome(r.id) === dexFilter;
  });
  const prog = save.islands[save.activeIsland];
  const nightLabel =
    save.manualNight === true ? "Night" : save.manualNight === false ? "Day" : "Auto";

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand">Tiny Rascals</div>
        <div className="panel resources">
          <span title="A1 Meadow">
            Wood <strong>{save.resources.wood}</strong>
          </span>
          <span title="A2">
            Berries <strong>{save.resources.berries}</strong>
          </span>
          <span title="A3 Treats">
            Treats <strong>{save.resources.crops}</strong>
          </span>
          <span title="A4 Tokens">
            Tokens <strong>{save.resources.tokens ?? 0}</strong>
          </span>
          <span title="A5 Gems">
            Gems <strong>{save.resources.gems}</strong>
          </span>
        </div>
        <div className="toolbar panel">
          <button
            className={engine.decorateMode ? "active" : ""}
            onClick={() => engine.toggleDecorate()}
            title="Decorate mode — drag buildings, stations, crops & clutter"
          >
            {engine.decorateMode ? "Done Decorating" : "Decorate"}
          </button>
          {engine.decorateMode && (
            <button
              title="Restore the default curated layout for this island"
              onClick={() => {
                if (confirm("Reset this island's layout to the default arrangement?")) {
                  engine.resetLayout();
                }
              }}
            >
              Reset Layout
            </button>
          )}
          <button onClick={() => setUpgradesOpen(true)}>Upgrades</button>
          <button className={dexOpen ? "active" : ""} onClick={() => setDexOpen(true)}>
            Rascal Dex
          </button>
          <button
            className={nightLabel !== "Auto" ? "active" : ""}
            title="Cycle Day / Night / Auto sky"
            onClick={() => {
              if (save.manualNight === null) engine.setManualNight(true);
              else if (save.manualNight === true) engine.setManualNight(false);
              else engine.setManualNight(null);
            }}
          >
            {nightLabel}
          </button>
          <button onClick={() => setSettingsOpen(true)}>Settings</button>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="island-switcher panel">
          {ISLAND_ORDER.map((id) => {
            const unlocked = save.islands[id].unlocked || save.sandboxPreviewAll;
            return (
              <button
                key={id}
                className={save.activeIsland === id ? "active" : ""}
                disabled={!unlocked}
                onClick={() => engine.setIsland(id as IslandId)}
              >
                {ISLAND_LABELS[id]}
              </button>
            );
          })}
        </div>
        <div className="hint panel">
          {engine.decorateMode
            ? "Decorate: drag buildings, stations, crops & props · dock stays fixed · scroll to zoom"
            : `Drag to pan · scroll to zoom · pick up Rascals · ${prog.buildingTier}/${prog.propTier}/${prog.cropTier}/${prog.clutterTier} tiers`}
        </div>
      </div>

      {dexOpen && (
        <div className="drawer-backdrop" onClick={() => setDexOpen(false)} />
      )}
      <aside className={`drawer ${dexOpen ? "open" : ""}`} aria-hidden={!dexOpen}>
        <div className="drawer-head">
          <h2>
            Rascal Dex{" "}
            <span className="dex-count">
              {save.discovered.length}/81
            </span>
          </h2>
          <button onClick={() => setDexOpen(false)}>Close</button>
        </div>

        <div className="dex-filters">
          {(
            [
              ["all", "All"],
              ["unlocked", "Unlocked"],
              ["locked", "Locked"],
              ...ISLAND_ORDER.map((id) => [id, ISLAND_LABELS[id]] as const),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={dexFilter === id ? "active" : ""}
              onClick={() => setDexFilter(id as DexFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="dex-grid">
          {filteredRascals.map((r) => {
            const known = save.discovered.includes(r.id);
            return (
              <div key={r.id} className={`dex-card ${known ? "unlocked" : "locked"}`}>
                {r.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.icon} alt={known ? r.name : "Unknown rascal"} />
                ) : (
                  <div className="dex-placeholder" />
                )}
                <div className="dex-name">{known ? r.name : "???"}</div>
                <div className="dex-status">{known ? "Unlocked" : "Locked"}</div>
              </div>
            );
          })}
        </div>
      </aside>

      {upgradesOpen && (
        <div className="modal-backdrop" onClick={() => setUpgradesOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Island Upgrades — {ISLAND_LABELS[save.activeIsland]}</h3>
            <div className="upgrade-list">
              {(
                [
                  ["building", "Buildings", prog.buildingTier],
                  ["prop", "Stations", prog.propTier],
                  ["crop", "Crops", prog.cropTier],
                  ["clutter", "Decor", prog.clutterTier],
                ] as const
              ).map(([key, label, tier]) => (
                <div className="upgrade-row" key={key}>
                  <span>
                    {label}: Tier {tier}/3
                  </span>
                  <button disabled={tier >= 3} onClick={() => engine.tryUpgrade(key)}>
                    Upgrade ({UPGRADE_COSTS[key].wood}W/{UPGRADE_COSTS[key].berries}B/
                    {UPGRADE_COSTS[key].crops}T/{UPGRADE_COSTS[key].tokens}K/
                    {UPGRADE_COSTS[key].gems}G)
                  </button>
                </div>
              ))}
              <div className="upgrade-row">
                <span>Harbor Dock: {prog.dockRepaired ? "Repaired" : "Needs repair"}</span>
                <button
                  disabled={prog.dockRepaired}
                  onClick={() => engine.tryUpgrade("dock")}
                >
                  Repair ({UPGRADE_COSTS.dock.wood}W/{UPGRADE_COSTS.dock.berries}B/
                  {UPGRADE_COSTS.dock.crops}T/{UPGRADE_COSTS.dock.tokens}K/
                  {UPGRADE_COSTS.dock.gems}G)
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setUpgradesOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="upgrade-list">
              <div className="upgrade-row">
                <span>Mute audio</span>
                <button className={save.muted ? "active" : ""} onClick={() => engine.toggleMute()}>
                  {save.muted ? "Muted" : "On"}
                </button>
              </div>
              <div className="upgrade-row">
                <span>Preview all islands</span>
                <button
                  className={save.sandboxPreviewAll ? "active" : ""}
                  onClick={() => engine.toggleSandbox()}
                >
                  {save.sandboxPreviewAll ? "Sandbox On" : "Off"}
                </button>
              </div>
              <div className="upgrade-row">
                <span>Share care package</span>
                <button
                  onClick={() => {
                    const link = engine.makeGiftLink();
                    setGiftLink(link);
                    void navigator.clipboard?.writeText(link);
                  }}
                >
                  Copy gift link
                </button>
              </div>
            </div>
            {giftLink && (
              <p style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{giftLink}</p>
            )}
            <div className="modal-actions">
              <button onClick={() => setSettingsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {engine.giftMessage && (
        <div className="modal-backdrop" onClick={() => engine.dismissGift()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Boat Arrival!</h3>
            <p>{engine.giftMessage}</p>
            <div className="modal-actions">
              <button onClick={() => engine.dismissGift()}>Wonderful</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
