// ---------------------------------------------------------------------------
// save.ts — persistence. Two layers:
//   1. localStorage — automatic, so a page refresh resumes where you were.
//   2. Portable save FILES — the player downloads a .json they own and can keep
//      anywhere (Drive, USB, another computer), then loads it to restore. This
//      is the durable store that survives a cleared cache and moves between
//      devices, since the game has no server (GDD: single-player, client-only).
// ---------------------------------------------------------------------------

import { SAVE_VERSION } from "./config";
import { addSpire, generateWorldMap, hexKey, hexNeighbors, placeSites } from "./worldmap";
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
  // v10 → v11: the bigger world (water, roads, per-settlement structures) and
  // multi-home ownership. The old map lacks all three and is a different size,
  // so it's regenerated — exploration resets, the character comes home to
  // Lazy Springs, and everything they own and love travels with them.
  10: (s) => {
    const c = s.character ?? {};
    const { map, seed } = generateWorldMap(s.rngSeed ?? 0);
    const hamletHex: HexCoord = { q: 0, r: 0 };
    const discovered = [hamletHex, ...hexNeighbors(hamletHex)].map(hexKey);
    const ownedHomes =
      c.ownsHome && c.homeSettlementId ? [c.homeSettlementId] : c.ownsHome ? ["hamlet"] : [];
    // The old home's settlement id may not exist on the regenerated map — if
    // so, the deed transfers to the hamlet (ids are stable per tier index, so
    // in practice only removed ids would remap).
    const validHomes = ownedHomes.map((id: string) =>
      map.settlements.some((st) => st.id === id) ? id : "hamlet",
    );
    const character = { ...c, ownedHomes: validHomes, familySettlementId: validHomes[0] ?? null };
    delete character.ownsHome;
    delete character.homeSettlementId;
    const log = Array.isArray(s.log) ? s.log : [];
    const nextId = log.length > 0 ? log[log.length - 1].id + 1 : 1;
    return {
      ...s,
      rngSeed: seed,
      character,
      map,
      discovered,
      location: { hex: hamletHex, settlementId: "hamlet" },
      mapOpen: false,
      roadEncounter: null,
      log: [
        ...log,
        { id: nextId, text: "The world feels wider than you remembered — new roads, new waters, new places to see.", tone: "neutral" },
      ],
    };
  },
  // v11 → v12: structured combat events (battle-screen effects). Only matters
  // for a save made mid-fight.
  11: (s) =>
    s.combat ? { ...s, combat: { ...s.combat, events: s.combat.events ?? [] } } : s,
  // v12 → v13: the spellbook + world ruins. Older worlds gain ruin sites
  // in place (no map reset); characters learn what they always knew.
  12: (s) => {
    const character = {
      ...(s.character ?? {}),
      knownSpells: s.character?.knownSpells ?? ["force_bolt"],
    };
    let map = s.map;
    let rngSeed = s.rngSeed ?? 0;
    if (map && !map.sites) {
      const placed = placeSites(map, rngSeed);
      map = { ...map, sites: placed.sites };
      rngSeed = placed.seed;
    }
    const dungeon = s.dungeon
      ? {
          ...s.dungeon,
          name: s.dungeon.name ?? "the Old Barrow",
          tier: s.dungeon.tier ?? 1,
          siteId: s.dungeon.siteId ?? null,
        }
      : s.dungeon;
    return { ...s, character, map, rngSeed, dungeon };
  },
  // v13 → v14: NPCs & the Ashveil questline. An older save has, narratively,
  // never spoken to anyone worth naming — a first generation with clean books.
  13: (s) => ({
    ...s,
    quests: s.quests ?? {},
    generation: s.generation ?? 1,
    npcOpen: s.npcOpen ?? null,
  }),
  // v14 → v15: survival (hunger/stamina), the family pantry fund, town-gate
  // prompts, sleeping-rough ambushes, pack combat, and Varek's Spire. A save
  // mid-fight upgrades its single foe into a pack of one.
  14: (s) => {
    const c = s.character ?? {};
    let combat = s.combat ?? null;
    if (combat && !combat.enemies) {
      const { enemy, ...rest } = combat;
      combat = { ...rest, enemies: [enemy], target: 0 };
    }
    const map = s.map ? addSpire(s.map) : s.map;
    return {
      ...s,
      character: {
        ...c,
        hunger: c.hunger ?? 0,
        stamina: c.stamina ?? 100,
        familyFund: c.familyFund ?? 0,
        familyNeglect: c.familyNeglect ?? 0,
      },
      combat,
      map,
      townPrompt: s.townPrompt ?? null,
      nightAmbush: s.nightAmbush ?? false,
      victory: s.victory ?? null,
    };
  },
  // v15 → v16: the wider world (a larger map with more settlements and ruins),
  // waypoint fast travel, and horses. The map is regenerated to the new size
  // (v10 precedent) unless the save is mid-delve/mid-fight/mid-encounter, in
  // which case the old world stays until that resolves. Settlement ids are
  // stable per tier index and counts only grew, so owned homes carry over.
  15: (s) => {
    const c = s.character ?? {};
    const character = { ...c, horse: c.horse ?? null };
    const homes: string[] = Array.isArray(c.ownedHomes) ? c.ownedHomes : [];
    const midSomething = s.dungeon || s.combat || s.roadEncounter || s.townPrompt;

    if (midSomething || !s.map) {
      // Keep the old world; waypoints are the places the character plainly knows.
      const waypoints = [
        ...new Set(["hamlet", ...homes, ...(s.location?.settlementId ? [s.location.settlementId] : [])]),
      ];
      return { ...s, character, waypoints: s.waypoints ?? waypoints };
    }

    const { map, seed } = generateWorldMap(s.rngSeed ?? 0);
    const hamletHex: HexCoord = { q: 0, r: 0 };
    let discovered = [hamletHex, ...hexNeighbors(hamletHex)].map(hexKey);
    // The final hunt already marked the Spire — keep it marked on the new map.
    if (s.quests?.the_pale_architect?.status === "active") {
      const spire = map.sites.find((st) => st.id === "spire");
      if (spire) discovered = [...new Set([...discovered, hexKey(spire.hex)])];
    }
    const waypoints = [...new Set(["hamlet", ...homes])];
    const log = Array.isArray(s.log) ? s.log : [];
    const nextId = log.length > 0 ? log[log.length - 1].id + 1 : 1;
    return {
      ...s,
      rngSeed: seed,
      character,
      map,
      discovered,
      waypoints,
      location: { hex: hamletHex, settlementId: "hamlet" },
      mapOpen: false,
      log: [
        ...log,
        {
          id: nextId,
          text: "The maps have been redrawn — the world is wider than anyone knew, and the carters now keep waypoint ledgers for travelers like you.",
          tone: "neutral",
        },
      ],
    };
  },
  // v16 → v17: the sea. The continent now ends in open ocean; harbors offer
  // boats, and Varek's Spire stands on an island only those boats can reach.
  // Varek himself no longer heals between attempts (GameState.lichHp). The
  // map is regenerated for the coastline (v15 precedent), unless the save is
  // mid-delve/mid-fight — those keep their old landlocked world for good
  // (empty port list, spire on the mainland as before); everything else
  // about the sea update still applies to them.
  16: (s) => {
    const lichHp =
      typeof s.lichHp === "number" ? s.lichHp : s.victory ? 0 : 300; // ENEMIES.varek_ashveil.maxHp
    const midSomething = s.dungeon || s.combat || s.roadEncounter || s.townPrompt;

    if (midSomething || !s.map) {
      const map = s.map
        ? { ...s.map, ports: s.map.ports ?? [], lichIsland: s.map.lichIsland ?? [] }
        : s.map;
      return { ...s, lichHp, map };
    }

    const { map, seed } = generateWorldMap(s.rngSeed ?? 0);
    const hamletHex: HexCoord = { q: 0, r: 0 };
    let discovered = [hamletHex, ...hexNeighbors(hamletHex)].map(hexKey);
    // The final hunt already marked the Spire — keep the island and the
    // harbors marked on the redrawn map too.
    if (s.quests?.the_pale_architect?.status === "active") {
      const keys = new Set(discovered);
      for (const k of map.lichIsland) keys.add(k);
      for (const p of map.ports) keys.add(hexKey(p.hex));
      discovered = [...keys];
    }
    const log = Array.isArray(s.log) ? s.log : [];
    const nextId = log.length > 0 ? log[log.length - 1].id + 1 : 1;
    return {
      ...s,
      rngSeed: seed,
      lichHp,
      map,
      discovered,
      location: { hex: hamletHex, settlementId: "hamlet" },
      mapOpen: false,
      log: [
        ...log,
        {
          id: nextId,
          text: "Sailors' charts have reached the settlements: the land ends in open sea, harbors dot the coast — and far out in the grey water stands an island no road has ever touched.",
          tone: "neutral",
        },
      ],
    };
  },
  // v17 → v18: partners age. Suitors and spouses gain a birthDay (children can
  // now be tried for, uncapped, until either parent turns 50 — family.ts
  // fertileCouple). An existing partner is assumed the character's own age.
  17: (s) => {
    const c = s.character ?? {};
    return {
      ...s,
      character: {
        ...c,
        suitor: c.suitor ? { ...c.suitor, birthDay: c.suitor.birthDay ?? c.birthDay ?? 0 } : null,
        spouse: c.spouse ? { ...c.spouse, birthDay: c.spouse.birthDay ?? c.birthDay ?? 0 } : null,
      },
    };
  },
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
