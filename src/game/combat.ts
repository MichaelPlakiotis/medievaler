// ---------------------------------------------------------------------------
// combat.ts — the turn-based battle engine (GDD §4). Like the rest of src/game,
// every function here is pure: it takes a GameState and returns a new one. The
// UI just calls these and re-renders.
//
// The round flow after the PLAYER acts (attack / spell / item):
//   1. apply the player's effect to the enemy
//   2. if the enemy is dead → win
//   3. otherwise the enemy takes its turn (attack / guard / flee)
//   4. if the player is now down → defeat check (beaten vs killed)
//   5. advance the round counter
// A fight always ends with combat.over = true and an `outcome`.
// ---------------------------------------------------------------------------

import {
  COMBAT_BASE_HIT,
  DEFEAT_GOLD_LOSS,
  DEFEND_BONUS,
  FLEE_AGI_SCALE,
  FLEE_BASE,
  FLEE_CHANCE,
  FLEE_ENEMY_DODGE_SCALE,
  FLEE_HP_FRACTION,
  FLEE_MAX,
  FLEE_MIN,
  HEAL_AMOUNT,
  HIT_MAX,
  HIT_MIN,
  SPELL_BASE_DAMAGE,
  SPELL_COST,
  SPELL_SMT_SCALE,
} from "./config";
import { effectiveAttributes } from "./aging";
import { grantXp, practiceAttribute } from "./character";
import { ITEMS } from "./equipment";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import type { Character, EnemyDef, GameState } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Player's derived combat numbers, from attributes + equipped gear (GDD §4.2).
 *  Rolls read the age-adjusted attributes (aging.ts) — an old fighter swings
 *  and dodges worse than their training alone would say. */
function playerStats(c: Character) {
  const attrs = effectiveAttributes(c);
  const w = c.weapon;
  const accuracy = w.skill * 0.6 + attrs[w.attackAttr] * 0.4;
  // Dodge = (AGI × 0.7) − Armor Weight Penalty (GDD §4.2).
  const dodge = attrs.AGI * 0.7 - (c.armor?.weightPenalty ?? 0);
  const weaponDamage = w.baseDamage + attrs.STR; // "+ STR Modifier"
  const armorValue = c.armor?.armorValue ?? 0; // subtracted from incoming damage
  return { accuracy, dodge, weaponDamage, armorValue };
}

/** Hit % = base + attacker accuracy − defender dodge, clamped (GDD §4.2). */
function hitPercent(attackerAccuracy: number, defenderDodge: number): number {
  return clamp(COMBAT_BASE_HIT + attackerAccuracy - defenderDodge, HIT_MIN, HIT_MAX);
}

// --- Odds & damage previews (QoL — shown in the UI before you commit) ------

/** The % chance your Weapon Attack lands on this enemy right now. */
export function playerHitChance(c: Character, enemy: EnemyInstanceLike): number {
  const ps = playerStats(c);
  const dodge = enemy.dodge + (enemy.defending ? DEFEND_BONUS : 0);
  return Math.round(hitPercent(ps.accuracy, dodge));
}

/** The % chance the enemy's own attack would land on you right now. */
export function enemyHitChance(c: Character, enemy: EnemyInstanceLike): number {
  const ps = playerStats(c);
  return Math.round(hitPercent(enemy.accuracy, ps.dodge));
}

/** Exact damage a Spell Attack would deal to this enemy right now (GDD §4.2). */
export function spellDamage(c: Character, enemy: EnemyInstanceLike): number {
  return Math.max(
    1,
    Math.round(SPELL_BASE_DAMAGE + effectiveAttributes(c).SMT * SPELL_SMT_SCALE) -
      Math.floor(enemy.armor / 2),
  );
}

/**
 * The % chance a universal Flee attempt succeeds against this enemy — an
 * Agility skill check, usable in any fight (hamlet, dungeon, or road alike)
 * and also by a pre-combat road encounter's "run away" choice (travel.ts).
 */
export function fleeChance(c: Character, enemy: EnemyInstanceLike): number {
  const raw =
    FLEE_BASE + effectiveAttributes(c).AGI * FLEE_AGI_SCALE - enemy.dodge * FLEE_ENEMY_DODGE_SCALE;
  return clamp(raw, FLEE_MIN, FLEE_MAX);
}

/** The bits of an enemy the odds helpers actually need. */
type EnemyInstanceLike = Pick<EnemyDef, "accuracy" | "dodge" | "armor"> & { defending?: boolean };

/** Begin a fight against the given enemy. */
export function startCombat(state: GameState, def: EnemyDef): GameState {
  const next: GameState = {
    ...state,
    combat: {
      enemy: { ...def, hp: def.maxHp, defending: false },
      round: 1,
      over: false,
    },
  };
  return pushLog(next, { text: def.intro, tone: "bad" });
}

/** Subtract HP from the enemy (never touches anything else). */
function damageEnemy(state: GameState, amount: number): GameState {
  const combat = state.combat!;
  const enemy = { ...combat.enemy, hp: combat.enemy.hp - amount };
  return { ...state, combat: { ...combat, enemy } };
}

