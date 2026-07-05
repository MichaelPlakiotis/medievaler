// ---------------------------------------------------------------------------
// App.tsx — the top-level switch. If there's a live run in state, show the game;
// otherwise show character creation. On first load we try to restore a save.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { newGame } from "./game/engine";
import { clearGame, loadGame } from "./game/save";
import type { Attributes, GameState } from "./game/types";
import { CharacterCreation } from "./ui/CharacterCreation";
import { GameScreen } from "./ui/GameScreen";

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

  return (
    <div className="app">
      <h1 className="title">Hearthbound</h1>
      <p className="subtitle">Live a medieval life, one day at a time.</p>

      {state ? (
        <GameScreen state={state} setState={setState} onNewLife={newLife} />
      ) : (
        <CharacterCreation onBegin={begin} />
      )}
    </div>
  );
}
