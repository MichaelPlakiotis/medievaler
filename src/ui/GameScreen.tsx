// ---------------------------------------------------------------------------
// GameScreen.tsx — the main play view. It owns the live GameState and wires the
// panels to the engine. The pattern throughout: a click calls an engine
// function, we get a NEW state back, we store it (which re-renders) and save it.
// ---------------------------------------------------------------------------

import { sleep, stayUp, takeAction } from "../game/engine";
import { saveGame } from "../game/save";
import type { GameState } from "../game/types";
import { StatPanel } from "./StatPanel";
import { ActionMenu } from "./ActionMenu";
import { EventLog } from "./EventLog";
import { RestDecision } from "./RestDecision";

export function GameScreen({
  state,
  setState,
  onNewLife,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  onNewLife: () => void;
}) {
  // Every state change goes through here so we save on the same beat we render.
  function commit(next: GameState) {
    setState(next);
    saveGame(next);
  }

  return (
    <>
      <StatPanel state={state} />

      {state.awaitingRest ? (
        <RestDecision
          onSleep={() => commit(sleep(state))}
          onStayUp={() => commit(stayUp(state))}
        />
      ) : (
        <ActionMenu
          state={state}
          disabled={false}
          onAct={(id) => commit(takeAction(state, id))}
        />
      )}

      <EventLog log={state.log} />

      <div className="row-between">
        <span className="muted">Progress saves automatically on this device.</span>
        <button
          className="danger"
          onClick={() => {
            if (confirm("Abandon this life and start over? This can't be undone.")) {
              onNewLife();
            }
          }}
        >
          New life
        </button>
      </div>
    </>
  );
}
