// ---------------------------------------------------------------------------
// App.tsx — the top-level switch. The animated town sits behind everything and
// shifts with the day/dusk/night cycle. In front: character creation, or the
// game itself once a life is under way. On first load we try to restore a save.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { newGame } from "./game/engine";
import { clearGame, loadGame, saveGame } from "./game/save";
import type { Attributes, Gender, GameState } from "./game/types";
import type { SceneSettlement, TimeOfDay } from "./scene/townScene";
import { heroLookOf } from "./scene/sprites";
import { CharacterCreation } from "./ui/CharacterCreation";
import { GameScreen } from "./ui/GameScreen";
import { TownBackground } from "./ui/TownBackground";

/** Map the game's state to the scene's time of day. */
function timeOfDayFor(state: GameState | null): TimeOfDay {
  if (!state) return "Day";
  if (state.awaitingRest) return "Sunset"; // dusk — deciding whether to rest
  return state.phase === "night" ? "Night" : "Day";
}

/** Which settlement the scene should currently render (null while out on the
 *  open road between settlements — the map screen covers the town then). */
function currentSettlement(state: GameState | null): SceneSettlement | null {
  if (!state) return null;
  const s = state.map.settlements.find((st) => st.id === state.location.settlementId);
  return s ? { id: s.id, kind: s.kind } : null;
}

export function App() {
  // Lazy initializer: runs once, restoring a saved run if there is one.
  const [state, setState] = useState<GameState | null>(() => loadGame());
  // Where the hero is in the town: an action id while one plays, else "idle".
  const [heroSpot, setHeroSpot] = useState("idle");

  function begin(name: string, allocation: Attributes, gender: Gender) {
    setState(newGame(name, allocation, undefined, gender));
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
      <TownBackground
        timeOfDay={timeOfDayFor(state)}
        heroLook={state && !state.dead ? heroLookOf(state.character) : null}
        heroSpot={heroSpot}
        settlement={currentSettlement(state)}
        homeSettlementId={state?.character.homeSettlementId ?? null}
      />
      <div className="app">
        {state ? (
          <GameScreen
            state={state}
            setState={setState}
            onNewLife={newLife}
            onLoad={loadState}
            onHeroSpot={setHeroSpot}
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
