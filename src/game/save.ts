// ---------------------------------------------------------------------------
// save.ts — persistence. Two layers:
//   1. localStorage — automatic, so a page refresh resumes where you were.
//   2. Portable save FILES — the player downloads a .json they own and can keep
//      anywhere (Drive, USB, another computer), then loads it to restore. This
//      is the durable store that survives a cleared cache and moves between
//      devices, since the game has no server (GDD: single-player, client-only).
// ---------------------------------------------------------------------------

import { SAVE_VERSION } from "./config";
import { generateWorldMap, hexKey, hexNeighbors } from "./worldmap";
import type { GameState, HexCoord } from "./types";

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

// --- Migration -------------------------------------------------------------
// As the game's data shape evolves, SAVE_VERSION rises. A save from an older
// version is upgraded forward through this chain instead of being thrown away:
// MIGRATIONS[n] turns a version-n save into a version-(n+1) save. Keep each step
// small and additive (fill in new fields with sensible defaults).

type Migration = (state: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  // v5 → v6: gender + home ownership. Older heroes default to male, homeless,
  // with any existing partner/kin defaulted to the opposite/male so blending
  // and courtship keep working.
  5: (s) => {
    const c = s.character ?? {};
    return {
      ...s,
      character: {
        ...c,
        gender: c.gender ?? "male",
        ownsHome: c.ownsHome ?? false,
        suitor: c.suitor ? { ...c.suitor, gender: c.suitor.gender ?? "female" } : null,
        spouse: c.spouse ? { ...c.spouse, gender: c.spouse.gender ?? "female" } : null,
        children: Array.isArray(c.children)
          ? c.children.map((k: any) => ({ ...k, gender: k.gender ?? "male" }))
          : [],
      },
    };
  },
  // v6 → v7: unspent skill points (earned from adventuring).
  6: (s) => ({
    ...s,
    character: { ...(s.character ?? {}), skillPoints: s.character?.skillPoints ?? 0 },
  }),
  // v7 → v8: dungeon delves (M9). Older saves simply aren't mid-delve.
  7: (s) => ({ ...s, dungeon: s.dungeon ?? null }),
  // v8 → v9: the regional hex map (the "bigger world" arc). A pre-existing
  // save has, narratively, "always lived in the hamlet" — generate a map
  // deterministically from its own rngSeed and drop them at the origin.
  8: (s) => {
    if (s.map) return s; // already migrated (e.g. re-running migrations)
    const { map, seed } = generateWorldMap(s.rngSeed ?? 0);
    const hamletHex: HexCoord = { q: 0, r: 0 };
    const discovered = [hamletHex, ...hexNeighbors(hamletHex)].map(hexKey);
    return {
      ...s,
      rngSeed: seed,
      map,
      discovered,
      location: { hex: hamletHex, settlementId: "hamlet" },
      mapOpen: false,
      roadEncounter: null,
    };
  },
  // v9 → v10: per-settlement homes + settlement tiers/names (Town Generation
  // & Identity). A pre-existing homeowner's house is attributed to the
  // hamlet — the only settlement with any meaningful presence before now.
  9: (s) => ({
    ...s,
    character: {
      ...(s.character ?? {}),
      homeSettlementId: s.character?.ownsHome ? "hamlet" : null,
    },
  }),
};

/**
 * Bring a parsed save up to the current version. Throws a clear Error if the
 * save is newer than this build, or older than any available upgrade path.
 */
function coerceToCurrent(state: any): GameState {
  const from = typeof state?.version === "number" ? state.version : 0;
  if (from > SAVE_VERSION) {
    throw new Error(
      `That save is from a newer version of the game (v${from}); this build is v${SAVE_VERSION}.`,
    );
  }
  let s = state;
  for (let v = from; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) {
      throw new Error(
        `That save is from an older version (v${from}) that can no longer be upgraded.`,
      );
    }
    s = step(s);
  }
  s = { ...s, version: SAVE_VERSION };
  if (!s || typeof s !== "object" || !s.character || typeof s.day !== "number") {
    throw new Error("That save is missing or corrupt.");
  }
  return s as GameState;
}

/** Write the current run to localStorage. Called after every action. */
export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private-mode or full storage — non-fatal; the game just won't persist.
  }
}

/** Read a saved run, upgrading it if it's from an older version. Null if there
 *  isn't one, or it can't be read/upgraded. */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return coerceToCurrent(JSON.parse(raw));
  } catch {
    return null; // corrupt or unupgradable — start fresh rather than crash
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
  // The wrapper's version is authoritative; upgrade the game inside it forward.
  return coerceToCurrent({ ...file.state, version: file.version });
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
