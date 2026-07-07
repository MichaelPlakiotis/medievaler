// ---------------------------------------------------------------------------
// shop.test.ts — checks on equipment gating (GDD §3.3) and the shop (§5.1),
// plus armor's effect in combat (§4.2).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, takeAction, closeShop } from "../src/game/engine";
import { buy, sell, equipWeapon, equipArmor, buyPrice, sellPrice } from "../src/game/shop";
import { startCombat, combatAttack } from "../src/game/combat";
import { ENEMIES } from "../src/game/enemies";
import { meetsRequirements } from "../src/game/equipment";
import type { Attributes, GameState } from "../src/game/types";

const strong: Attributes = { STR: 5, AGI: 3, SMT: 1, CHA: 1 };

function rich(seed = 1): GameState {
  const s = newGame("Test", strong, seed);
  return { ...s, character: { ...s.character, gold: 500, ageYears: 25 } };
}

describe("shop entry costs a turn only on leaving", () => {
  it("opening the shop does not advance the turn; leaving does", () => {
    let s = rich();
    expect(s.turn).toBe(1);
    s = takeAction(s, "shop");
    expect(s.shopOpen).toBe(true);
    expect(s.turn).toBe(1); // browsing is free
    s = closeShop(s);
    expect(s.shopOpen).toBe(false);
    expect(s.turn).toBe(2); // the visit finally cost its turn
  });
});

describe("buying and selling", () => {
  it("buying deducts gold and adds the item to owned", () => {
    let s = rich();
    const before = s.character.gold;
    s = buy(s, { kind: "armor", id: "padded_tunic" });
    expect(s.character.ownedArmor).toContain("padded_tunic");
    expect(s.character.gold).toBeLessThan(before);
  });

  it("cannot buy the same unique gear twice", () => {
    let s = rich();
    s = buy(s, { kind: "weapon", id: "iron_greatsword" });
    const afterFirst = s.character.gold;
    s = buy(s, { kind: "weapon", id: "iron_greatsword" }); // no-op
    expect(s.character.gold).toBe(afterFirst);
    expect(s.character.ownedWeapons.filter((id) => id === "iron_greatsword")).toHaveLength(1);
  });

  it("cannot buy what you can't afford", () => {
    let s = newGame("Test", strong, 1);
    s = { ...s, character: { ...s.character, gold: 5 } };
    s = buy(s, { kind: "weapon", id: "iron_greatsword" }); // 90g, no-op
    expect(s.character.ownedWeapons).not.toContain("iron_greatsword");
    expect(s.character.gold).toBe(5);
  });

  it("Merchants' goodwill makes buying cheaper and selling dearer", () => {
    const poorStanding = { ...rich().character, reputation: { guard: 0, merchants: 0, thieves: 0, church: 0 } };
    const goodStanding = { ...poorStanding, reputation: { ...poorStanding.reputation, merchants: 60 } };
    expect(buyPrice(goodStanding, 100)).toBeLessThan(buyPrice(poorStanding, 100));
    expect(sellPrice(goodStanding, 100)).toBeGreaterThan(sellPrice(poorStanding, 100));
  });

  it("cannot sell the weapon you have equipped", () => {
    let s = rich();
    const equippedId = s.character.weapon.id;
    const before = s.character.gold;
    s = sell(s, { kind: "weapon", id: equippedId });
    expect(s.character.gold).toBe(before); // refused
    expect(s.character.ownedWeapons).toContain(equippedId);
  });

  it("buying a home records which settlement it's in (Town Generation & Identity)", () => {
    let s = rich();
    expect(s.character.homeSettlementId).toBeNull();
    s = buy(s, { kind: "home", id: "home" });
    expect(s.character.ownsHome).toBe(true);
    expect(s.character.homeSettlementId).toBe(s.location.settlementId);
    expect(s.character.homeSettlementId).toBe("hamlet"); // newGame starts you there
  });
});

describe("equipment gating (GDD §3.3)", () => {
  it("you may buy gear you can't yet wield, but not equip it", () => {
    // Weak build cannot meet the greatsword's STR 6.
    let s = newGame("Test", { STR: 2, AGI: 3, SMT: 1, CHA: 1 }, 1);
    s = { ...s, character: { ...s.character, gold: 500, ageYears: 25 } };
    s = buy(s, { kind: "weapon", id: "iron_greatsword" });
    expect(s.character.ownedWeapons).toContain("iron_greatsword"); // carried
    const before = s.character.weapon.id;
    s = equipWeapon(s, "iron_greatsword"); // requirement unmet → no-op
    expect(s.character.weapon.id).toBe(before); // still the old weapon
  });

  it("meeting the requirement lets you equip it", () => {
    let s = rich(); // STR 5
    s = { ...s, character: { ...s.character, attributes: { ...s.character.attributes, STR: 6 } } };
    s = buy(s, { kind: "weapon", id: "iron_greatsword" });
    s = equipWeapon(s, "iron_greatsword");
    expect(s.character.weapon.id).toBe("iron_greatsword");
    expect(meetsRequirements(s.character.attributes, { STR: 6 })).toBe(true);
  });
});

describe("armor in combat (GDD §4.2)", () => {
  it("armor reduces the damage an enemy deals", () => {
    // Same seed, same fight: once unarmored, once in chainmail (blocks 4).
    // Damage is fixed; only the enemy's own hit roll varies by seed (and the
    // armored branch's extra buy/equip rolls shift its stream further still),
    // so search a few seeds for one where the attack lands in both branches.
    const build: Attributes = { STR: 4, AGI: 3, SMT: 1, CHA: 1 };
    const fixedHitBoar = { ...ENEMIES.boar, dmgMin: 6, dmgMax: 6, accuracy: 999 };
    const hpAfterOneEnemyHit = (seed: number, armored: boolean) => {
      let s = newGame("Test", build, seed);
      if (armored) {
        s = buy({ ...s, character: { ...s.character, gold: 500 } }, { kind: "armor", id: "chainmail" });
        s = equipArmor(s, "chainmail");
      }
      s = startCombat(s, fixedHitBoar);
      const startHp = s.character.hp;
      s = combatAttack(s); // triggers one enemy retaliation
      return startHp - s.character.hp; // damage taken this round (0 if it missed)
    };
    for (let seed = 1; seed < 30; seed++) {
      const armoredDmg = hpAfterOneEnemyHit(seed, true);
      const unarmoredDmg = hpAfterOneEnemyHit(seed, false);
      if (armoredDmg === 0 || unarmoredDmg === 0) continue; // a miss on this seed — try another
      // Unarmored takes the full hit; chainmail (armor 4) takes less.
      expect(armoredDmg).toBeLessThan(unarmoredDmg);
      return;
    }
    throw new Error("no seed landed hits in both branches across 30 tries");
  });
});
