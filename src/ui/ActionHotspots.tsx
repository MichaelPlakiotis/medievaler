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

import { useEffect, useState } from "react";
import { availableActions } from "../game/actions";
import { citySettlementActions } from "../game/amenities";
import { CRIMES, crimeSuccessChance } from "../game/crime";
import { familyActions } from "../game/family";
import { npcsAt } from "../game/npcs";
import { npcQuestView } from "../game/quests";
import { settlementOf } from "../game/worldmap";
import { dungeonNameFor } from "../game/dungeon";
import { hotspotAnchors } from "../scene/townScene";
import type { ActionDef, GameState } from "../game/types";

/** The scene's logical art resolution (townScene.ts) — anchors come in these
 *  coordinates and are mapped through the canvas's object-fit: cover crop. */
const SCENE_W = 480;
const SCENE_H = 270;

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function clampPct(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Fallback positions (% of viewport) for actions with no scene anchor. */
const HOTSPOTS: Record<string, { left: number; top: number }> = {
  shop: { left: 7, top: 64 }, // the blacksmith / forge, far left
  tavern: { left: 27, top: 58 }, // the tavern
  work: { left: 45, top: 82 }, // the well & market in the square
  study: { left: 52, top: 58 }, // the church, near the town center
  university: { left: 60, top: 62 }, // city-only, near the church cluster
  brothel: { left: 72, top: 66 }, // city-only, its own corner of the square
  roam: { left: 82, top: 76 }, // off down the road
  delve: { left: 96, top: 68 }, // the barrow arch on the far hill
  travel: { left: 3, top: 90 }, // the road out of town
  // night
  alleys: { left: 20, top: 80 }, // the dark side-streets
  hunt: { left: 93, top: 60 }, // out past the walls
  pickpocket: { left: 40, top: 84 }, // the crowd by the market
  burgle: { left: 64, top: 56 }, // a shuttered house
  // family (daytime, social)
  court: { left: 30, top: 74 }, // about the square
  seeknew: { left: 18, top: 70 }, // look elsewhere
  propose: { left: 30, top: 66 },
  family: { left: 88, top: 54 }, // the family home
  movefamily: { left: 88, top: 62 }, // the family home's door
  // named quest-givers (npcs.ts) — each keeps a haunt of their own
  "npc:mira": { left: 22, top: 48 }, // by the inn, near the tavern
  "npc:gael": { left: 10, top: 80 }, // at the gate
  "npc:eddan": { left: 58, top: 46 }, // by the church steps
  "npc:valdis": { left: 36, top: 48 }, // the Warden outpost's upper room
  "npc:voss": { left: 68, top: 48 }, // toward the manor quarter
  "npc:rook": { left: 30, top: 68 }, // a shadowed table near the tavern
};

/** A per-action caption + icon for the "doing it" animation. */
const CUES: Record<string, { icon: string; caption: string }> = {
  tavern: { icon: "🍺", caption: "At the tavern…" },
  shop: { icon: "⚒️", caption: "Off to the shop…" },
  roam: { icon: "🌿", caption: "Roaming the outskirts…" },
  delve: { icon: "🪦", caption: "Descending into the barrow…" },
  travel: { icon: "🧭", caption: "Setting out on the road…" },
  work: { icon: "🔨", caption: "Working for the town…" },
  study: { icon: "📖", caption: "Studying at the church…" },
  university: { icon: "🎓", caption: "Studying at the university…" },
  brothel: { icon: "🌹", caption: "At the pleasure house…" },
  alleys: { icon: "🌙", caption: "Prowling the alleys…" },
  hunt: { icon: "🏹", caption: "Hunting beyond the walls…" },
  pickpocket: { icon: "🖐️", caption: "Picking a pocket…" },
  burgle: { icon: "🗝️", caption: "Slipping inside…" },
  court: { icon: "❤️", caption: "Courting…" },
  seeknew: { icon: "👀", caption: "Looking around…" },
  propose: { icon: "💍", caption: "Proposing…" },
  family: { icon: "👶", caption: "Time with family…" },
  movefamily: { icon: "🛞", caption: "Sending for the family…" },
  "npc:mira": { icon: "💬", caption: "Talking with Mira…" },
  "npc:gael": { icon: "💬", caption: "Talking with Gael…" },
  "npc:eddan": { icon: "💬", caption: "Talking with Eddan…" },
  "npc:valdis": { icon: "💬", caption: "Talking with Valdis…" },
  "npc:voss": { icon: "💬", caption: "Calling on Lady Voss…" },
  "npc:rook": { icon: "💬", caption: "Hearing Rook out…" },
};

const ICONS: Record<string, string> = {
  tavern: "🍺",
  shop: "⚒️",
  roam: "🌿",
  delve: "🪦",
  travel: "🧭",
  work: "🔨",
  study: "📖",
  university: "🎓",
  brothel: "🌹",
  alleys: "🌙",
  hunt: "🏹",
  pickpocket: "🖐️",
  burgle: "🗝️",
  court: "❤️",
  seeknew: "👀",
  propose: "💍",
  family: "👶",
  movefamily: "🛞",
  "npc:mira": "🍲",
  "npc:gael": "🛡️",
  "npc:eddan": "📿",
  "npc:valdis": "🃏",
  "npc:voss": "👑",
  "npc:rook": "🎭",
};

const FALLBACK = { left: 50, top: 88 };

export interface ActionFeedback {
  key: number;
  actionId: string;
  gold: number;
  xp: number;
}

/** A short-lived "+4g +7 XP" chip that floats up where an action just resolved. */
function FeedbackChip({
  feedback,
  pos,
}: {
  feedback: ActionFeedback;
  pos: { left: number; top: number };
}) {
  const parts: string[] = [];
  if (feedback.gold > 0) parts.push(`+${feedback.gold}g`);
  else if (feedback.gold < 0) parts.push(`${feedback.gold}g`);
  if (feedback.xp !== 0) parts.push(`+${feedback.xp} XP`);
  if (parts.length === 0) return null;
  return (
    <div
      key={feedback.key}
      className="feedback-chip"
      style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
    >
      {parts.join("  ")}
    </div>
  );
}

export function ActionHotspots({
  state,
  onAct,
  busyAction,
  durationMs,
  feedback,
}: {
  state: GameState;
  onAct: (id: string) => void;
  busyAction: string | null;
  durationMs: number;
  feedback?: ActionFeedback | null;
}) {
  const settlement = settlementOf(state.map, state.location.settlementId);
  // The quest-givers present here, as talk "actions". A ❗ marks a fresh offer,
  // a ✓ a job ready to turn in.
  const npcActions: ActionDef[] = npcsAt(state).map((n) => {
    const view = npcQuestView(state, n.id);
    const marker = view.kind === "offer" ? " ❗" : view.kind === "active" && view.ready ? " ✓" : "";
    return {
      id: `npc:${n.id}`,
      label: `Talk to ${n.shortName}${marker}`,
      hint: `${n.name} — ${n.title}`,
      phases: [state.phase],
    };
  });
  const actions: ActionDef[] = [
    ...availableActions(state.phase, settlement),
    ...npcActions,
    ...(state.phase === "day"
      ? familyActions(state.character, state.day, state.location.settlementId, state.map)
      : []),
    ...(state.phase === "day" ? citySettlementActions(state.character, settlement) : []),
  ];

  // Map each action's scene anchor (logical 480×270 coords, from the same
  // layout generator the canvas draws with) through the canvas's object-fit:
  // cover crop, so buttons land on their buildings wherever this settlement
  // happened to put them.
  const { w: vw, h: vh } = useWindowSize();
  const anchors = settlement ? hotspotAnchors(settlement, state.character.ownedHomes) : {};
  const scale = Math.max(vw / SCENE_W, vh / SCENE_H);
  const offX = (SCENE_W * scale - vw) / 2;
  const offY = (SCENE_H * scale - vh) / 2;
  // The region a button's CENTER may occupy so the whole pill stays on screen
  // and clear of the HUD (top) and the chronicle strip (bottom). Buttons are
  // centered via translate(-50%,-50%), so edge values would hide half a pill.
  const SAFE = { left: 6, right: 94, top: 12, bottom: 78 };
  function clampPos(p: { left: number; top: number }): { left: number; top: number } {
    return {
      left: clampPct(p.left, SAFE.left, SAFE.right),
      top: clampPct(p.top, SAFE.top, SAFE.bottom),
    };
  }
  function posFor(actionId: string): { left: number; top: number } | undefined {
    const a = anchors[actionId];
    if (a) {
      return clampPos({
        left: ((a.x * scale - offX) / vw) * 100,
        top: ((a.y * scale - offY) / vh) * 100,
      });
    }
    // Fallback positions are clamped too — they were tuned by eye and some sat
    // half off-screen or under the chronicle strip.
    return HOTSPOTS[actionId] ? clampPos(HOTSPOTS[actionId]) : undefined;
  }

  // Actions without any position at all get spread along the bottom.
  const unplaced = actions.filter((a) => !posFor(a.id));

  // Lay every button out first, nudging any that land on top of an earlier
  // one (clamping pulls edge positions inward, which can stack pills).
  const taken: { left: number; top: number }[] = [];
  function separate(pos: { left: number; top: number }): { left: number; top: number } {
    const p = { ...pos };
    for (let tries = 0; tries < 8; tries++) {
      const clash = taken.find(
        (o) => Math.abs(o.left - p.left) < 9 && Math.abs(o.top - p.top) < 6,
      );
      if (!clash) break;
      // Step upward out of the collision; if pinned at the top edge, sidestep.
      const up = clampPct(p.top - 7, SAFE.top, SAFE.bottom);
      if (up !== p.top) p.top = up;
      else p.left = clampPct(p.left + 10, SAFE.left, SAFE.right);
    }
    taken.push(p);
    return p;
  }
  const laidOut = actions.map((a, idx) => ({
    a,
    pos: separate(
      posFor(a.id) ??
        clampPos({ left: FALLBACK.left + (idx - unplaced.length / 2) * 14, top: FALLBACK.top }),
    ),
  }));

  return (
    <div className={`hotspot-layer${busyAction ? " busy" : ""}`}>
      {laidOut.map(({ a, pos }) => {
        // Low-sitting buttons open their cue upward so it never leaves the screen.
        const cueAbove = pos.top > 60;
        const active = busyAction === a.id;
        const crime = CRIMES[a.id];
        const hint = crime
          ? `${a.hint} · ~${Math.round(crimeSuccessChance(state.character, crime))}% success`
          : a.hint;
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
              title={hint}
            >
              <span className="hotspot-icon">{ICONS[a.id] ?? "•"}</span>
              <span className="hotspot-label">
                {a.id === "delve" && settlement ? `Delve ${dungeonNameFor(settlement)}` : a.label}
              </span>
            </button>

            {active && (
              <div className={`hotspot-cue${cueAbove ? " above" : ""}`}>
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
      {feedback && <FeedbackChip feedback={feedback} pos={posFor(feedback.actionId) ?? FALLBACK} />}
    </div>
  );
}
