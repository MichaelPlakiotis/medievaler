// ---------------------------------------------------------------------------
// ActionMenu.tsx — the buttons for whatever the player can do this turn. It asks
// the engine which actions belong to the current phase, then renders one button
// each. Clicking calls back up to GameScreen, which runs it through the engine.
// ---------------------------------------------------------------------------

import { availableActions } from "../game/actions";
import { familyActions } from "../game/family";
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
  // Normal actions for the phase, plus any daytime family choices (GDD §7.3).
  const actions = [
    ...availableActions(state.phase),
    ...(state.phase === "day" ? familyActions(state.character) : []),
  ];

  return (
    <div className="panel">
      <h2>{state.phase === "day" ? "The hamlet" : "After dark"}</h2>
      <div className="actions">
        {actions.map((a) => (
          <button
            key={a.id}
            className={`action${a.danger ? " danger" : ""}`}
            onClick={() => onAct(a.id)}
            disabled={disabled}
          >
            <span>
              {a.danger ? "⚔ " : ""}
              {a.label}
            </span>
            <span className="hint">{a.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
