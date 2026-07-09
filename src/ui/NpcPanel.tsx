// ---------------------------------------------------------------------------
// NpcPanel.tsx — a conversation with a named quest-giver (npcs.ts/quests.ts).
// Opens as a modal, shop-style: browsing the talk is free, the turn is spent
// on leaving. Shows whichever beat the NPC's chain is at: an offer to accept,
// a locked hint, progress on the current job, a turn-in, or a farewell.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { NPCS } from "../game/npcs";
import { npcQuestView, rewardSummary } from "../game/quests";
import type { NpcStance } from "../scene/npcSprites";
import type { GameState } from "../game/types";
import { NpcSprite } from "./NpcSprite";

/** How long the opening "talking at you" beat lasts before the pose settles. */
const GREET_MS = 2200;

/** The settled stance for each beat of the conversation: pitching a job is a
 *  lean-and-point, waiting on you is patient idling, a due report (or a talk
 *  quest) has them animated again. */
function beatStance(viewKind: string, ready: boolean): NpcStance {
  if (viewKind === "offer") return "point";
  if (viewKind === "active" && ready) return "talk";
  return "idle";
}

export function NpcPanel({
  state,
  onAccept,
  onTurnIn,
  onLeave,
}: {
  state: GameState;
  onAccept: (questId: string) => void;
  onTurnIn: (questId: string) => void;
  onLeave: () => void;
}) {
  const npc = state.npcOpen ? NPCS[state.npcOpen] : null;
  const view = npc ? npcQuestView(state, npc.id) : null;
  const viewKind = view?.kind ?? "exhausted";
  const ready = view?.kind === "active" && view.ready;

  // Every new beat of the conversation (opening, or the moment a quest is
  // accepted / turned in and the view changes) starts with them talking, then
  // settles into that beat's stance.
  const [greeting, setGreeting] = useState(true);
  useEffect(() => {
    setGreeting(true);
    const timer = window.setTimeout(() => setGreeting(false), GREET_MS);
    return () => window.clearTimeout(timer);
  }, [viewKind, npc?.id]);

  if (!npc || !view) return null;
  const stance: NpcStance = greeting ? "talk" : beatStance(view.kind, ready);

  return (
    <div className="panel">
      <div style={{ display: "flex", gap: "0.9rem", alignItems: "flex-end" }}>
        <NpcSprite npcId={npc.id} stance={stance} />
        <div>
          <h2 style={{ marginBottom: 0 }}>{npc.name}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {npc.title}
          </p>
        </div>
      </div>
      <p>{npc.greeting}</p>

      {view.kind === "offer" && (
        <>
          <h3>{view.quest.name}</h3>
          <p>{view.quest.offer}</p>
          <p className="muted">
            Task: {view.quest.objectiveText}
            <br />
            Reward: {rewardSummary(view.quest)}
          </p>
        </>
      )}

      {view.kind === "locked" && (
        <>
          <h3>{view.quest.name}</h3>
          <p className="muted">{view.reason}</p>
        </>
      )}

      {view.kind === "active" && (
        <>
          <h3>{view.quest.name}</h3>
          {view.ready ? (
            <p>You've done what was asked. Time to say so.</p>
          ) : (
            <p className="muted">
              “How goes it?” — {view.quest.objectiveText}
              {view.needed > 1 && ` (${view.progress} of ${view.needed})`}
            </p>
          )}
        </>
      )}

      {view.kind === "exhausted" && <p className="muted">{npc.farewell}</p>}

      <div className="row-between">
        <button className="ghost" onClick={onLeave}>
          Take your leave
        </button>
        {view.kind === "offer" && (
          <button onClick={() => onAccept(view.quest.id)}>Take the job</button>
        )}
        {view.kind === "active" && view.ready && (
          <button onClick={() => onTurnIn(view.quest.id)}>Report back</button>
        )}
      </div>
    </div>
  );
}
