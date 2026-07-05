// ---------------------------------------------------------------------------
// save.ts — persistence. Single-player and no server, so a "save file" is just
// the GameState written to the browser's localStorage as text (JSON). It stays
// on this device until cleared.
// ---------------------------------------------------------------------------

import { SAVE_VERSION } from "./config";
import type { GameState } from "./types";

const KEY = "hearthbound.save";

/** Write the current run to localStorage. Called after every action. */
export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private-mode or full storage — non-fatal; the game just won't persist.
  }
}

/** Read a saved run, or null if there isn't a compatible one. */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state.version !== SAVE_VERSION) return null; // ignore old/incompatible saves
    return state;
  } catch {
    return null;
  }
}

/** Delete the saved run (used by "New Life"). */
export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}
