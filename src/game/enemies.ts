// ---------------------------------------------------------------------------
// enemies.ts — the bestiary and the encounter tables. Which foes appear, and
// how likely a given action is to stumble into one. All data + one roll helper.
// ---------------------------------------------------------------------------

import { ENCOUNTER_CHANCE } from "./config";
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
};

/** Which enemies each action can turn up. Keyed by action id. */
const ENCOUNTER_TABLES: Record<string, string[]> = {
  roam: ["stray_dog", "boar"],
  hunt: ["boar", "wolf"],
  alleys: ["drunkard", "cutpurse", "stray_dog"],
};

/**
 * Roll for an encounter for the given action. Always returns the state with the
 * RNG seed advanced (so a failed roll still consumes randomness), and `enemy`
 * set to the chosen foe or null if nothing happened. Actions with no table
 * (tavern, shop, work) never trigger a fight.
 */
export function maybeEncounter(
  state: GameState,
  actionId: string,
): { state: GameState; enemy: EnemyDef | null } {
  const table = ENCOUNTER_TABLES[actionId];
  if (!table || table.length === 0) return { state, enemy: null };

  const roll = chance(state.rngSeed, ENCOUNTER_CHANCE);
  let seed = roll.seed;
  if (!roll.value) return { state: { ...state, rngSeed: seed }, enemy: null };

  const pick = randInt(seed, 0, table.length - 1);
  seed = pick.seed;
  const enemy = ENEMIES[table[pick.value]];
  return { state: { ...state, rngSeed: seed }, enemy };
}