// --- Player actions --------------------------------------------------------

/** Weapon Attack (GDD §4.1). */
export function combatAttack(state: GameState): GameState {
  if (!state.combat || state.combat.over) return state;
  const enemy = state.combat.enemy;
  const ps = playerStats(state.character);

  // A guarding enemy is harder to hit this one strike.
  const dodge = enemy.dodge + (enemy.defending ? DEFEND_BONUS : 0);
  const pct = hitPercent(ps.accuracy, dodge);

  const roll = randInt(state.rngSeed, 1, 100);
  let next: GameState = { ...state, rngSeed: roll.seed };
  // Whether it lands or not, the enemy's raised guard is now spent.
  next = { ...next, combat: { ...next.combat!, enemy: { ...enemy, defending: false } } };

  if (roll.value <= pct) {
    const dmg = Math.max(1, ps.weaponDamage - enemy.armor);
    next = damageEnemy(next, dmg);
    next = pushLog(next, { text: `You strike the ${enemy.name} for ${dmg}.`, tone: "good" });
  } else {
    next = pushLog(next, { text: `You swing at the ${enemy.name} and miss.`, tone: "neutral" });
  }

  // Swinging a weapon is practice for its attribute (GDD §3.1).
  next = trainInCombat(next, state.character.weapon.attackAttr);
  return resolveEnemyPhase(next);
}

/** Spell Attack — costs mana, reliably lands, part-ignores armor (GDD §4.2). */
export function combatSpell(state: GameState): GameState {
  if (!state.combat || state.combat.over) return state;
  const c = state.character;
  if (c.mana < SPELL_COST) return state; // not enough mana (UI disables this)
  const enemy = state.combat.enemy;

  const dmg = spellDamage(c, enemy); // same math the UI preview shows
  let next: GameState = { ...state, character: { ...c, mana: c.mana - SPELL_COST } };
  next = damageEnemy(next, dmg);
  next = pushLog(next, {
    text: `You loose a bolt of force at the ${enemy.name} for ${dmg}. (−${SPELL_COST} mana)`,
    tone: "good",
  });
  next = trainInCombat(next, "SMT");
  return resolveEnemyPhase(next);
}

/** Use Item — healing draught or smoke bomb (GDD §4.2). */
export function combatUseItem(state: GameState, itemId: string): GameState {
  if (!state.combat || state.combat.over) return state;
  const c = state.character;
  if ((c.inventory[itemId] ?? 0) <= 0) return state;
  const item = ITEMS[itemId];
  if (!item) return state;

  const inventory = { ...c.inventory, [itemId]: c.inventory[itemId] - 1 };
  let next: GameState = { ...state, character: { ...c, inventory } };

  if (item.effect === "heal") {
    const healed = Math.min(next.character.maxHp, next.character.hp + (item.heal ?? HEAL_AMOUNT));
    const gained = healed - next.character.hp;
    next = { ...next, character: { ...next.character, hp: healed } };
    next = pushLog(next, {
      text: `You quaff a ${item.name} and recover ${gained} health.`,
      tone: "good",
    });
    return resolveEnemyPhase(next); // healing takes your turn; the enemy still acts
  }

  // Smoke bomb: break off cleanly, no enemy retaliation.
  next = pushLog(next, { text: `You hurl a ${item.name} and vanish in the smoke.`, tone: "neutral" });
  return { ...next, combat: { ...next.combat!, over: true, outcome: "fled" } };
}

/**
 * Flee — an Agility skill check against the enemy, usable in any fight (GDD
 * §4 extension: previously the only way out was a Smoke Bomb). A failed
 * attempt costs the round; the enemy still gets to act.
 */
export function combatFlee(state: GameState): GameState {
  if (!state.combat || state.combat.over) return state;
  const enemy = state.combat.enemy;
  const pct = fleeChance(state.character, enemy);

  const roll = randInt(state.rngSeed, 1, 100);
  let next: GameState = { ...state, rngSeed: roll.seed };

  if (roll.value <= pct) {
    next = pushLog(next, { text: `You break off and flee from the ${enemy.name}.`, tone: "neutral" });
    return { ...next, combat: { ...next.combat!, over: true, outcome: "fled" } };
  }

  next = pushLog(next, { text: `You try to flee, but the ${enemy.name} cuts you off.`, tone: "bad" });
  return resolveEnemyPhase(next);
}

// --- Shared round resolution ----------------------------------------------

/** Practice an attribute during a fight and narrate any raise. */
function trainInCombat(state: GameState, key: "STR" | "AGI" | "SMT"): GameState {
  const pr = practiceAttribute(state.character, key);
  let next: GameState = { ...state, character: pr.character };
  if (pr.raised) {
    next = pushLog(next, {
      text: `Your ${key} rises to ${pr.character.attributes[key]}.`,
      tone: "good",
    });
  }
  return next;
}

/**
 * After the player has acted: check for a win, then let the enemy respond, then
 * check whether the player has gone down. Advances the round if the fight lives.
 */
