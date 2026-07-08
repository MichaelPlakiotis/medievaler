// ---------------------------------------------------------------------------
// aging.test.ts — age-tier stat effects (GDD §7.1): Maturity's wisdom, Old
// Age's frailty. The modifiers are DERIVED (effectiveAttributes), so the base
// (trained) attributes, max HP/mana, equipment gating, and practice must all
// be untouched by age — only rolls change.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { ageTier, effectiveAttributes, tierModifiers } from "../src/game/aging";
import { maxHpFor, practiceAttribute } from "../src/game/character";
import { fleeChance, playerHitChance, spellDamage } from "../src/game/combat";
import { CRIMES, crimeSuccessChance } from "../src/game/crime";
import { newGame } from "../src/game/engine";
import { meetsRequirements } from "../src/game/equipment";
import { DAYS_PER_YEAR } from "../src/game/config";
import type { Attributes, Character, GameState } from "../src/game/types";

const build: Attributes = { STR: 3, AGI: 2, SMT: 1, CHA: 1 };

/** A run whose character is a given age (same technique as amenities.test.ts). */
function atAge(age: number, seed = 1): GameState {
  const s = newGame("Test", build, seed);
  const birthDay = s.day - age * DAYS_PER_YEAR;
  return { ...s, character: { ...s.character, birthDay, ageYears: age } };
}

describe("ageTier boundaries", () => {
  it("maps ages to the GDD §7.1 tiers", () => {
    expect(ageTier(15)).toBe("Adolescence");
    expect(ageTier(17)).toBe("Adolescence");
    expect(ageTier(18)).toBe("Prime");
    expect(ageTier(35)).toBe("Prime");
    expect(ageTier(36)).toBe("Maturity");
    expect(ageTier(55)).toBe("Maturity");
    expect(ageTier(56)).toBe("Old Age");
    expect(ageTier(80)).toBe("Old Age");
  });
});

describe("effectiveAttributes", () => {
  it("is identical to base in Adolescence and Prime", () => {
    for (const age of [15, 25]) {
      const c = atAge(age).character;
      expect(effectiveAttributes(c)).toEqual(c.attributes);
    }
  });

  it("adds Maturity's wisdom (+SMT, +CHA)", () => {
    const c = atAge(40).character;
    const eff = effectiveAttributes(c);
    const mods = tierModifiers(40);
    expect(eff.SMT).toBe(c.attributes.SMT + (mods.SMT ?? 0));
    expect(eff.CHA).toBe(c.attributes.CHA + (mods.CHA ?? 0));
    expect(eff.STR).toBe(c.attributes.STR);
    expect(eff.AGI).toBe(c.attributes.AGI);
    expect(mods.SMT ?? 0).toBeGreaterThan(0);
    expect(mods.CHA ?? 0).toBeGreaterThan(0);
  });

  it("adds Old Age's frailty (−STR, −AGI) while keeping the wisdom", () => {
    const c = atAge(60).character;
    const eff = effectiveAttributes(c);
    const mods = tierModifiers(60);
    expect(mods.STR ?? 0).toBeLessThan(0);
    expect(mods.AGI ?? 0).toBeLessThan(0);
    expect(eff.STR).toBeLessThan(c.attributes.STR);
    expect(eff.SMT).toBeGreaterThan(c.attributes.SMT);
  });

  it("never drops an attribute below 1", () => {
    const c = atAge(60).character;
    const weak: Character = { ...c, attributes: { STR: 1, AGI: 1, SMT: 1, CHA: 1 } };
    const eff = effectiveAttributes(weak);
    for (const v of Object.values(eff)) expect(v).toBeGreaterThanOrEqual(1);
  });
});

describe("rolls read the age-adjusted attributes", () => {
  const enemy = { accuracy: 3, dodge: 3, armor: 1 };

  it("Old Age lowers hit chance and flee chance, raises spell damage", () => {
    const prime = atAge(25).character;
    const old = atAge(60).character;
    expect(playerHitChance(old, enemy)).toBeLessThan(playerHitChance(prime, enemy));
    expect(fleeChance(old, enemy)).toBeLessThan(fleeChance(prime, enemy));
    expect(spellDamage(old, enemy)).toBeGreaterThanOrEqual(spellDamage(prime, enemy));
  });

  it("Old Age lowers crime success", () => {
    const prime = atAge(25).character;
    const old = atAge(60).character;
    expect(crimeSuccessChance(old, CRIMES.pickpocket)).toBeLessThan(
      crimeSuccessChance(prime, CRIMES.pickpocket),
    );
  });
});

describe("what age must NOT touch", () => {
  it("max HP and equipment gating stay on base attributes", () => {
    const prime = atAge(25).character;
    const old = atAge(60).character;
    expect(maxHpFor(old.attributes)).toBe(maxHpFor(prime.attributes));
    // A STR-3 requirement the base meets must stay met in Old Age.
    expect(meetsRequirements(old.attributes, { STR: 3 })).toBe(true);
  });

  it("practice still raises the base value in Old Age", () => {
    let c = atAge(60).character;
    const start = c.attributes.STR;
    for (let i = 0; i < 200 && c.attributes.STR === start; i++) {
      c = practiceAttribute(c, "STR").character;
    }
    expect(c.attributes.STR).toBe(start + 1);
  });
});
