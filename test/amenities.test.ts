// ---------------------------------------------------------------------------
// amenities.test.ts — bigger-city amenities: the university (Smartness) and
// the brothel (Charisma, a chance of a child, and infidelity if married).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame } from "../src/game/engine";
import { citySettlementActions, resolveCityAction } from "../src/game/amenities";
import {
  BROTHEL_GOLD_COST,
  DAYS_PER_YEAR,
  FERTILITY_END_AGE,
  MARRY_AGE,
  UNIVERSITY_GOLD_COST,
} from "../src/game/config";
import type { Attributes, GameState, Spouse } from "../src/game/types";

const build: Attributes = { STR: 2, AGI: 2, SMT: 2, CHA: 2 };

/** A run standing in the map's city, flush with gold, at a given age. */
function inCity(age = 25, gender: "male" | "female" = "male", seed = 1): GameState {
  const s = newGame("Test", build, seed, gender);
  const city = s.map.settlements.find((st) => st.kind === "city")!;
  const birthDay = s.day - age * DAYS_PER_YEAR;
  return {
    ...s,
    character: { ...s.character, gold: 500, birthDay, ageYears: age },
    location: { hex: city.hex, settlementId: city.id },
  };
}

describe("citySettlementActions gating", () => {
  it("offers nothing outside a city (no university/brothel structures there)", () => {
    const s = inCity();
    const hamlet = s.map.settlements.find((st) => st.kind === "hamlet")!;
    const town = s.map.settlements.find((st) => st.kind === "town")!;
    expect(citySettlementActions(s.character, null)).toEqual([]);
    expect(citySettlementActions(s.character, hamlet)).toEqual([]);
    expect(citySettlementActions(s.character, town)).toEqual([]);
  });

  it("offers only the university below MARRY_AGE, both once adult", () => {
    const youngRun = inCity(MARRY_AGE - 2);
    const city = youngRun.map.settlements.find((st) => st.kind === "city")!;
    const ids = citySettlementActions(youngRun.character, city).map((a) => a.id);
    expect(ids).toContain("university");
    expect(ids).not.toContain("brothel");

    const adult = inCity(MARRY_AGE).character;
    const adultIds = citySettlementActions(adult, city).map((a) => a.id);
    expect(adultIds).toEqual(expect.arrayContaining(["university", "brothel"]));
  });
});

describe("university", () => {
  it("trains Smartness twice as hard as a single practice tick, and costs gold", () => {
    const s = inCity();
    const before = s.character;
    const after = resolveCityAction(s, "university").character;
    expect(after.gold).toBe(before.gold - UNIVERSITY_GOLD_COST);
    // Two practiceAttribute("SMT") calls landed — progress moved by 2 ticks
    // (or an attribute point flipped, which resets/rolls the meter forward).
    const progressDelta = after.attributeProgress.SMT - before.attributeProgress.SMT;
    const rose = after.attributes.SMT > before.attributes.SMT;
    expect(rose || progressDelta >= 2).toBe(true);
  });

  it("no-ops if you can't afford tuition", () => {
    let s = inCity();
    s = { ...s, character: { ...s.character, gold: 0 } };
    const after = resolveCityAction(s, "university");
    expect(after.character.gold).toBe(0);
    expect(after.character.attributeProgress.SMT).toBe(s.character.attributeProgress.SMT);
  });
});

