// ---------------------------------------------------------------------------
// enemies.ts — the bestiary and the encounter tables. Which foes appear, and
// how likely a given action is to stumble into one. All data + one roll helper.
// ---------------------------------------------------------------------------

import { ENCOUNTER_CHANCE, TOUGH_ENCOUNTER_CHANCE } from "./config";
import { chance, randInt } from "./rng";
import type { EnemyDef, GameState } from "./types";

/** Every kind of enemy. Early-game foes are weak on purpose (GDD §4.3). */
export const ENEMIES: Record<string, EnemyDef> = {
  stray_dog: {
    id: "stray_dog",
    name: "Stray Dog",
    maxHp: 8,
    armor: 0,
    accuracy: 4,
    dodge: 3,
    dmgMin: 1,
    dmgMax: 3,
    behavior: "coward",
    lethality: 0.03,
    xp: 6,
    goldMin: 0,
    goldMax: 1,
    intro: "A mangy dog bares its teeth and blocks the path.",
  },
  boar: {
    id: "boar",
    name: "Wild Boar",
    maxHp: 14,
    armor: 1,
    accuracy: 5,
    dodge: 1,
    dmgMin: 2,
    dmgMax: 5,
    behavior: "aggressive",
    lethality: 0.1,
    xp: 12,
    goldMin: 0,
    goldMax: 2,
    intro: "A wild boar crashes out of the brush, tusks lowered.",
  },
  wolf: {
    id: "wolf",
    name: "Grey Wolf",
    maxHp: 12,
    armor: 0,
    accuracy: 7,
    dodge: 5,
    dmgMin: 2,
    dmgMax: 4,
    behavior: "aggressive",
    lethality: 0.12,
    xp: 14,
    goldMin: 0,
    goldMax: 2,
    intro: "A lean grey wolf pads from the treeline, eyes fixed on you.",
  },
  drunkard: {
    id: "drunkard",
    name: "Belligerent Drunk",
    maxHp: 10,
    armor: 0,
    accuracy: 3,
    dodge: 1,
    dmgMin: 1,
    dmgMax: 4,
    behavior: "aggressive",
    lethality: 0.05,
    xp: 8,
    goldMin: 1,
    goldMax: 4,
    intro: "A red-faced drunk shoves you and swings a meaty fist.",
  },
  cutpurse: {
    id: "cutpurse",
    name: "Alley Cutpurse",
    maxHp: 11,
    armor: 1,
    accuracy: 6,
    dodge: 4,
    dmgMin: 2,
    dmgMax: 4,
    behavior: "defensive",
    lethality: 0.15,
    xp: 13,
    goldMin: 2,
    goldMax: 6,
    intro: "A cutpurse steps from the shadows, blade already drawn.",
  },
  // --- Beneath the barrow (dungeon delves, M9) — tougher than the surface. ---
  giant_rat: {
    id: "giant_rat",
    name: "Giant Rat",
    maxHp: 10,
    armor: 0,
    accuracy: 5,
    dodge: 4,
    dmgMin: 1,
    dmgMax: 4,
    behavior: "aggressive",
    lethality: 0.06,
    xp: 9,
    goldMin: 0,
    goldMax: 2,
    intro: "A rat the size of a hound squeals and lunges from the rubble.",
  },
  barrow_skeleton: {
    id: "barrow_skeleton",
    name: "Barrow Skeleton",
    maxHp: 16,
    armor: 2,
    accuracy: 7,
    dodge: 3,
    dmgMin: 3,
    dmgMax: 6,
    behavior: "aggressive",
    lethality: 0.16,
    xp: 18,
    goldMin: 2,
    goldMax: 5,
    intro: "Bones knit themselves upright, an old blade still in hand.",
  },
  tomb_bandit: {
    id: "tomb_bandit",
    name: "Tomb Bandit",
    maxHp: 15,
    armor: 1,
    accuracy: 8,
    dodge: 5,
    dmgMin: 2,
    dmgMax: 5,
    behavior: "defensive",
    lethality: 0.18,
    xp: 17,
    goldMin: 4,
    goldMax: 10,
    intro: "A grave-robber ahead of you draws steel rather than share the find.",
  },
  crypt_spider: {
    id: "crypt_spider",
    name: "Crypt Spider",
    maxHp: 13,
    armor: 0,
    accuracy: 9,
    dodge: 6,
    dmgMin: 2,
    dmgMax: 5,
    behavior: "aggressive",
    lethality: 0.2,
    xp: 19,
    goldMin: 0,
    goldMax: 3,
    intro: "Something pale and many-legged drops from the ceiling.",
  },
  // --- Rare elites (TOUGH_ENEMIES) — deliberately out of the player's weight
  // class. Their intros telegraph the danger: fleeing is a fair answer. ------
  dire_wolf: {
    id: "dire_wolf",
    name: "Dire Wolf",
    maxHp: 26,
    armor: 1,
    accuracy: 11,
    dodge: 7,
    dmgMin: 4,
    dmgMax: 8,
    behavior: "aggressive",
    lethality: 0.25,
    xp: 34,
    goldMin: 0,
    goldMax: 4,
    intro: "A wolf steps out — far too big, scarred, and utterly unafraid of you.",
  },
  brigand_captain: {
    id: "brigand_captain",
    name: "Brigand Captain",
    maxHp: 30,
    armor: 3,
    accuracy: 10,
    dodge: 5,
    dmgMin: 4,
    dmgMax: 9,
    behavior: "defensive",
    lethality: 0.25,
    xp: 40,
    goldMin: 8,
    goldMax: 18,
    intro: "A brigand in looted half-plate smiles like a man who has never lost this game.",
  },
  hill_troll: {
    id: "hill_troll",
    name: "Hill Troll",
    maxHp: 44,
    armor: 2,
    accuracy: 8,
    dodge: 1,
    dmgMin: 6,
    dmgMax: 12,
    behavior: "aggressive",
    lethality: 0.3,
    xp: 55,
    goldMin: 5,
    goldMax: 14,
    intro: "The hillside moves — a troll unfolds to its full height, club dragging furrows in the earth.",
  },
  barrow_wight: {
    id: "barrow_wight",
    name: "Barrow Wight",
    maxHp: 34,
    armor: 3,
    accuracy: 10,
    dodge: 4,
    dmgMin: 4,
    dmgMax: 9,
    behavior: "aggressive",
    lethality: 0.22,
    xp: 40,
    goldMin: 10,
    goldMax: 20,
    intro: "A cold light kindles in the wight's hollow eyes — the barrow's guardian rises.",
  },
};

