// ---------------------------------------------------------------------------
// config.ts — EVERY tunable number in the game lives here.
//
// The GDD says all numbers are placeholders for balancing. Keeping them in one
// file means "balancing the game" = editing this file, and nothing else has to
// change. Feel free to tweak these values and reload to see the effect.
// ---------------------------------------------------------------------------

import type { AgeTier, AttributeKey, Attributes, Faction } from "./types";

/** Character creation (GDD §1.1 / §3.1). */
export const START_AGE = 15; // a teenager in a small hamlet
export const START_GOLD = 12; // "a handful of coins"
export const ATTR_BASE = 1; // each attribute starts here...
export const ATTR_POINTS = 5; // ...and the player distributes this many more

/** Day/night structure (GDD §2.2). */
export const TURNS_PER_DAY = 8;
export const NIGHT_TURNS = 4;
export const FATIGUE_PENALTY = 1; // subtracted from outcome rolls the day after staying up
// How fast the calendar (and aging) moves. Deliberately brisk for a prototype
// so a determined player can actually reach the next generation in one session.
export const DAYS_PER_YEAR = 6;

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

// --- Shops & equipment (GDD §3.3 / §5.1) -----------------------------------
/** Base fraction of an item's price you get back when selling. */
export const SELL_FRACTION = 0.5;
/** Merchants' Guild standing shifts prices: each point cuts buy cost and lifts
 *  sale value by this fraction (goodwill = a better deal). */
export const MERCHANT_BUY_DISCOUNT = 0.003;
export const MERCHANT_SELL_BONUS = 0.002;

// --- Aging, family & legacy (GDD §2.4 / §7) --------------------------------
/**
 * Per-tier attribute modifiers (GDD §7.1): Maturity's wisdom, Old Age's
 * frailty. These are DERIVED, not baked into the character — applied wherever
 * stats are rolled (combat, crime, courtship, traps), never to max HP/mana,
 * equipment requirements, practice, or a child's inherited blend.
 */
export const AGE_TIER_MODIFIERS: Record<AgeTier, Partial<Attributes>> = {
  Adolescence: {},
  Prime: {},
  Maturity: { SMT: 1, CHA: 1 }, // wisdom
  "Old Age": { SMT: 1, CHA: 1, STR: -2, AGI: -2 }, // wisdom kept; frailty
};
/** Old age begins here; natural death becomes possible (GDD §7.1). */
export const OLD_AGE_START = 56;
/** Per-day death chance in old age, per year lived past 55. */
export const NATURAL_DEATH_PER_YEAR = 0.01;
/** A child can inherit and be played once this old (GDD §2.4/§7.3). */
export const HEIR_MIN_AGE = 12;
/** Marriage (and children) unlock in the Prime tier (GDD §7.1). */
export const MARRY_AGE = 18;
/** Relationship needed with a sweetheart before you can propose. */
export const MARRY_RELATIONSHIP = 60;
/** Relationship gain per courting turn, plus this × Charisma (GDD §7.3). */
export const COURT_BASE_GAIN = 6;
export const COURT_CHA_GAIN = 2;
/** Base chance a "try for a child" turn conceives, plus a Charisma nudge. */
export const CONCEIVE_BASE = 0.4;
export const CONCEIVE_CHA = 0.03;
export const MAX_CHILDREN = 6;
/** Random per-attribute wobble on a newborn's blended attributes (GDD §7.3). */
export const CHILD_ATTR_WOBBLE = 1;
/** Fraction of a parent's reputation an heir inherits (GDD §2.4). */
export const INHERIT_REP_FRACTION = 0.5;
/** Courtship this deep reveals a sweetheart's attributes — so you can choose a
 *  match for stronger children (GDD §7.3). */
export const SUITOR_REVEAL = 35;
/** You can only have one child per year (no heir-spamming). */
export const CHILD_COOLDOWN_DAYS = DAYS_PER_YEAR;
/** Price of a home. Owning one is what lets you raise a family (GDD §7.3). */
export const HOME_PRICE = 120;

// --- Bigger-city amenities (university & brothel) ---------------------------
/** University: a richer XP/gold roll than the church's free `study`, plus a
 *  tuition cost — but the real difference is training SMT twice as hard
 *  (see amenities.ts's university()). */
export const UNIVERSITY_XP_MIN = 6;
export const UNIVERSITY_XP_MAX = 11;
export const UNIVERSITY_GOLD_COST = 4;
/** Brothel: Charisma training (same practice-and-XP shape as courting — see
 *  family.ts's trainCha), at a price. */
export const BROTHEL_GOLD_COST = 6;
/** Chance (male characters only) a visit conceives a child — lower than a
 *  married "try for a child" (CONCEIVE_BASE): this isn't the point of the visit. */
export const BROTHEL_CONCEIVE_BASE = 0.12;
/** If married: per-visit chance of being caught, and — only if caught — a
 *  further chance the marriage doesn't survive it. */
export const BROTHEL_CAUGHT_CHANCE = 0.25;
export const BROTHEL_DIVORCE_CHANCE = 0.35;
/** Reputation hit on being caught — everyone but the Thieves' Den, who don't care. */
export const BROTHEL_CAUGHT_REP_PENALTY: Partial<Record<Faction, number>> = {
  guard: -3,
  merchants: -4,
  church: -8,
};

