// ---------------------------------------------------------------------------
// family.test.ts — courtship, marriage, children, and the Generational Loop
// (GDD §2.4 / §7.3).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, finishCombat } from "../src/game/engine";
import { resolveFamilyAction, familyActions } from "../src/game/family";
import { die, eligibleHeirs, succeed } from "../src/game/succession";
import { startCombat, combatAttack } from "../src/game/combat";
import { ENEMIES } from "../src/game/enemies";
import { MARRY_AGE, MARRY_RELATIONSHIP, HEIR_MIN_AGE, DAYS_PER_YEAR } from "../src/game/config";
import type { Attributes, Child, GameState } from "../src/game/types";

const charming: Attributes = { STR: 1, AGI: 1, SMT: 1, CHA: 5 };

/** A run pushed to a chosen age (by moving the character's birthDay). */
function atAge(age: number, attrs = charming, seed = 1): GameState {
  const s = newGame("Test", attrs, seed);
  const birthDay = s.day - age * DAYS_PER_YEAR;
  return { ...s, character: { ...s.character, birthDay, ageYears: age } };
}

/** Court until there's a marriage-ready suitor. */
function courtToReady(s: GameState): GameState {
  s = resolveFamilyAction(s, "court"); // find someone
  let guard = 0;
  while ((s.character.suitor?.relationship ?? 0) < MARRY_RELATIONSHIP && guard++ < 40) {
    s = resolveFamilyAction(s, "court");
  }
  return s;
}

describe("courtship & marriage", () => {
  it("courting finds a sweetheart and builds the bond", () => {
    let s = atAge(20);
    expect(s.character.suitor).toBeNull();
    s = resolveFamilyAction(s, "court");
    expect(s.character.suitor).not.toBeNull();
    const first = s.character.suitor!.relationship;
    s = resolveFamilyAction(s, "court");
    expect(s.character.suitor!.relationship).toBeGreaterThan(first);
  });

  it("cannot marry before adulthood, even with a devoted sweetheart", () => {
    let s = atAge(MARRY_AGE - 2);
    s = courtToReady(s);
    s = resolveFamilyAction(s, "propose"); // too young → refused
    expect(s.character.spouse).toBeNull();
  });

  it("an adult with a fond sweetheart can wed", () => {
    let s = atAge(20);
    s = courtToReady(s);
    s = resolveFamilyAction(s, "propose");
    expect(s.character.spouse).not.toBeNull();
    expect(s.character.suitor).toBeNull();
  });

  it("the menu offers propose only when eligible", () => {
    let young = courtToReady(atAge(MARRY_AGE - 2));
    expect(familyActions(young.character).some((a) => a.id === "propose")).toBe(false);
    let adult = courtToReady(atAge(20));
    expect(familyActions(adult.character).some((a) => a.id === "propose")).toBe(true);
  });
});

describe("children", () => {
  it("a child's attributes blend both parents' (± a small wobble)", () => {
    let s = atAge(25);
    s = courtToReady(s);
    s = resolveFamilyAction(s, "propose");
    // Try until a child arrives (conception is chance-based).
    let guard = 0;
    while (s.character.children.length === 0 && guard++ < 50) {
      s = resolveFamilyAction(s, "family");
    }
    expect(s.character.children.length).toBe(1);
    const child = s.character.children[0];
    const p = s.character.attributes;
    const q = s.character.spouse!.attributes;
    // Each attribute is within 1 of the parents' average (the wobble).
    for (const k of ["STR", "AGI", "SMT", "CHA"] as const) {
      const avg = Math.round((p[k] + q[k]) / 2);
      expect(Math.abs(child.attributes[k] - avg)).toBeLessThanOrEqual(1);
      expect(child.attributes[k]).toBeGreaterThanOrEqual(1);
    }
    expect(child.birthDay).toBe(s.day);
  });
});

