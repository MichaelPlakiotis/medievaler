// ---------------------------------------------------------------------------
// character.ts — creating a character and the rules for growth (XP, levels,
// attributes). Everything here is a pure function: give it data, get data back,
// no side effects. That's what makes it easy to test and reason about.
// ---------------------------------------------------------------------------

import {
  ATTR_BASE,
  ATTR_GAIN_PER_ACTION,
  ATTR_POINTS,
  ATTR_THRESHOLD_BASE,
  ATTR_THRESHOLD_GROWTH,
  BASE_MAX_HP,
  DAYS_PER_YEAR,
  HP_PER_STR,
  MANA_PER_SMT,
  START_AGE,
  START_GOLD,
  XP_BASE,
  XP_EXPONENT,
} from "./config";
import { maxManaFor, startingInventory, startingWeapon } from "./equipment";
import { STARTING_SPELLS } from "./spells";
import { makeReputation } from "./reputation";
import { pushLog } from "./log";
import type { AttributeKey, Attributes, Character, GameState, Gender } from "./types";

/** A fresh set of attribute values all equal to `value`. */
export function makeAttributes(value: number): Attributes {
  return { STR: value, AGI: value, SMT: value, CHA: value };
}

/** Max HP is derived from the base plus a bonus per point of Strength. */
export function maxHpFor(attributes: Attributes): number {
  return BASE_MAX_HP + attributes.STR * HP_PER_STR;
}

/**
 * Is a point allocation legal at character creation? The player must spend
 * exactly ATTR_POINTS, and can't take any attribute below its base.
 */
export function isValidAllocation(allocation: Attributes): boolean {
  const keys: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];
  let spent = 0;
  for (const k of keys) {
    const extra = allocation[k] - ATTR_BASE;
    if (extra < 0) return false;
    spent += extra;
  }
  return spent === ATTR_POINTS;
}

/** The birthDay that makes a fresh character START_AGE on day 1. */
export function startingBirthDay(): number {
  return 1 - START_AGE * DAYS_PER_YEAR;
}

/** Build a brand-new level-0 character from a validated allocation. */
export function createCharacter(
  name: string,
  attributes: Attributes,
  gender: Gender = "male",
): Character {
  const maxHp = maxHpFor(attributes);
  const maxMana = maxManaFor(attributes);
  return {
    name: name.trim() || "Wanderer",
    gender,
    birthDay: startingBirthDay(),
    ageYears: START_AGE,
    attributes: { ...attributes },
    attributeProgress: makeAttributes(0),
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    gold: START_GOLD,
    level: 0,
    xp: 0,
    weapon: startingWeapon(attributes),
    armor: null, // start unarmored (GDD §3.3)
    ownedWeapons: [startingWeapon(attributes).id],
    ownedArmor: [],
    inventory: startingInventory(),
    reputation: makeReputation(),
    suitor: null,
    spouse: null,
    children: [],
    ownedHomes: [],
    familySettlementId: null,
    skillPoints: 0,
    knownSpells: [...STARTING_SPELLS],
    hunger: 0,
    stamina: 100,
    familyFund: 0,
    familyNeglect: 0,
    horse: null,
  };
}

/** Total XP required to have reached a given level (front-loaded curve). */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.round(XP_BASE * Math.pow(level, XP_EXPONENT));
}

/** The correct level for a given total XP. */
export function levelForXp(xp: number): number {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** How much practice a given attribute needs to gain its next point. */
export function attributeThreshold(currentValue: number): number {
  return ATTR_THRESHOLD_BASE + currentValue * ATTR_THRESHOLD_GROWTH;
}

/**
 * Award XP and recompute level. Returns a NEW character (never mutates the old
 * one) and how many levels were gained, so the caller can narrate a level-up.
 */
export function grantXp(
  character: Character,
  amount: number,
): { character: Character; leveledUp: number } {
  const xp = character.xp + Math.max(0, amount);
  const newLevel = levelForXp(xp);
  return {
    character: { ...character, xp, level: newLevel },
    leveledUp: newLevel - character.level,
  };
}

/**
 * Practice an attribute. Fills its hidden meter; if the meter passes the
 * threshold, the attribute rises by 1 (and maxHp updates if STR changed).
 * Returns a NEW character and whether the attribute actually went up.
 */
export function practiceAttribute(
  character: Character,
  key: AttributeKey,
): { character: Character; raised: boolean } {
  const progress = { ...character.attributeProgress };
  progress[key] += ATTR_GAIN_PER_ACTION;

  const threshold = attributeThreshold(character.attributes[key]);
  if (progress[key] < threshold) {
    return { character: { ...character, attributeProgress: progress }, raised: false };
  }

  // Level up this attribute and carry the leftover practice forward.
  progress[key] -= threshold;
  const attributes = { ...character.attributes, [key]: character.attributes[key] + 1 };
  const maxHp = maxHpFor(attributes);
  const maxMana = maxManaFor(attributes);
  return {
    character: {
      ...character,
      attributes,
      attributeProgress: progress,
      maxHp,
      maxMana,
      // Gaining Strength nudges current HP up too; Smartness raises mana.
      hp: Math.min(maxHp, character.hp + (key === "STR" ? HP_PER_STR : 0)),
      mana: Math.min(maxMana, character.mana + (key === "SMT" ? MANA_PER_SMT : 0)),
    },
    raised: true,
  };
}

/**
 * A person's whole-year age on a given day, from their own birthDay (GDD §7.1).
 * Uniform for the founder and for heirs born mid-game.
 */
export function ageOf(birthDay: number, day: number): number {
  return Math.max(0, Math.floor((day - birthDay) / DAYS_PER_YEAR));
}

/**
 * Spend one earned skill point to raise an attribute by 1 (chosen from the
 * character sheet). No-op if you have none. Updates derived HP/mana.
 */
export function spendSkillPoint(state: GameState, key: AttributeKey): GameState {
  const c = state.character;
  if (c.skillPoints <= 0) return state;
  const attributes = { ...c.attributes, [key]: c.attributes[key] + 1 };
  const maxHp = maxHpFor(attributes);
  const maxMana = maxManaFor(attributes);
  const character: Character = {
    ...c,
    attributes,
    skillPoints: c.skillPoints - 1,
    maxHp,
    maxMana,
    hp: key === "STR" ? Math.min(maxHp, c.hp + HP_PER_STR) : c.hp,
    mana: key === "SMT" ? Math.min(maxMana, c.mana + MANA_PER_SMT) : c.mana,
  };
  return pushLog({ ...state, character }, {
    text: `You hone your ${key}. It rises to ${attributes[key]}.`,
    tone: "good",
  });
}
