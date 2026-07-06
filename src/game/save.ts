// ---------------------------------------------------------------------------
// save.ts — persistence. Two layers:
//   1. localStorage — automatic, so a page refresh resumes where you were.
//   2. Portable save FILES — the player downloads a .json they own and can keep
//      anywhere (Drive, USB, another computer), then loads it to restore. This
//      is the durable store that survives a cleared cache and moves between
//      devices, since the game has no server (GDD: single-player, client-only).
// ---------------------------------------------------------------------------

import { SAVE_VERSION } from "./config";
import type { GameState } from "./types";

const KEY = "hearthbound.save";

/** Tag written into exported files so we can recognise (and vet) our own saves. */
const FILE_TAG = "hearthbound";

/** The on-disk wrapper around a saved game — self-describing and future-proof. */
interface SaveFile {
  app: string;
  version: number;
  exportedAt: string;
  state: GameState;
}

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

// --- Portable save files ---------------------------------------------------

/** Serialize the current game into the text of a downloadable save file. Pure. */
export function exportSave(state: GameState): string {
  const file: SaveFile = {
    app: FILE_TAG,
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse and validate the text of a save file, returning the game inside it.
 * Throws a clear Error if the text isn't one of our saves or is from an
 * incompatible version — callers show that message to the player. Pure.
 */
export function parseSave(text: string): GameState {
  let file: SaveFile;
  try {
    file = JSON.parse(text) as SaveFile;
  } catch {
    throw new Error("That doesn't look like a save file (it isn't valid JSON).");
  }
  if (!file || file.app !== FILE_TAG) {
    throw new Error("That file isn't a Hearthbound save.");
  }
  if (file.version !== SAVE_VERSION) {
    throw new Error(
      `That save is from a different version of the game (v${file.version}); this is v${SAVE_VERSION}.`,
    );
  }
  const s = file.state;
  if (!s || typeof s !== "object" || !s.character || typeof s.day !== "number") {
    throw new Error("That save file is missing or corrupt.");
  }
  return s;
}

/** A friendly, filesystem-safe filename for a downloaded save. */
export function saveFilename(state: GameState): string {
  const name = (state.character?.name || "wanderer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wanderer";
  return `hearthbound-${name}-day${state.day}.json`;
}

/** Trigger a browser download of the current game as a save file. Browser-only. */
export function downloadSave(state: GameState): void {
  const blob = new Blob([exportSave(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = saveFilename(state);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a tick to start before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a picked file and return the game inside it (rejects with a clear Error). */
export async function readSaveFile(file: File): Promise<GameState> {
  const text = await file.text();
  return parseSave(text);
}
