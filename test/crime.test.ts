// ---------------------------------------------------------------------------
// crime.test.ts — checks on reputation (GDD §6.1) and the crime system (§6.2).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, takeAction } from "../src/game/engine";
import { CRIMES, resolveCrime } from "../src/game/crime";
import { createCharacter } from "../src/game/character";
import { applyReputation, standingLabel, sleepRobberyChance } from "../src/game/reputation";
import { AGE_OF_CONSEQUENCE } from "../src/game/config";
import type { Attributes, GameState } from "../src/game/types";

const nimble: Attributes = { STR: 1, AGI: 5, SMT: 1, CHA: 1 };

/** Force a run to a given age so we can test the youth multiplier both ways. */
function agedGame(age: number, seed = 1): GameState {
  const s = newGame("Test", nimble, seed);
  return { ...s, character: { ...s.character, ageYears: age } };
}

describe("reputation basics", () => {
  it("new characters are neutral with everyone", () => {
    const c = createCharacter("Test", nimble);
    expect(c.reputation).toEqual({ guard: 0, merchants: 0, thieves: 0, church: 0 });
  });

  it("standing labels track the value", () => {
    expect(standingLabel(0)).toBe("Neutral");
    expect(standingLabel(-50)).toBe("Hostile");
    expect(standingLabel(50)).toBe("Trusted");
  });

  it("adult reputation changes apply in full", () => {
    const c = createCharacter("Test", nimble);
    const adult = { ...c, ageYears: AGE_OF_CONSEQUENCE };
    const after = applyReputation(adult, { guard: -10 });
    expect(after.reputation.guard).toBe(-10);
  });

  it("youth mutes reputation changes (GDD §6.1.1)", () => {
    const c = createCharacter("Test", nimble); // age 15
    const after = applyReputation(c, { guard: -10 });
    // 10 * 0.35 = 3.5 -> rounded magnitude 4, and muted < full 10.
    expect(Math.abs(after.reputation.guard)).toBeLessThan(10);
    expect(after.reputation.guard).toBeLessThan(0);
  });
});

describe("reputation-driven risk", () => {
  it("bad guard standing makes sleeping more dangerous", () => {
    const c = createCharacter("Test", nimble);
    const outlaw = { ...c, reputation: { ...c.reputation, guard: -80 } };
    const citizen = { ...c, reputation: { ...c.reputation, guard: 60 } };
    expect(sleepRobberyChance(outlaw)).toBeGreaterThan(sleepRobberyChance(citizen));
  });
});

describe("crime resolution", () => {
  it("a successful crime yields loot, the thieves' regard, and a small guard hit", () => {
    // Adult, high AGI + thieves goodwill. Scan seeds for a clean success and
    // assert its effects (the RNG decides which seed lands one).
    let found = false;
    for (let seed = 0; seed < 60 && !found; seed++) {
      let s = agedGame(30, seed);
      s = {
        ...s,
        character: { ...s.character, reputation: { ...s.character.reputation, thieves: 40 } },
      };
      const startGold = s.character.gold;
      const r = resolveCrime(s, CRIMES.pickpocket);
      // A success is: not jailed, and gold went up (a failed-escape keeps gold flat).
      if (!r.jailed && r.state.character.gold > startGold) {
        found = true;
        expect(r.state.character.reputation.thieves).toBeGreaterThan(40);
        expect(r.state.character.reputation.guard).toBeLessThan(0);
      }
    }
    expect(found).toBe(true);
  });

  it("an arrest fines the player and tanks guard standing", () => {
    // Adult, hopeless at crime, low escape odds ⇒ force an arrest by scanning seeds.
    const hopeless: Attributes = { STR: 4, AGI: 1, SMT: 1, CHA: 1 };
    let arrested = false;
    for (let seed = 0; seed < 200 && !arrested; seed++) {
      let s = newGame("Test", hopeless, seed);
      s = { ...s, character: { ...s.character, ageYears: 30, gold: 100 } };
      const r = resolveCrime(s, CRIMES.burgle);
      if (r.jailed) {
        arrested = true;
        expect(r.state.character.gold).toBeLessThan(100); // fined
        expect(r.state.character.reputation.guard).toBeLessThan(0); // big hit
      }
    }
    expect(arrested).toBe(true);
  });

  it("an arrest during a crime turn burns the rest of the day", () => {
    const hopeless: Attributes = { STR: 4, AGI: 1, SMT: 1, CHA: 1 };
    for (let seed = 0; seed < 200; seed++) {
      let s = newGame("Test", hopeless, seed);
      s = { ...s, character: { ...s.character, ageYears: 30, gold: 100 }, phase: "night", turn: 2 };
      const check = resolveCrime(s, CRIMES.burgle);
      if (check.jailed) {
        const after = takeAction(s, "burgle");
        expect(after.day).toBe(2); // slept off the arrest → new day
        expect(after.phase).toBe("day");
        return;
      }
    }
    throw new Error("no arrest found to test jail");
  });
});
