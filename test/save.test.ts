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
    expect(restored.character.skillPoints).toBe(0); // v6→v7
    expect(restored.dungeon).toBeNull(); // v7→v8
    expect(restored.map.settlements.length).toBeGreaterThan(0); // v8→v9
    expect(restored.location).toEqual({ hex: { q: 0, r: 0 }, settlementId: "hamlet" });
    expect(restored.character.ownedHomes).toEqual([]); // v10→v11 (never owned a home)
    expect(restored.character.familySettlementId).toBeNull();
  });

  it("upgrades a v7 save forward (adds the dungeon field)", () => {
    const v7state = { ...midGame() } as any;
    delete v7state.dungeon;
    v7state.version = 7;
    const file = JSON.stringify({ app: "hearthbound", version: 7, state: v7state });

    const restored = parseSave(file);
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.dungeon).toBeNull();
  });

  it("upgrades a v8 save forward (adds the regional map + location, deterministically)", () => {
    const v8state = { ...midGame() } as any;
    delete v8state.map;
    delete v8state.discovered;
    delete v8state.location;
    delete v8state.mapOpen;
    delete v8state.roadEncounter;
    v8state.version = 8;
    const file = JSON.stringify({ app: "hearthbound", version: 8, state: v8state });

    const restored = parseSave(file);
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.location).toEqual({ hex: { q: 0, r: 0 }, settlementId: "hamlet" });
    expect(restored.mapOpen).toBe(false);
    expect(restored.roadEncounter).toBeNull();
    expect(restored.discovered.length).toBeGreaterThan(0);
    expect(restored.map.settlements[0]).toMatchObject({ id: "hamlet", kind: "hamlet" });

    // Deterministic: migrating the same v8 save twice yields the same map.
    const restoredAgain = parseSave(file);
    expect(restoredAgain.map).toEqual(restored.map);
  });

  it("upgrades a v9 save forward, attributing an existing home to the hamlet", () => {
    const v9owner = { ...midGame() } as any;
    delete v9owner.character.homeSettlementId;
    v9owner.character.ownsHome = true;
    v9owner.version = 9;
    const owned = parseSave(JSON.stringify({ app: "hearthbound", version: 9, state: v9owner }));
    expect(owned.version).toBe(SAVE_VERSION);
    expect(owned.character.ownedHomes).toEqual(["hamlet"]);
    expect(owned.character.familySettlementId).toBe("hamlet");

    const v9renter = { ...midGame() } as any;
    delete v9renter.character.homeSettlementId;
    v9renter.character.ownsHome = false;
    v9renter.version = 9;
    const rented = parseSave(JSON.stringify({ app: "hearthbound", version: 9, state: v9renter }));
    expect(rented.character.ownedHomes).toEqual([]);
    expect(rented.character.familySettlementId).toBeNull();
  });

  it("upgrades a v10 save: regenerated world with water & roads, character home in Lazy Springs", () => {
    const v10 = { ...midGame() } as any;
    v10.character = { ...v10.character, ownsHome: true, homeSettlementId: "hamlet" };
    delete v10.character.ownedHomes;
    delete v10.character.familySettlementId;
    v10.version = 10;
    const file = JSON.stringify({ app: "hearthbound", version: 10, state: v10 });

    const restored = parseSave(file);
    expect(restored.version).toBe(SAVE_VERSION);
    // The character keeps their deed and household, translated to the new shape.
    expect(restored.character.ownedHomes).toEqual(["hamlet"]);
    expect(restored.character.familySettlementId).toBe("hamlet");
    expect((restored.character as any).ownsHome).toBeUndefined();
    // The world is the new, bigger one: water, roads, structures on settlements.
    expect(restored.map.roads.length).toBeGreaterThan(0);
    expect(Object.values(restored.map.terrain)).toContain("water");
    for (const s of restored.map.settlements) expect(s.structures.length).toBeGreaterThan(0);
    // Exploration reset: back home at the origin, fog re-drawn.
    expect(restored.location).toEqual({ hex: { q: 0, r: 0 }, settlementId: "hamlet" });
    expect(restored.mapOpen).toBe(false);
    // Deterministic (same rngSeed in → same map out).
    expect(parseSave(file).map).toEqual(restored.map);
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
