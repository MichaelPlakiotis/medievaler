// ---------------------------------------------------------------------------
// GameOver.tsx — shown when the character has died with no heir (GDD §4.4). For
// now death is the end of the run; the generational hand-off is a later
// milestone, so the only way onward is a new life.
// ---------------------------------------------------------------------------

import type { GameState } from "../game/types";

export function GameOver({
  state,
  onNewLife,
}: {
  state: GameState;
  onNewLife: () => void;
}) {
  const c = state.character;
  return (
    <div className="panel">
      <h2>Here ends the tale</h2>
      <p className="muted">
        {c.name} died at {c.ageYears}
        {state.deathCause ? ` — ${state.deathCause}` : ""}, on day {state.day}, having reached
        level {c.level}. No child of age carries the name, so this story is over.
      </p>
      <p className="muted">
        Marry and raise a family, and one day an heir could take up your legacy here instead.
      </p>
      <button className="danger" style={{ width: "100%", padding: 14 }} onClick={onNewLife}>
        Begin a new life
      </button>
    </div>
  );
}
