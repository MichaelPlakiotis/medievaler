// ---------------------------------------------------------------------------
// combat.test.ts — checks on the battle engine (GDD §4). Randomness runs off a
// fixed seed, so we can drive whole fights and assert the results.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { newGame, finishCombat } from "../src/game/engine";
import { startCombat, combatAttack, combatFlee, combatSpell, combatUseItem, fleeChance } from "../src/game/combat";
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

describe("combat events (battle-screen effects)", () => {
  it("a fresh fight starts with no events", () => {
    const s = beginFight("boar");
    expect(s.combat!.events).toEqual([]);
  });

  it("a player attack appends a hit-or-miss event whose amount matches the damage", () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = beginFight("boar", seed);
      const after = combatAttack(s);
      const playerEvents = after.combat!.events.filter((e) => e.actor === "player");
      expect(playerEvents.length).toBeGreaterThanOrEqual(1);
      const first = playerEvents[0];
      expect(["hit", "miss"]).toContain(first.kind);
      if (first.kind === "hit") {
        expect(first.amount).toBe(ENEMIES.boar.maxHp - after.combat!.enemy.hp);
      } else {
        expect(after.combat!.enemy.hp).toBe(ENEMIES.boar.maxHp);
      }
    }
  });

  it("both sides can miss, and misses are recorded as events (seed search)", () => {
    let sawPlayerMiss = false;
    let sawEnemyMiss = false;
    for (let seed = 1; seed < 60 && !(sawPlayerMiss && sawEnemyMiss); seed++) {
      const after = combatAttack(beginFight("wolf", seed));
      for (const e of after.combat!.events) {
        if (e.kind === "miss" && e.actor === "player") sawPlayerMiss = true;
        if (e.kind === "miss" && e.actor === "enemy") sawEnemyMiss = true;
      }
    }
    expect(sawPlayerMiss).toBe(true);
    expect(sawEnemyMiss).toBe(true);
  });

  it("ids are monotonic and the list stays capped over a long fight", () => {
    let s = beginFight("boar", 7);
    // Give the boar an absurd HP pool so the fight runs long.
    s = { ...s, combat: { ...s.combat!, enemy: { ...s.combat!.enemy, hp: 500, maxHp: 500 } } };
    for (let i = 0; i < 30 && !s.combat!.over; i++) s = combatAttack(s);
    const events = s.combat!.events;
    expect(events.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].id).toBeGreaterThan(events[i - 1].id);
    }
  });

  it("a spell appends a spell event carrying its damage", () => {
    const after = combatSpell(beginFight("boar", 3));
    const spell = after.combat!.events.find((e) => e.kind === "spell");
    expect(spell).toBeDefined();
    expect(spell!.actor).toBe("player");
    expect(spell!.amount).toBeGreaterThan(0);
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

describe("universal flee", () => {
  it("fleeChance clamps within FLEE_MIN..FLEE_MAX regardless of extreme stats", () => {
    const tiny: Attributes = { STR: 1, AGI: 0, SMT: 1, CHA: 1 };
    const s = newGame("Test", tiny, 1);
    const toughEnemy = { ...ENEMIES.wolf, dodge: 999 };
    const easyEnemy = { ...ENEMIES.wolf, dodge: -999 };
    expect(fleeChance(s.character, toughEnemy)).toBeGreaterThanOrEqual(10);
    expect(fleeChance(s.character, easyEnemy)).toBeLessThanOrEqual(90);
  });

  it("a successful flee ends the fight with outcome 'fled', same as a smoke bomb", () => {
    // Zero enemy dodge + a nimble build all but guarantees the roll succeeds.
    const s = beginFight("boar", 8);
    const easy = { ...ENEMIES.boar, dodge: -999 };
    let fight = startCombat(s, easy);
    fight = combatFlee(fight);
    expect(fight.combat!.over).toBe(true);
    expect(fight.combat!.outcome).toBe("fled");
  });

  it("a failed flee costs the round — the enemy still acts", () => {
    // Impossible odds: floor-clamped but still lets the enemy retaliate.
    const s = beginFight("boar", 8);
    const impossible = { ...ENEMIES.boar, dodge: 999 };
    let fight = startCombat(s, impossible);
    const hpBefore = fight.character.hp;
    fight = combatFlee(fight);
    // Either the enemy's attack landed (HP dropped) or missed — either way the
    // fight isn't over from a fled outcome, since the roll was near-impossible.
    if (fight.combat!.over) {
      expect(fight.combat!.outcome).not.toBe("fled");
    } else {
      expect(fight.character.hp).toBeLessThanOrEqual(hpBefore);
    }
  });

  it("finishCombat treats a fled fight the same whether from Flee or a smoke bomb", () => {
    const viaFlee = (() => {
      const s = beginFight("boar", 8);
      let fight = startCombat(s, { ...ENEMIES.boar, dodge: -999 });
      return combatFlee(fight);
    })();
    const viaBomb = combatUseItem(beginFight("boar", 8), "smoke_bomb");
    expect(finishCombat(viaFlee).dead).toBe(finishCombat(viaBomb).dead);
    expect(finishCombat(viaFlee).combat).toBeNull();
    expect(finishCombat(viaBomb).combat).toBeNull();
  });
});

describe("defeat", () => {
  it("a lethal blow at 1 HP kills the player and ends the run", () => {
    // Craft a guaranteed-lethal enemy (fixed damage, 100% lethality) and a
    // nearly-dead player. Damage/lethality are deterministic; only the
    // enemy's own hit roll varies by seed, so search a few for a landed hit.
    const lethal = { ...ENEMIES.wolf, lethality: 1, dmgMin: 50, dmgMax: 50, accuracy: 999 };
    for (let seed = 1; seed < 30; seed++) {
      let s = newGame("Test", strong, seed);
      s = { ...s, character: { ...s.character, hp: 1 } };
      s = startCombat(s, lethal);
      s = combatAttack(s); // player attacks, enemy retaliates for 50 → player down
      if (!s.combat!.over) continue; // the enemy's own attack missed this seed
      expect(s.combat!.outcome).toBe("killed");

      const after = finishCombat(s);
      expect(after.dead).toBe(true);
      expect(after.combat).toBeNull();
      return;
    }
    throw new Error("no seed produced a landed lethal hit across 30 tries");
  });

  it("a non-lethal defeat leaves the player alive at 1 HP", () => {
    const harmless = { ...ENEMIES.wolf, lethality: 0, dmgMin: 50, dmgMax: 50, accuracy: 999 };
    for (let seed = 1; seed < 30; seed++) {
      let s = newGame("Test", strong, seed);
      s = { ...s, character: { ...s.character, hp: 1 } };
      s = startCombat(s, harmless);
      s = combatAttack(s);
      if (s.combat!.outcome !== "beaten") continue; // the enemy's own attack missed this seed
      expect(s.character.hp).toBe(1);
      const after = finishCombat(s);
      expect(after.dead).toBe(false);
      expect(after.combat).toBeNull();
      return;
    }
    throw new Error("no seed produced a landed non-lethal hit across 30 tries");
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
