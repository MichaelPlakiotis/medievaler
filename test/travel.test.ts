// ---------------------------------------------------------------------------
// travel.test.ts — leaving a settlement and crossing the hex map (the
// "bigger world" arc, Milestone A). Randomness runs off a fixed seed, so we
// can drive moves and encounters and assert exact outcomes.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, resolveRoadEncounter, takeAction, travelTo } from "../src/game/engine";
import { TOUGH_ENEMIES } from "../src/game/enemies";
import { moveTo, resolveRoadEncounter as resolveRoadEncounterPure } from "../src/game/travel";
import { hexKey, hexNeighbors, isRoad, isWater, nearestSettlementDistance } from "../src/game/worldmap";
import type { Attributes, GameState, HexCoord } from "../src/game/types";

const build: Attributes = { STR: 3, AGI: 3, SMT: 2, CHA: 0 };

function freshMapOpen(seed: number): GameState {
  return takeAction(newGame("Rover", build, seed), "travel");
}

describe("opening and browsing the map", () => {
  it("is free — no turn spent, mapOpen becomes true", () => {
    const before = newGame("Rover", build, 5);
    const after = takeAction(before, "travel");
    expect(after.mapOpen).toBe(true);
    expect(after.turn).toBe(before.turn);
  });

  it("blocks ordinary hamlet actions while the map is open", () => {
    const s = freshMapOpen(5);
    const after = takeAction(s, "work");
    expect(after).toBe(s);
  });
});

describe("moveTo", () => {
  it("rejects a hex that isn't a neighbor of the current position", () => {
    const s = freshMapOpen(5);
    const farHex: HexCoord = { q: 5, r: 5 };
    const after = travelTo(s, farHex);
    expect(after).toBe(s);
  });

  it("costs exactly one turn on a clean arrival (no encounter)", () => {
    // Search a few seeds for a hop that rolls no encounter, to isolate the
    // "clean move" turn-cost from the "encounter defers the turn" path.
    for (let seed = 1; seed < 40; seed++) {
      const s = freshMapOpen(seed);
      const target = hexNeighbors(s.location.hex)[0];
      const after = travelTo(s, target);
      if (!after.roadEncounter) {
        expect(after.turn).toBe(s.turn + 1);
        expect(after.location.hex).toEqual(target);
        return;
      }
    }
    throw new Error("no clean (encounter-free) hop found across 40 seeds");
  });

  it("rejects moving onto water — no move, no turn", () => {
    // Find a run whose current position has a water neighbor.
    for (let seed = 1; seed < 60; seed++) {
      const s = freshMapOpen(seed);
      // Walk the map's hexes to find any land hex with a water neighbor.
      for (const key of Object.keys(s.map.terrain)) {
        if (s.map.terrain[key] === "water") continue;
        const [q, r] = key.split(",").map(Number);
        const waterNeighbor = hexNeighbors({ q, r }).find((n) => isWater(s.map, n));
        if (!waterNeighbor) continue;
        const state: GameState = { ...s, location: { hex: { q, r }, settlementId: null } };
        const result = moveTo(state, waterNeighbor);
        expect(result.spendTurn).toBe(false);
        expect(result.state.location.hex).toEqual({ q, r }); // didn't move
        return;
      }
    }
    throw new Error("no shoreline found across 60 seeds — is water being generated?");
  });

  it("never rolls an encounter while moving along a road", () => {
    const s = freshMapOpen(1);
    // Find a road hex adjacent to the hamlet (paths start there) and hop onto
    // it across many seeds — roads are safe for now, so zero encounters.
    const roadStep = hexNeighbors(s.location.hex).find((n) => isRoad(s.map, n));
    expect(roadStep).toBeDefined();
    for (let seed = 1; seed < 120; seed++) {
      const state: GameState = { ...s, rngSeed: seed };
      const result = moveTo(state, roadStep!);
      expect(result.state.roadEncounter).toBeNull();
      expect(result.spendTurn).toBe(true); // always a clean arrival
    }
  });

  it("does not spend a turn when an encounter interrupts the move", () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = freshMapOpen(seed);
      const target = hexNeighbors(s.location.hex)[0];
      const after = travelTo(s, target);
      if (after.roadEncounter) {
        expect(after.turn).toBe(s.turn); // deferred until the encounter resolves
        expect(after.location.hex).toEqual(target); // you've still arrived at the hex
        return;
      }
    }
    throw new Error("no encounter-interrupted hop found across 60 seeds");
  });

  it("reveals the destination hex and its neighbors (fog of war)", () => {
    const s = freshMapOpen(5);
    const target = hexNeighbors(s.location.hex)[0];
    const after = travelTo(s, target);
    expect(after.discovered).toContain(hexKey(target));
    for (const n of hexNeighbors(target)) expect(after.discovered).toContain(hexKey(n));
  });

  it("arriving on a settlement hex sets settlementId and closes the map (clean arrival)", () => {
    const s = freshMapOpen(1);
    const city = s.map.settlements.find((st) => st.id !== "hamlet")!;
    const approach: HexCoord = hexNeighbors(city.hex)[0];

    for (let seed = 1; seed < 40; seed++) {
      const near: GameState = { ...s, rngSeed: seed, location: { hex: approach, settlementId: null } };
      const after = travelTo(near, city.hex);
      if (!after.roadEncounter) {
        expect(after.location.settlementId).toBe(city.id);
        expect(after.mapOpen).toBe(false);
        return;
      }
    }
    throw new Error("no clean arrival at the city found across 40 seeds");
  });
});