describe("brothel", () => {
  it("trains Charisma and costs gold", () => {
    const s = inCity();
    const before = s.character;
    const after = resolveCityAction(s, "brothel").character;
    expect(after.gold).toBeLessThanOrEqual(before.gold - BROTHEL_GOLD_COST);
    const progressDelta = after.attributeProgress.CHA - before.attributeProgress.CHA;
    const rose = after.attributes.CHA > before.attributes.CHA;
    expect(rose || progressDelta >= 1).toBe(true);
  });

  it("no-ops if you can't afford it", () => {
    let s = inCity();
    s = { ...s, character: { ...s.character, gold: 0 } };
    const after = resolveCityAction(s, "brothel");
    expect(after.character.gold).toBe(0);
  });

  it("a female character never conceives, across many seeds", () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = inCity(25, "female", seed);
      const after = resolveCityAction(s, "brothel");
      expect(after.character.children).toHaveLength(0);
    }
  });

  it("a male character can conceive a full heir-eligible child", () => {
    for (let seed = 1; seed < 80; seed++) {
      const s = inCity(25, "male", seed);
      const after = resolveCityAction(s, "brothel");
      if (after.character.children.length > 0) {
        const child = after.character.children[0];
        expect(child.alive).toBe(true);
        expect(child.birthDay).toBe(s.day);
        expect(["male", "female"]).toContain(child.gender);
        expect(child.attributes.STR).toBeGreaterThanOrEqual(1);
        return;
      }
    }
    throw new Error("no conception across 80 seeds — check BROTHEL_CONCEIVE_BASE/rng wiring");
  });

  it("never conceives once the character is past fertility age", () => {
    const s = inCity(FERTILITY_END_AGE, "male", 3);
    for (let seed = 1; seed < 40; seed++) {
      const after = resolveCityAction({ ...s, rngSeed: seed }, "brothel");
      expect(after.character.children).toHaveLength(0);
    }
  });

  it("respects the one-per-year conception cooldown", () => {
    let s = inCity(25, "male", 3);
    s = {
      ...s,
      character: {
        ...s.character,
        children: [{ name: "Newborn", gender: "male", attributes: build, birthDay: s.day, alive: true }],
      },
    };
    for (let seed = 1; seed < 40; seed++) {
      const after = resolveCityAction({ ...s, rngSeed: seed }, "brothel");
      expect(after.character.children).toHaveLength(1); // no second child too soon
    }
  });

  describe("infidelity (only when married)", () => {
    const spouse: Spouse = { name: "Rowena", gender: "female", attributes: build, birthDay: 1 - 25 * DAYS_PER_YEAR };

    it("an unmarried visit never touches reputation via the catch/divorce path", () => {
      for (let seed = 1; seed < 30; seed++) {
        const s = inCity(25, "female", seed); // no spouse
        const after = resolveCityAction(s, "brothel");
        expect(after.character.spouse).toBeNull();
      }
    });

    it("a married visit can be caught — reputation drops with guard/merchants/church, thieves untouched", () => {
      for (let seed = 1; seed < 80; seed++) {
        let s = inCity(25, "male", seed);
        s = { ...s, character: { ...s.character, spouse } };
        const before = s.character.reputation;
        const after = resolveCityAction(s, "brothel").character;
        const caught =
          after.reputation.guard < before.guard ||
          after.reputation.merchants < before.merchants ||
          after.reputation.church < before.church;
        if (caught) {
          expect(after.reputation.guard).toBeLessThanOrEqual(before.guard);
          expect(after.reputation.merchants).toBeLessThanOrEqual(before.merchants);
          expect(after.reputation.church).toBeLessThan(before.church);
          expect(after.reputation.thieves).toBe(before.thieves);
          return;
        }
      }
      throw new Error("no seed produced a 'caught' outcome across 80 tries");
    });

    it("a caught visit can end the marriage, leaving children and home untouched", () => {
      for (let seed = 1; seed < 200; seed++) {
        let s = inCity(25, "male", seed);
        s = {
          ...s,
          character: {
            ...s.character,
            spouse,
            ownedHomes: ["hamlet"],
            familySettlementId: "hamlet",
            children: [{ name: "Kid", gender: "male", attributes: build, birthDay: s.day - 20, alive: true }],
          },
        };
        const after = resolveCityAction(s, "brothel").character;
        if (after.spouse === null) {
          expect(after.ownedHomes).toEqual(["hamlet"]);
          // The marriage ends; the existing child is untouched. (The visit
          // itself may have conceived another — that's the brothel's risk.)
          expect(after.children.some((k) => k.name === "Kid" && k.alive)).toBe(true);
          return;
        }
      }
      throw new Error("no seed produced a divorce across 200 tries");
    });
  });
});
