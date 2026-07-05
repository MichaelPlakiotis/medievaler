// ---------------------------------------------------------------------------
// ActionMenu.tsx — the buttons for whatever the player can do this turn. It asks
// the engine which actions belong to the current phase, then renders one button
// each. Clicking calls back up to GameScreen, which runs it through the engine.
// ---------------------------------------------------------------------------

import { availableActions } from "../game/actions";
import type { GameState } from "../game/types";

export function ActionMenu({
  state,
  onAct,
  disabled,
}: {
  state: GameState;
  onAct: (actionId: string) => void;
  disabled: boolean;
}) {
  const actions = availableActions(state.phase);

  return (
    <div className="panel">
      <h2>{state.phase === "day" ? "The hamlet" : "After dark"}</h2>
      <div className="actions">
        {actions.map((a) => (
          <button
            key={a.id}
            className="action"
            onClick={() => onAct(a.id)}
            disabled={disabled}
          >
            <span>{a.label}</span>
            <span className="hint">{a.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