describe("travel-encounter difficulty scales with distance", () => {
  const WEAK_IDS = new Set(["stray_dog", "giant_rat", "drunkard"]);
  const STRONG_IDS = new Set(["tomb_bandit", "crypt_spider", "barrow_skeleton"]);

  it("only rolls the weakest tier right next to a settlement", () => {
    const s = freshMapOpen(1);
    // Roads are safe now, so step onto a wild (non-road, non-water) neighbor.
    const target = hexNeighbors(s.location.hex).find(
      (n) => !isRoad(s.map, n) && !isWater(s.map, n),
    )!;
    expect(target).toBeDefined();
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const near: GameState = { ...s, rngSeed: seed };
      const result = moveTo(near, target);
      if (result.state.roadEncounter) seen.add(result.state.roadEncounter.enemy.id);
    }
    expect(seen.size).toBeGreaterThan(0);
    // Near a settlement you only meet the weakest tier — unless the rare
    // tough-encounter upgrade fired, which is allowed to happen anywhere.
    for (const id of seen) expect(WEAK_IDS.has(id) || TOUGH_ENEMIES.includes(id)).toBe(true);
  });

  it("can roll the strongest tier deep in the wilderness", () => {
    const s = freshMapOpen(1);
    // With more settlements now dotting the map, no single fixed corner is
    // guaranteed to be the least-covered spot — check the map's own 6 corners
    // and use whichever is actually farthest from every settlement.
    const R = s.map.radius;
    const corners: HexCoord[] = [
      { q: R, r: 0 }, { q: R, r: -R }, { q: 0, r: -R },
      { q: -R, r: 0 }, { q: -R, r: R }, { q: 0, r: R },
    ];
    // A corner (or its approach) could be water or road now — skip those.
    const usable = corners.filter(
      (c) => !isWater(s.map, c) && !isRoad(s.map, c),
    );
    const far = usable.reduce((best, c) =>
      nearestSettlementDistance(s.map, c) > nearestSettlementDistance(s.map, best) ? c : best,
    );

    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const adjacent = hexNeighbors(far)[0];
      const state: GameState = {
        ...s,
        rngSeed: seed,
        location: { hex: adjacent, settlementId: null },
      };
      const result = moveTo(state, far);
      if (result.state.roadEncounter) seen.add(result.state.roadEncounter.enemy.id);
    }
    expect([...seen].some((id) => STRONG_IDS.has(id))).toBe(true);
  });
});

describe("rare tough encounters", () => {
  it("the wilds occasionally produce an elite far above the local tier", () => {
    const s = freshMapOpen(1);
    const target = hexNeighbors(s.location.hex).find(
      (n) => !isRoad(s.map, n) && !isWater(s.map, n),
    )!;
    let sawTough = false;
    for (let seed = 1; seed < 900 && !sawTough; seed++) {
      const result = moveTo({ ...s, rngSeed: seed }, target);
      const enemy = result.state.roadEncounter?.enemy;
      if (enemy && TOUGH_ENEMIES.includes(enemy.id)) sawTough = true;
    }
    expect(sawTough).toBe(true); // ~7% of encounters upgrade — 900 seeds is plenty
  });
});

describe("resolveRoadEncounter", () => {
  function withEncounter(seed: number): GameState {
    const s = freshMapOpen(seed);
    let guard = 0;
    let state = s;
    while (!state.roadEncounter && guard++ < 100) {
      const target = hexNeighbors(state.location.hex)[0];
      const result = moveTo(state, target);
      state = result.state;
      if (!result.spendTurn && !state.roadEncounter) break; // shouldn't happen, but avoid a loop
    }
    if (!state.roadEncounter) throw new Error("could not roll a road encounter to test against");
    return state;
  }

  it("fight clears the encounter and starts a normal combat", () => {
    const s = withEncounter(3);
    const after = resolveRoadEncounter(s, "fight");
    expect(after.roadEncounter).toBeNull();
    expect(after.combat).not.toBeNull();
    expect(after.combat!.enemy.id).toBe(s.roadEncounter!.enemy.id);
  });

  it("flee either escapes cleanly (turn spent, no fight) or fails into combat", () => {
    const s = withEncounter(3);
    let sawSuccess = false;
    let sawFailure = false;
    for (let seed = 1; seed < 60 && !(sawSuccess && sawFailure); seed++) {
      const attempt: GameState = { ...s, rngSeed: seed };
      const result = resolveRoadEncounterPure(attempt, "flee");
      if (result.state.combat) {
        sawFailure = true;
        expect(result.spendTurn).toBe(false);
      } else {
        sawSuccess = true;
        expect(result.spendTurn).toBe(true);
        expect(result.state.roadEncounter).toBeNull();
      }
    }
    expect(sawSuccess).toBe(true);
    expect(sawFailure).toBe(true);
  });

  it("bribe is a guaranteed payoff when affordable", () => {
    const s = withEncounter(3);
    const rich: GameState = { ...s, character: { ...s.character, gold: 9999 } };
    const before = rich.character.gold;
    const after = resolveRoadEncounter(rich, "bribe");
    expect(after.roadEncounter).toBeNull();
    expect(after.combat).toBeNull();
    expect(after.character.gold).toBeLessThan(before);
  });

  it("bribe no-ops when the character can't afford it", () => {
    const s = withEncounter(3);
    const poor: GameState = { ...s, character: { ...s.character, gold: 0 } };
    const after = resolveRoadEncounter(poor, "bribe");
    expect(after.roadEncounter).not.toBeNull();
    expect(after.character.gold).toBe(0);
  });
});
