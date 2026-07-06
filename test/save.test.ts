// ---------------------------------------------------------------------------
// save.test.ts — the portable save-file layer (export → file text → parse).
// Only the pure helpers are tested; downloadSave/readSaveFile are thin browser
// wrappers over these.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { exportSave, parseSave, saveFilename } from "../src/game/save";
import { newGame, takeAction } from "../src/game/engine";
import { SAVE_VERSION } from "../src/game/config";
import type { Attributes } from "../src/game/types";

const build: Attributes = { STR: 2, AGI: 3, SMT: 2, CHA: 1 };

function midGame() {
  let s = newGame("Aldreth", build, 42);
  s = takeAction(s, "work");
  s = takeAction(s, "tavern");
  return s;
}

describe("export / parse round-trip", () => {
  it("a saved game survives a trip through a file unchanged", () => {
    const state = midGame();
    const restored = parseSave(exportSave(state));
    expect(restored).toEqual(state);
  });

  it("exported files are tagged and versioned", () => {
    const file = JSON.parse(exportSave(midGame()));
    expect(file.app).toBe("hearthbound");
    expect(file.version).toBe(SAVE_VERSION);
    expect(typeof file.exportedAt).toBe("string");
  });
});

describe("parseSave validation", () => {
  it("rejects non-JSON", () => {
    expect(() => parseSave("not a save at all")).toThrow(/valid JSON/i);
  });

  it("rejects files that aren't ours", () => {
    expect(() => parseSave(JSON.stringify({ app: "something-else", state: {} }))).toThrow(
      /Hearthbound save/i,
    );
  });

  it("rejects an older version with no upgrade path", () => {
    const stale = JSON.stringify({ app: "hearthbound", version: 1, state: {} });
    expect(() => parseSave(stale)).toThrow(/older version|can no longer be upgraded/i);
  });

  it("rejects a save from a newer build", () => {
    const future = JSON.stringify({ app: "hearthbound", version: SAVE_VERSION + 1, state: {} });
    expect(() => parseSave(future)).toThrow(/newer version/i);
  });

  it("upgrades a v5 save forward through the whole chain", () => {
    // A minimal v5-shaped save that predates gender/home/skill points.
    const v5state = { ...midGame() } as any;
    delete v5state.character.gender;
    delete v5state.character.ownsHome;
    delete v5state.character.skillPoints;
    v5state.version = 5;
    const file = JSON.stringify({ app: "hearthbound", version: 5, state: v5state });

    const restored = parseSave(file);
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.character.gender).toBe("male"); // v5→v6
    expect(restored.character.ownsHome).toBe(false); // v5→v6
    expect(restored.character.skillPoints).toBe(0); // v6→v7
  });

  it("rejects a tagged file with a corrupt/missing game", () => {
    const bad = JSON.stringify({ app: "hearthbound", version: SAVE_VERSION, state: { day: "nope" } });
    expect(() => parseSave(bad)).toThrow(/missing or corrupt/i);
  });
});

describe("saveFilename", () => {
  it("is friendly and filesystem-safe", () => {
    const s = { ...newGame("Aldreth the Bold!", build, 1), day: 12 };
    expect(saveFilename(s)).toBe("hearthbound-aldreth-the-bold-day12.json");
  });

  it("falls back when the name is empty", () => {
    const s = newGame("", build, 1);
    expect(saveFilename(s)).toMatch(/^hearthbound-wanderer-day\d+\.json$/);
  });
});
