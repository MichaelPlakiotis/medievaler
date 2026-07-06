// ---------------------------------------------------------------------------
// App.tsx — the top-level switch. The animated town sits behind everything and
// shifts with the day/dusk/night cycle. In front: character creation, or the
// game itself once a life is under way. On first load we try to restore a save.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { newGame } from "./game/engine";
import { clearGame, loadGame, saveGame } from "./game/save";
import type { Attributes, GameState } from "./game/types";
import type { TimeOfDay } from "./scene/townScene";
import { CharacterCreation } from "./ui/CharacterCreation";
import { GameScreen } from "./ui/GameScreen";
import { TownBackground } from "./ui/TownBackground";

/** Map the game's state to the scene's time of day. */
function timeOfDayFor(state: GameState | null): TimeOfDay {
  if (!state) return "Day";
  if (state.awaitingRest) return "Sunset"; // dusk — deciding whether to rest
  return state.phase === "night" ? "Night" : "Day";
}

export function App() {
  // Lazy initializer: runs once, restoring a saved run if there is one.
  const [state, setState] = useState<GameState | null>(() => loadGame());

  function begin(name: string, allocation: Attributes) {
    setState(newGame(name, allocation));
  }

  function newLife() {
    clearGame();
    setState(null);
  }

  // Resume a game restored from a save file, and mirror it into localStorage so
  // this browser auto-resumes it from here on.
  function loadState(next: GameState) {
    setState(next);
    saveGame(next);
  }

  return (
    <>
      <TownBackground timeOfDay={timeOfDayFor(state)} />
      <div className="app">
        {state ? (
          <GameScreen
            state={state}
            setState={setState}
            onNewLife={newLife}
            onLoad={loadState}
          />
        ) : (
          <div className="center-stage">
            <h1 className="title">Hearthbound</h1>
            <p className="subtitle">Live a medieval life, one day at a time.</p>
            <CharacterCreation onBegin={begin} onLoad={loadState} />
          </div>
        )}
      </div>
    </>
  );
}
