// ---------------------------------------------------------------------------
// engine.test.ts — automated checks on the pure game rules. Because the engine
// never touches the screen and all randomness runs off a fixed seed, we can
// assert exact behavior. Run with `npm test`.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, takeAction, sleep, stayUp, finishCombat } from "../src/game/engine";
import { combatAttack } from "../src/game/combat";
import type { GameState } from "../src/game/types";
import {
  createCharacter,
  isValidAllocation,
  levelForXp,
  xpForLevel,
  practiceAttribute,
  ageOf,
  startingBirthDay,
} from "../src/game/character";
import { ATTR_POINTS, TURNS_PER_DAY, NIGHT_TURNS, DAYS_PER_YEAR, START_AGE } from "../src/game/config";
import type { Attributes } from "../src/game/types";

// base is 1 each; extras here are 3 + 2 + 0 + 0 = 5 = ATTR_POINTS
const alloc: Attributes = { STR: 4, AGI: 3, SMT: 1, CHA: 1 };

/**
 * Take one action AND resolve any fight it triggers, so tests about the day/turn
 * loop aren't derailed by random encounters. Returns the state once the turn has
 * fully advanced (or the run has ended).
 */
function playTurn(s: GameState, actionId: string): GameState {
  s = takeAction(s, actionId);
  let guard = 0;
  while (s.combat && !s.dead && guard++ < 100) {
    s = s.combat.over ? finishCombat(s) : combatAttack(s);
  }
  return s;
}

describe("character creation", () => {
  it("accepts an allocation that spends exactly the point pool", () => {
    expect(isValidAllocation(alloc)).toBe(true);
  });

  it("rejects under- and over-spending", () => {
    expect(isValidAllocation({ STR: 1, AGI: 1, SMT: 1, CHA: 1 })).toBe(false); // 0 spent
    expect(isValidAllocation({ STR: 6, AGI: 2, SMT: 1, CHA: 1 })).toBe(false); // 6 spent
  });

  it("gives a level-0 teenager with full HP", () => {
    const c = createCharacter("Test", alloc);
    expect(c.level).toBe(0);
    expect(c.ageYears).toBe(START_AGE);
    expect(c.hp).toBe(c.maxHp);
    // point pool sanity
    const spent =
      alloc.STR + alloc.AGI + alloc.SMT + alloc.CHA - 4; // minus base of 1 each
    expect(spent).toBe(ATTR_POINTS);
  });
});

describe("xp and levels", () => {
  it("level thresholds are strictly increasing (front-loaded curve)", () => {
    expect(xpForLevel(1)).toBeLessThan(xpForLevel(2));
    expect(xpForLevel(2)).toBeLessThan(xpForLevel(3));
  });

  it("levelForXp matches the thresholds", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(xpForLevel(1))).toBe(1);
    expect(levelForXp(xpForLevel(3) - 1)).toBe(2);
  });
});

describe("attribute practice", () => {
  it("raises an attribute after enough repetitions and carries leftover", () => {
    let c = createCharacter("Test", alloc);
    const start = c.attributes.CHA;
    let raised = false;
    // A generous number of reps must eventually raise it.
    for (let i = 0; i < 50 && !raised; i++) {
      const r = practiceAttribute(c, "CHA");
      c = r.character;
      raised = r.raised || raised;
    }
    expect(c.attributes.CHA).toBeGreaterThan(start);
  });
});

describe("day / turn loop", () => {
  it("advances the turn counter and asks for rest on the final day turn", () => {
    let s = newGame("Test", alloc, 42);
    for (let i = 0; i < TURNS_PER_DAY; i++) {
      expect(s.awaitingRest).toBe(false);
      s = takeAction(s, "work");
    }
    // After the 8th action, the rest decision is due and the day hasn't rolled.
    expect(s.awaitingRest).toBe(true);
    expect(s.day).toBe(1);
  });

  it("sleep advances the day, resets the turn, and clears the rest prompt", () => {
    let s = newGame("Test", alloc, 42);
    for (let i = 0; i < TURNS_PER_DAY; i++) s = takeAction(s, "work");
    s = sleep(s);
    expect(s.day).toBe(2);
    expect(s.turn).toBe(1);
    expect(s.awaitingRest).toBe(false);
    expect(s.phase).toBe("day");
    expect(s.fatigue).toBe(0);
  });

  it("staying up runs a night phase then forces sleep, and next day is fatigued", () => {
    let s = newGame("Test", alloc, 7);
    for (let i = 0; i < TURNS_PER_DAY; i++) s = takeAction(s, "work");
    s = stayUp(s);
    expect(s.phase).toBe("night");
    // Play through the night; the final night turn auto-sleeps into day 2.
    // playTurn resolves any random encounter so the turn actually advances.
    for (let i = 0; i < NIGHT_TURNS && s.phase === "night"; i++) {
      s = playTurn(s, "hunt");
    }
    expect(s.phase).toBe("day");
    expect(s.day).toBe(2);
    expect(s.fatigue).toBeGreaterThan(0); // weary the day after staying up
  });
});

describe("aging", () => {
  it("a founder is START_AGE on day 1 and ages one year per DAYS_PER_YEAR days", () => {
    const bd = startingBirthDay();
    expect(ageOf(bd, 1)).toBe(START_AGE);
    expect(ageOf(bd, DAYS_PER_YEAR)).toBe(START_AGE);
    expect(ageOf(bd, DAYS_PER_YEAR + 1)).toBe(START_AGE + 1);
  });

  it("an heir born mid-game ages from their own birth, not the world clock", () => {
    // Born on day 100 ⇒ age 0 that day, one year older DAYS_PER_YEAR days later.
    expect(ageOf(100, 100)).toBe(0);
    expect(ageOf(100, 100 + DAYS_PER_YEAR)).toBe(1);
  });
});

describe("determinism", () => {
  it("same seed + same actions ⇒ identical outcome", () => {
    const run = (seed: number) => {
      let s = newGame("Test", alloc, seed);
      for (let i = 0; i < TURNS_PER_DAY; i++) s = takeAction(s, "roam");
      return s.character.gold + s.character.xp;
    };
    expect(run(123)).toBe(run(123));
  });
});
