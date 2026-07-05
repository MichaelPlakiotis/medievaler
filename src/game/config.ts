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

export const SAVE_VERSION = 1;

/** Display names for the attributes, used in the UI. */
export const ATTR_LABELS: Record<AttributeKey, string> = {
  STR: "Strength",
  AGI: "Agility",
  SMT: "Smartness",
  CHA: "Charisma",
};