function resolveEnemyPhase(state: GameState): GameState {
  if (state.combat!.enemy.hp <= 0) return winCombat(state);

  const afterEnemy = enemyTurn(state);
  if (afterEnemy.combat!.over) return afterEnemy; // e.g. the enemy fled
  if (afterEnemy.character.hp <= 0) return playerDefeatCheck(afterEnemy);

  return {
    ...afterEnemy,
    combat: { ...afterEnemy.combat!, round: afterEnemy.combat!.round + 1 },
  };
}

/** The enemy's turn, driven by its behavior (GDD §4.1). */
function enemyTurn(state: GameState): GameState {
  const combat = state.combat!;
  const enemy = combat.enemy;
  let seed = state.rngSeed;

  // Cowards try to run once badly hurt (GDD §4.1 "fleeing-at-low-health").
  if (enemy.behavior === "coward" && enemy.hp < enemy.maxHp * FLEE_HP_FRACTION) {
    const f = chance(seed, FLEE_CHANCE);
    seed = f.seed;
    let next: GameState = { ...state, rngSeed: seed };
    if (f.value) {
      next = pushLog(next, {
        text: `The ${enemy.name} yelps and bolts into the dark.`,
        tone: "neutral",
      });
      return { ...next, combat: { ...combat, over: true, outcome: "fled" } };
    }
  }

  // Defensive foes sometimes raise their guard instead of attacking.
  if (enemy.behavior === "defensive") {
    const d = chance(seed, 0.4);
    seed = d.seed;
    if (d.value) {
      let next: GameState = {
        ...state,
        rngSeed: seed,
        combat: { ...combat, enemy: { ...enemy, defending: true } },
      };
      next = pushLog(next, { text: `The ${enemy.name} raises its guard.`, tone: "neutral" });
      return next;
    }
  }

  // Otherwise, attack. Attacking drops any guard the enemy was holding.
  const ps = playerStats(state.character);
  const pct = hitPercent(enemy.accuracy, ps.dodge);
  const roll = randInt(seed, 1, 100);
  seed = roll.seed;
  let next: GameState = {
    ...state,
    rngSeed: seed,
    combat: { ...combat, enemy: { ...enemy, defending: false } },
  };

  if (roll.value <= pct) {
    const dmgRoll = randInt(next.rngSeed, enemy.dmgMin, enemy.dmgMax);
    // Armor Value is subtracted from incoming damage (GDD §4.2), min 1.
    const dmg = Math.max(1, dmgRoll.value - ps.armorValue);
    next = {
      ...next,
      rngSeed: dmgRoll.seed,
      character: { ...next.character, hp: next.character.hp - dmg },
    };
    next = pushLog(next, { text: `The ${enemy.name} hits you for ${dmg}.`, tone: "bad" });
  } else {
    next = pushLog(next, { text: `The ${enemy.name} lunges but misses.`, tone: "neutral" });
  }
  return next;
}

/** The enemy is dead: award loot and XP, mark the fight won. */
function winCombat(state: GameState): GameState {
  const combat = state.combat!;
  const enemy = combat.enemy;

  const goldRoll = randInt(state.rngSeed, enemy.goldMin, enemy.goldMax);
  let character = { ...state.character, gold: state.character.gold + goldRoll.value };
  const xpRes = grantXp(character, enemy.xp);
  character = xpRes.character;

  let next: GameState = { ...state, rngSeed: goldRoll.seed, character };
  const goldText = goldRoll.value > 0 ? `, +${goldRoll.value} gold` : "";
  next = pushLog(next, { text: `The ${enemy.name} falls. +${enemy.xp} XP${goldText}.`, tone: "good" });
  if (xpRes.leveledUp > 0) {
    next = pushLog(next, { text: `You reach level ${character.level}!`, tone: "good" });
  }
  return { ...next, combat: { ...combat, over: true, outcome: "won" } };
}

/** The player has fallen: decide whether they're killed or merely beaten (GDD §4.4). */
function playerDefeatCheck(state: GameState): GameState {
  const combat = state.combat!;
  const enemy = combat.enemy;

  const killed = chance(state.rngSeed, enemy.lethality);
  let next: GameState = { ...state, rngSeed: killed.seed };

  if (killed.value) {
    next = { ...next, character: { ...next.character, hp: 0 } };
    next = pushLog(next, {
      text: `The ${enemy.name} strikes you down. Your story ends here.`,
      tone: "bad",
    });
    return { ...next, combat: { ...combat, over: true, outcome: "killed" } };
  }

  // Beaten but alive: robbed of some gold, left at 1 HP.
  const lost = Math.floor(next.character.gold * DEFEAT_GOLD_LOSS);
  next = { ...next, character: { ...next.character, hp: 1, gold: next.character.gold - lost } };
  const robbed = lost > 0 ? ` and robbed of ${lost} gold` : "";
  next = pushLog(next, {
    text: `You are beaten senseless${robbed}, but you live to see another dawn.`,
    tone: "bad",
  });
  return { ...next, combat: { ...combat, over: true, outcome: "beaten" } };
}
