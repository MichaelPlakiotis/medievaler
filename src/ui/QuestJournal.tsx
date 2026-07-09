// ---------------------------------------------------------------------------
// QuestJournal.tsx — the ledger's record of the family's undertakings: every
// active quest with its progress and giver, plus a tally of what the line has
// finished across the generations.
// ---------------------------------------------------------------------------

import { NPCS, npcWhereabouts } from "../game/npcs";
import { activeQuests, questsDoneCount } from "../game/quests";
import type { GameState } from "../game/types";

export function QuestJournal({ state }: { state: GameState }) {
  const active = activeQuests(state);
  const done = questsDoneCount(state);

  return (
    <div className="panel">
      <h2>Undertakings</h2>
      {active.length === 0 && (
        <p className="muted">
          No open quests. The folk of the region have jobs for those who ask — seek them out in
          the settlements.
        </p>
      )}
      {active.map(({ quest, progress, needed }) => (
        <p key={quest.id}>
          <strong>{quest.name}</strong> — {quest.objectiveText}
          {needed > 1 && ` (${progress}/${needed})`}
          <br />
          <span className="muted">
            {progress >= needed
              ? `Done — report back to ${NPCS[quest.giver].name} (${npcWhereabouts(state, quest.giver)}).`
              : `For ${NPCS[quest.giver].name} (${npcWhereabouts(state, quest.giver)}).`}
          </span>
        </p>
      ))}
      {done > 0 && (
        <p className="muted">
          The family has seen {done} {done === 1 ? "undertaking" : "undertakings"} through, across{" "}
          {state.generation} {state.generation === 1 ? "generation" : "generations"}.
        </p>
      )}
    </div>
  );
}