/** Non-boss dungeon foes, tiered by how deep the room is (1-based depth). */
export const DUNGEON_ENCOUNTER_TABLE: string[] = [
  "giant_rat",
  "barrow_skeleton",
  "tomb_bandit",
  "crypt_spider",
];

/** The guardian waiting in every delve's final room. */
export const DUNGEON_BOSS = "barrow_wight";

/** Which enemies each action can turn up. Keyed by action id. */
const ENCOUNTER_TABLES: Record<string, string[]> = {
  roam: ["stray_dog", "boar"],
  hunt: ["boar", "wolf"],
  alleys: ["drunkard", "cutpurse", "stray_dog"],
};

/** The rare elites a tough-encounter roll can substitute in. */
export const TOUGH_ENEMIES = ["dire_wolf", "brigand_captain", "hill_troll"];

/**
 * Roll the rare tough-encounter upgrade. Called AFTER an ordinary encounter
 * has already fired (so safe places stay safe): a TOUGH_ENCOUNTER_CHANCE
 * chance to replace the picked foe with a random elite. Pure — returns the
 * advanced seed either way.
 */
export function maybeToughUpgrade(seed: number): { enemy: EnemyDef | null; seed: number } {
  const roll = chance(seed, TOUGH_ENCOUNTER_CHANCE);
  if (!roll.value) return { enemy: null, seed: roll.seed };
  const pick = randInt(roll.seed, 0, TOUGH_ENEMIES.length - 1);
  return { enemy: ENEMIES[TOUGH_ENEMIES[pick.value]], seed: pick.seed };
}

/**
 * Roll for an encounter for the given action. Always returns the state with the
 * RNG seed advanced (so a failed roll still consumes randomness), and `enemy`
 * set to the chosen foe or null if nothing happened. Actions with no table
 * (tavern, shop, work) never trigger a fight. `extraChance` (0–1) adds to the
 * base rate — e.g. a hated reputation draws more trouble (GDD §6.1).
 */
export function maybeEncounter(
  state: GameState,
  actionId: string,
  extraChance = 0,
): { state: GameState; enemy: EnemyDef | null } {
  const table = ENCOUNTER_TABLES[actionId];
  if (!table || table.length === 0) return { state, enemy: null };

  const roll = chance(state.rngSeed, ENCOUNTER_CHANCE + extraChance);
  let seed = roll.seed;
  if (!roll.value) return { state: { ...state, rngSeed: seed }, enemy: null };

  const pick = randInt(seed, 0, table.length - 1);
  seed = pick.seed;
  let enemy = ENEMIES[table[pick.value]];

  // Rarely, what stumbles out of the dark is far worse than the usual fare.
  const tough = maybeToughUpgrade(seed);
  seed = tough.seed;
  if (tough.enemy) enemy = tough.enemy;

  return { state: { ...state, rngSeed: seed }, enemy };
}
