// ---------------------------------------------------------------------------
// ActionHotspots.tsx — the action buttons, placed on the animated town itself
// (GDD §5.1). Each available action sits over a thematic spot — the tavern, the
// forge, the well, the road, a townsfolk's door. Clicking one plays a short,
// captioned animation "in place" before the turn actually resolves, so the day
// unfolds at a deliberate pace rather than instantly.
//
// Positions are viewport percentages tuned to the scene's layout; they're easy
// to nudge as the art evolves.
// ---------------------------------------------------------------------------

import { availableActions } from "../game/actions";
import { familyActions } from "../game/family";
import type { ActionDef, GameState } from "../game/types";

/** Where each action's button sits on the scene (% of viewport). */
const HOTSPOTS: Record<string, { left: number; top: number }> = {
  shop: { left: 7, top: 64 }, // the blacksmith / forge, far left
  tavern: { left: 27, top: 58 }, // the tavern
  work: { left: 45, top: 82 }, // the well & market in the square
  roam: { left: 82, top: 76 }, // off down the road
  // night
  alleys: { left: 20, top: 80 }, // the dark side-streets
  hunt: { left: 93, top: 60 }, // out past the walls
  pickpocket: { left: 40, top: 84 }, // the crowd by the market
  burgle: { left: 64, top: 56 }, // a shuttered house
  // family (daytime, social)
  court: { left: 30, top: 74 }, // about the square
  propose: { left: 30, top: 66 },
  family: { left: 88, top: 54 }, // the family home
};

/** A per-action caption + icon for the "doing it" animation. */
const CUES: Record<string, { icon: string; caption: string }> = {
  tavern: { icon: "🍺", caption: "At the tavern…" },
  shop: { icon: "⚒️", caption: "Off to the shop…" },
  roam: { icon: "🌿", caption: "Roaming the outskirts…" },
  work: { icon: "🔨", caption: "Working for the town…" },
  alleys: { icon: "🌙", caption: "Prowling the alleys…" },
  hunt: { icon: "🏹", caption: "Hunting beyond the walls…" },
  pickpocket: { icon: "🖐️", caption: "Picking a pocket…" },
  burgle: { icon: "🗝️", caption: "Slipping inside…" },
  court: { icon: "❤️", caption: "Courting…" },
  propose: { icon: "💍", caption: "Proposing…" },
  family: { icon: "👶", caption: "Time with family…" },
};

const ICONS: Record<string, string> = {
  tavern: "🍺",
  shop: "⚒️",
  roam: "🌿",
  work: "🔨",
  alleys: "🌙",
  hunt: "🏹",
  pickpocket: "🖐️",
  burgle: "🗝️",
  court: "❤️",
  propose: "💍",
  family: "👶",
};

const FALLBACK = { left: 50, top: 88 };

export function ActionHotspots({
  state,
  onAct,
  busyAction,
  durationMs,
}: {
  state: GameState;
  onAct: (id: string) => void;
  busyAction: string | null;
  durationMs: number;
}) {
  const actions: ActionDef[] = [
    ...availableActions(state.phase),
    ...(state.phase === "day" ? familyActions(state.character) : []),
  ];

  // Actions without a mapped hotspot get spread along the bottom.
  const unplaced = actions.filter((a) => !HOTSPOTS[a.id]);

  return (
    <div className={`hotspot-layer${busyAction ? " busy" : ""}`}>
      {actions.map((a, idx) => {
        const pos =
          HOTSPOTS[a.id] ??
          { left: FALLBACK.left + (idx - unplaced.length / 2) * 14, top: FALLBACK.top };
        const active = busyAction === a.id;
        return (
          <div
            key={a.id}
            className="hotspot"
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
          >
            <button
              className={`hotspot-btn${a.danger ? " danger" : ""}${active ? " active" : ""}`}
              onClick={() => onAct(a.id)}
              disabled={!!busyAction}
              title={a.hint}
            >
              <span className="hotspot-icon">{ICONS[a.id] ?? "•"}</span>
              <span className="hotspot-label">{a.label}</span>
            </button>

            {active && (
              <div className="hotspot-cue">
                <span className="hotspot-cue-icon">{CUES[a.id]?.icon ?? "⏳"}</span>
                <span className="hotspot-cue-text">{CUES[a.id]?.caption ?? "…"}</span>
                <div className="hotspot-progress">
                  <span style={{ animationDuration: `${durationMs}ms` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
