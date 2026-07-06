// ---------------------------------------------------------------------------
// combat.test.ts — checks on the battle engine (GDD §4). Randomness runs off a
// fixed seed, so we can drive whole fights and assert the results.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, finishCombat } from "../src/game/engine";
import { startCombat, combatAttack, combatSpell, combatUseItem } from "../src/game/combat";
import { ENEMIES, maybeEncounter } from "../src/game/enemies";
import { SPELL_COST } from "../src/game/config";
import type { Attributes, GameState } from "../src/game/types";

// A strong, nimble, learned build so fights and spells both work.
const strong: Attributes = { STR: 4, AGI: 3, SMT: 2, CHA: 1 };

/** Start a fight against the named enemy from a fresh run. */
function beginFight(enemyId: string, seed = 5): GameState {
  const s = newGame("Test", strong, seed);
  return startCombat(s, ENEMIES[enemyId]);
}

describe("starting a fight", () => {
  it("sets up combat state with a full-health enemy", () => {
    const s = beginFight("boar");
    expect(s.combat).not.toBeNull();
    expect(s.combat!.enemy.hp).toBe(ENEMIES.boar.maxHp);
    expect(s.combat!.over).toBe(false);
    expect(s.combat!.round).toBe(1);
  });
});

describe("winning a fight", () => {
  it("defeats a boar and awards XP and loot, then hands back to the clock", () => {
    let s = beginFight("boar", 11);
    const startXp = s.character.xp;
    for (let i = 0; i < 40 && !s.combat!.over; i++) {
      s = combatAttack(s);
    }
    expect(s.combat!.over).toBe(true);
    // A boar is aggressive (never flees) so the only end is a win here.
    expect(s.combat!.outcome).toBe("won");
    expect(s.character.xp).toBeGreaterThan(startXp);

    // Continue returns to normal play and consumes the interrupted turn.
    const after = finishCombat(s);
    expect(after.combat).toBeNull();
    expect(after.dead).toBe(false);
    expect(after.turn).toBe(2); // the encounter happened on turn 1
  });
});

describe("spells", () => {
  it("spend mana and damage the enemy", () => {
    const s = beginFight("boar", 3);
    const before = s.character.mana;
    const after = combatSpell(s);
    expect(after.character.mana).toBe(before - SPELL_COST);
    // enemy took damage (unless it died and combat ended — still counts)
    const hpNow = after.combat!.enemy.hp;
    expect(hpNow).toBeLessThan(ENEMIES.boar.maxHp);
  });

  it("cannot be cast without enough mana", () => {
    let s = beginFight("boar", 3);
    s = { ...s, character: { ...s.character, mana: 0 } };
    const after = combatSpell(s);
    expect(after).toBe(s); // unchanged
  });
});

describe("items", () => {
  it("a smoke bomb ends the fight as a flee", () => {
    const s = beginFight("wolf", 8);
    const after = combatUseItem(s, "smoke_bomb");
    expect(after.combat!.over).toBe(true);
    expect(after.combat!.outcome).toBe("fled");
    expect(after.character.inventory.smoke_bomb).toBe(0);
  });

  it("a healing draught restores health and is consumed", () => {
    let s = beginFight("wolf", 8);
    s = { ...s, character: { ...s.character, hp: 5 } };
    const after = combatUseItem(s, "healing_draught");
    expect(after.character.hp).toBeGreaterThan(5);
    expect(after.character.inventory.healing_draught).toBe(1);
  });
});

describe("defeat", () => {
  it("a lethal blow at 1 HP kills the player and ends the run", () => {
    // Craft a guaranteed-lethal enemy and a nearly-dead player.
    const lethal = { ...ENEMIES.wolf, lethality: 1, dmgMin: 50, dmgMax: 50 };
    let s = newGame("Test", strong, 1);
    s = { ...s, character: { ...s.character, hp: 1 } };
    s = startCombat(s, lethal);
    s = combatAttack(s); // player attacks, enemy retaliates for 50 → player down
    expect(s.combat!.over).toBe(true);
    expect(s.combat!.outcome).toBe("killed");

    const after = finishCombat(s);
    expect(after.dead).toBe(true);
    expect(after.combat).toBeNull();
  });

  it("a non-lethal defeat leaves the player alive at 1 HP", () => {
    const harmless = { ...ENEMIES.wolf, lethality: 0, dmgMin: 50, dmgMax: 50 };
    let s = newGame("Test", strong, 1);
    s = { ...s, character: { ...s.character, hp: 1 } };
    s = startCombat(s, harmless);
    s = combatAttack(s);
    expect(s.combat!.outcome).toBe("beaten");
    expect(s.character.hp).toBe(1);
    const after = finishCombat(s);
    expect(after.dead).toBe(false);
    expect(after.combat).toBeNull();
  });
});

describe("encounters", () => {
  it("peaceful actions never trigger a fight", () => {
    const s = newGame("Test", strong, 1);
    for (const id of ["tavern", "shop", "work"]) {
      expect(maybeEncounter(s, id).enemy).toBeNull();
    }
  });

  it("roaming can turn up an enemy for some seed", () => {
    let found = false;
    for (let seed = 0; seed < 50 && !found; seed++) {
      const s = newGame("Test", strong, seed);
      if (maybeEncounter(s, "roam").enemy) found = true;
    }
    expect(found).toBe(true);
  });
});

describe("determinism", () => {
  it("same seed + same fight ⇒ identical result", () => {
    const run = () => {
      let s = beginFight("wolf", 99);
      for (let i = 0; i < 20 && !s.combat!.over; i++) s = combatAttack(s);
      return `${s.combat!.outcome}:${s.character.hp}:${s.character.gold}`;
    };
    expect(run()).toBe(run());
  });
});