// --- Dungeons (delve runs) --------------------------------------------------
/** A delve is this many ordinary rooms, then a boss room (GDD-adjacent M9). */
export const DUNGEON_ROOMS_MIN = 3;
export const DUNGEON_ROOMS_MAX = 5;
/** Gold found in a treasure room. */
export const DUNGEON_TREASURE_MIN = 8;
export const DUNGEON_TREASURE_MAX = 22;
/** An event room is a coin flip between a helpful shrine and a trap. */
export const DUNGEON_EVENT_HEAL = 10;
/** Trap damage range, and the Agility check (roll under AGI×scale+base to dodge it). */
export const DUNGEON_TRAP_DMG_MIN = 2;
export const DUNGEON_TRAP_DMG_MAX = 8;
export const DUNGEON_TRAP_DODGE_BASE = 40;
export const DUNGEON_TRAP_DODGE_AGI = 5;
/** Skill points awarded for felling the boss at the bottom of a delve. */
export const BOSS_SKILL_POINTS = 1;
/** Bonus gold range for the boss room, on top of its normal kill reward. */
export const BOSS_BONUS_GOLD_MIN = 15;
export const BOSS_BONUS_GOLD_MAX = 40;

// --- World map & travel (the "bigger world" arc) ---------------------------
/** Hex radius of the generated regional map, centered on the hamlet. */
export const MAP_RADIUS = 12;
/** Settlements beyond Lazy Springs: another hamlet, mid-size towns, and big
 *  cities, each with its own name, structures, and population (townScene.ts). */
export const HAMLET_COUNT = 1;
export const TOWN_COUNT = 3;
export const CITY_COUNT = 2;
/** Other settlements must be at least this many hexes from the hamlet and
 *  from each other. */
export const MIN_SETTLEMENT_DISTANCE = 5;
/** Lakes stamped onto the map — impassable water; roads route around them. */
export const LAKE_COUNT = 2;
export const LAKE_SIZE_MIN = 1; // blob radius, in hexes
export const LAKE_SIZE_MAX = 2;
/** Chance a town rolled a forge (hamlets always have one; cities everything). */
export const TOWN_FORGE_CHANCE = 0.8;
/** Moving to a hex reveals it and hexes within this many steps (fog of war). */
export const FOG_REVEAL_RADIUS = 1;
/** Moving one hex costs this many turns — same economy as any hamlet action. */
export const TRAVEL_TURN_COST = 1;
/**
 * Travel-encounter chance and enemy tier both scale with distance from the
 * nearest settlement. `upTo` is the max hex-distance for that tier (the last
 * entry has no ceiling).
 */
export const TRAVEL_TIERS: { upTo: number; chance: number }[] = [
  { upTo: 2, chance: 0.15 },
  { upTo: 4, chance: 0.3 },
  { upTo: Infinity, chance: 0.45 },
];

// --- Universal Flee (combat) -------------------------------------------------
/** Flee % = base + AGI×scale − enemy dodge×scale, clamped (mirrors ESCAPE_*). */
export const FLEE_BASE = 45;
export const FLEE_AGI_SCALE = 4;
export const FLEE_ENEMY_DODGE_SCALE = 3;
export const FLEE_MIN = 10;
export const FLEE_MAX = 90;

// --- Bribing away a road encounter ------------------------------------------
/** Gold cost to buy off a hostile encounter outright: base + enemy.xp × scale. */
export const BRIBE_BASE = 5;
export const BRIBE_XP_SCALE = 1.5;

// --- Dungeon tiers & world ruins ------------------------------------------------
/** Treasure/boss gold scales by ×(1 + scale·(tier−1)) — city delves and ruins pay. */
export const DUNGEON_TIER_GOLD_SCALE = 0.5;
/** Ruins scattered across the world map, off the roads. */
export const RUIN_SITE_COUNT = 4;
export const SITE_MIN_SETTLEMENT_DIST = 2;
export const SITE_MIN_SITE_DIST = 3;
/** A world ruin's dungeon tier (settlements are 1–3 by kind). */
export const SITE_TIER = 4;
/** First-clear purse when there's no tome or magic weapon left to grant. */
export const SITE_CLEAR_GOLD_MIN = 40;
export const SITE_CLEAR_GOLD_MAX = 80;

// --- Rare tough encounters ------------------------------------------------------
/** Whenever a wilds/night encounter fires, this chance upgrades it to one of
 *  the TOUGH_ENEMIES elites — foes that badly outclass an unprepared player.
 *  Fleeing or (on the road) bribing is meant to be the sane answer. */
export const TOUGH_ENCOUNTER_CHANCE = 0.07;

// --- Moving the household -----------------------------------------------------
/** Gold cost to hire the cart that brings the family to another owned home. */
export const MOVE_FAMILY_COST = 15;

export const SAVE_VERSION = 14;

/** Display names for the attributes, used in the UI. */
export const ATTR_LABELS: Record<AttributeKey, string> = {
  STR: "Strength",
  AGI: "Agility",
  SMT: "Smartness",
  CHA: "Charisma",
};