describe("heir eligibility", () => {
  it("only children aged 12+ are heirs, eldest first", () => {
    const day = 200;
    const kids: Child[] = [
      { name: "Young", attributes: charming, birthDay: day - 5 * DAYS_PER_YEAR, alive: true }, // 5
      { name: "Elder", attributes: charming, birthDay: day - 15 * DAYS_PER_YEAR, alive: true }, // 15
      { name: "Middle", attributes: charming, birthDay: day - 13 * DAYS_PER_YEAR, alive: true }, // 13
      { name: "Ghost", attributes: charming, birthDay: day - 20 * DAYS_PER_YEAR, alive: false }, // dead
    ];
    const heirs = eligibleHeirs(kids, day);
    expect(heirs.map((h) => h.name)).toEqual(["Elder", "Middle"]); // 12+, eldest first
    expect(heirs.every((h) => (day - h.birthDay) / DAYS_PER_YEAR >= HEIR_MIN_AGE)).toBe(true);
  });
});

describe("the generational loop", () => {
  it("death with an eligible heir offers succession, not game over", () => {
    let s = atAge(40);
    const heirBirth = s.day - 14 * DAYS_PER_YEAR; // a 14-year-old
    s = {
      ...s,
      character: {
        ...s.character,
        gold: 200,
        children: [{ name: "Rowan", attributes: { STR: 3, AGI: 3, SMT: 2, CHA: 2 }, birthDay: heirBirth, alive: true }],
      },
    };
    const after = die(s, "a bad fall");
    expect(after.dead).toBe(false);
    expect(after.pendingSuccession).not.toBeNull();
    expect(after.pendingSuccession!.length).toBe(1);
  });

  it("death without an heir ends the run", () => {
    let s = atAge(70);
    const after = die(s, "old age");
    expect(after.dead).toBe(true);
    expect(after.pendingSuccession).toBeNull();
  });

  it("the heir inherits blended attributes, the coffer, gear, and partial standing", () => {
    let s = atAge(40);
    s = {
      ...s,
      character: {
        ...s.character,
        gold: 300,
        reputation: { guard: 40, merchants: 20, thieves: -10, church: 8 },
        children: [{ name: "Rowan", attributes: { STR: 3, AGI: 3, SMT: 2, CHA: 2 }, birthDay: s.day - 14 * DAYS_PER_YEAR, alive: true }],
      },
    };
    const parentName = s.character.name;
    s = die(s, "a bad fall");
    s = succeed(s, 0);

    expect(s.pendingSuccession).toBeNull();
    expect(s.dead).toBe(false);
    expect(s.character.name).toBe("Rowan");
    expect(s.character.attributes).toEqual({ STR: 3, AGI: 3, SMT: 2, CHA: 2 });
    expect(s.character.gold).toBe(300); // family coffer
    expect(s.character.level).toBe(0); // must make their own name
    expect(s.character.reputation.guard).toBe(20); // half of 40 (partial standing)
    expect(s.character.spouse).toBeNull();
    expect(s.character.children).toEqual([]);
    expect(s.character.name).not.toBe(parentName);
  });

  it("full path: dying in combat with a grown heir continues as that heir", () => {
    let s = atAge(30);
    s = {
      ...s,
      character: {
        ...s.character,
        hp: 1,
        children: [{ name: "Wynn", attributes: { STR: 2, AGI: 2, SMT: 2, CHA: 2 }, birthDay: s.day - 13 * DAYS_PER_YEAR, alive: true }],
      },
    };
    // A guaranteed-lethal foe finishes the (already near-dead) parent.
    s = startCombat(s, { ...ENEMIES.wolf, lethality: 1, dmgMin: 50, dmgMax: 50 });
    s = combatAttack(s);
    expect(s.combat!.outcome).toBe("killed");
    s = finishCombat(s);
    expect(s.pendingSuccession).not.toBeNull(); // heir waiting, not game over
    s = succeed(s, 0);
    expect(s.character.name).toBe("Wynn");
  });
});
