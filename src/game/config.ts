// ---------------------------------------------------------------------------
// config.ts — EVERY tunable number in the game lives here.
//
// The GDD says all numbers are placeholders for balancing. Keeping them in one
// file means "balancing the game" = editing this file, and nothing else has to
// change. Feel free to tweak these values and reload to see the effect.
// ---------------------------------------------------------------------------

import type { AttributeKey } from "./types";

/** Character creation (GDD §1.1 / §3.1). */
export const START_AGE = 15; // a teenager in a small hamlet
export const START_GOLD = 12; // "a handful of coins"
export const ATTR_BASE = 1; // each attribute starts here...
export const ATTR_POINTS = 5; // ...and the player distributes this many more

/** Day/night structure (GDD §2.2). */
export const TURNS_PER_DAY = 8;
export const NIGHT_TURNS = 4;
export const FATIGUE_PENALTY = 1; // subtracted from outcome rolls the day after staying up
export const DAYS_PER_YEAR = 24; // how fast the calendar (and aging) moves

/** Health. Adolescents are fragile on purpose (GDD §4.3). */
export const BASE_MAX_HP = 20;
/** +HP per point of STR, so a strong build is sturdier. */
export const HP_PER_STR = 3;

/**
 * Attribute growth (GDD §3.1). Each relevant action adds `ATTR_GAIN_PER_ACTION`
 * to that attribute's hidden meter. When the meter reaches the threshold, the
 * attribute goes up by 1 and the threshold grows (later points cost more).
 */
export const ATTR_GAIN_PER_ACTION = 1;
export const ATTR_THRESHOLD_BASE = 4;
export const ATTR_THRESHOLD_GROWTH = 2; // threshold = BASE + level * GROWTH

/**
 * XP curve (GDD §3.2) — front-loaded so teenage levels come fast.
 * XP needed to reach level N is XP_BASE * N ^ XP_EXPONENT.
 */
export const XP_BASE = 20;
export const XP_EXPONENT = 1.5;

/** Chance (0–1) of a bad night while sleeping unprotected (GDD §5.3, simplified). */
export const UNPROTECTED_ROBBERY_CHANCE = 0.15;

// --- Combat (GDD §4) -------------------------------------------------------
/** Chance (0–1) that a roam/hunt/alleys action runs into a fight. */
export const ENCOUNTER_CHANCE = 0.35;
/** Baseline hit % before accuracy and dodge adjust it. */
export const COMBAT_BASE_HIT = 65;
export const HIT_MIN = 5; // clamp floor (GDD §4.2)
export const HIT_MAX = 95; // clamp ceiling
/** Extra dodge (in hit-% points) an enemy gains the round it defends. */
export const DEFEND_BONUS = 25;
/** A "coward" enemy tries to flee once below this fraction of health. */
export const FLEE_HP_FRACTION = 0.3;
export const FLEE_CHANCE = 0.6;

/** Magic (GDD §4.2). */
export const MANA_PER_SMT = 3; // max mana = SMT × this
export const SPELL_COST = 3;
export const SPELL_BASE_DAMAGE = 3;
export const SPELL_SMT_SCALE = 1.5; // damage += SMT × this

/** Items. */
export const HEAL_AMOUNT = 12;
/** Fraction of gold lost when beaten (not killed) in a fight (GDD §4.4). */
export const DEFEAT_GOLD_LOSS = 0.5;

// --- Reputation (GDD §6.1) -------------------------------------------------
export const REP_MIN = -100;
export const REP_MAX = 100;
/** Below this age, reputation swings are muted (GDD §6.1.1). */
export const AGE_OF_CONSEQUENCE = 18;
export const YOUTH_REP_MULTIPLIER = 0.35;

// --- Crime (GDD §6.2) ------------------------------------------------------
/** Baseline success % for a crime before skill and difficulty adjust it. */
export const CRIME_BASE_SUCCESS = 45;
/** How strongly the weighted attribute score moves success %. */
export const CRIME_SKILL_SCALE = 6;
/** How much each point of Thieves' standing eases a crime (success %). */
export const CRIME_THIEVES_BONUS = 0.3;
export const CRIME_SUCCESS_MIN = 5;
export const CRIME_SUCCESS_MAX = 95;
/** On a failed crime, the 50/50 escape roll (GDD §6.2.1), nudged by Agility. */
export const ESCAPE_BASE = 50;
export const ESCAPE_AGI_BONUS = 2;
export const ESCAPE_MIN = 15;
export const ESCAPE_MAX = 85;

export const SAVE_VERSION = 3;

/** Display names for the attributes, used in the UI. */
export const ATTR_LABELS: Record<AttributeKey, string> = {
  STR: "Strength",
  AGI: "Agility",
  SMT: "Smartness",
  CHA: "Charisma",
};
