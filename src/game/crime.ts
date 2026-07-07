// ---------------------------------------------------------------------------
// crime.ts — the crime system (GDD §6.2). A crime is a skill check against a
// target's difficulty. The resolution flow follows the GDD exactly:
//
//   success            → loot + a small hit to the wronged faction only
//   failure → escape   → you got away, but you were seen (small hit)
//   failure → arrest   → caught: big hit, a fine, and time in the lockup
//
// Everything here is pure. resolveCrime returns the new state plus whether the
// player was jailed (so the engine can burn the rest of the day).
// ---------------------------------------------------------------------------

import {
  CRIME_BASE_SUCCESS,
  CRIME_SKILL_SCALE,
  CRIME_SUCCESS_MAX,
  CRIME_SUCCESS_MIN,
  CRIME_THIEVES_BONUS,
  ESCAPE_AGI_BONUS,
  ESCAPE_BASE,
  ESCAPE_MAX,
  ESCAPE_MIN,
} from "./config";
import { grantXp, practiceAttribute } from "./character";
import { pushLog } from "./log";
import { applyReputation } from "./reputation";
import { randInt } from "./rng";
import type { AttributeKey, Attributes, Character, Faction, GameState } from "./types";

/** A crime the player can attempt. */
export interface CrimeDef {
  id: string;
  label: string;
  hint: string;
  /** The weighted attribute score this crime keys off (GDD §6.2). */
  skill: (a: Attributes) => number;
  /** The attribute practiced by attempting it. */
  trains: AttributeKey;
  /** Target's defense/difficulty rating. */
  difficulty: number;
  xp: number;
  goldMin: number;
  goldMax: number;
  /** Reputation deltas for each outcome (negative = worse standing). */
  repSuccess: Partial<Record<Faction, number>>;
  repEscape: Partial<Record<Faction, number>>;
  repArrest: Partial<Record<Faction, number>>;
  /** Fine range on arrest. */
  fineMin: number;
  fineMax: number;
  /** Flavor for a clean success. */
  success: string;
}

export const CRIMES: Record<string, CrimeDef> = {
  pickpocket: {
    id: "pickpocket",
    label: "Pick a pocket",
    hint: "Lift a purse from a passerby. Quick, low stakes. Keyed to Agility.",
    skill: (a) => a.AGI,
    trains: "AGI",
    difficulty: 2,
    xp: 8,
    goldMin: 2,
    goldMax: 6,
    repSuccess: { guard: -1, thieves: 2 },
    repEscape: { guard: -2 },
    repArrest: { guard: -6, thieves: 1 },
    fineMin: 3,
    fineMax: 8,
    success: "Your fingers find a fat purse and slip it free unseen.",
  },
  burgle: {
    id: "burgle",
    label: "Burgle a home",
    hint: "Break into a dark house for its valuables. Keyed to Agility & Smarts.",
    skill: (a) => a.AGI * 0.6 + a.SMT * 0.4,
    trains: "SMT",
    difficulty: 5,
    xp: 16,
    goldMin: 6,
    goldMax: 16,
    repSuccess: { guard: -2, thieves: 4, church: -1 },
    repEscape: { guard: -4 },
    repArrest: { guard: -12, thieves: 2 },
    fineMin: 10,
    fineMax: 25,
    success: "You ghost through a shuttered window and empty the coffer.",
  },
};

/** Success % for a crime (GDD §6.2): base plus how far your weighted skill
 *  outstrips the target's difficulty, eased by the underworld's regard. */
export function crimeSuccessChance(c: Character, crime: CrimeDef): number {
  const skill = crime.skill(c.attributes);
  const raw =
    CRIME_BASE_SUCCESS +
    (skill - crime.difficulty) * CRIME_SKILL_SCALE +
    c.reputation.thieves * CRIME_THIEVES_BONUS;
  return Math.max(CRIME_SUCCESS_MIN, Math.min(CRIME_SUCCESS_MAX, raw));
}

/** Escape % on a botched crime — the GDD's 50/50, nudged by Agility. */
function escapeChance(c: Character): number {
  const raw = ESCAPE_BASE + c.attributes.AGI * ESCAPE_AGI_BONUS;
  return Math.max(ESCAPE_MIN, Math.min(ESCAPE_MAX, raw));
}

/**
 * Attempt a crime. Returns the new state and whether the player was jailed
 * (arrested) — the engine uses that to consume the rest of the day.
 */
export function resolveCrime(
  state: GameState,
  crime: CrimeDef,
): { state: GameState; jailed: boolean } {
  let seed = state.rngSeed;

  // 1–2. Roll the skill check against the target's difficulty.
  const succ = crimeSuccessChance(state.character, crime);
  const roll = randInt(seed, 1, 100);
  seed = roll.seed;
  let next: GameState = { ...state, rngSeed: seed };

  // Attempting a crime is practice regardless of outcome (GDD §3.1/§3.2).
  const trainAndXp = (s: GameState, xp: number): GameState => {
    const xpRes = grantXp(s.character, xp);
    let c = xpRes.character;
    const pr = practiceAttribute(c, crime.trains);
    c = pr.character;
    let out = { ...s, character: c };
    if (xpRes.leveledUp > 0) {
      out = pushLog(out, { text: `You reach level ${c.level}!`, tone: "good" });
    }
    if (pr.raised) {
      out = pushLog(out, {
        text: `Your ${crime.trains} rises to ${c.attributes[crime.trains]}.`,
        tone: "good",
      });
    }
    return out;
  };

  if (roll.value <= succ) {
    // 3. Success — take the loot, small hit to the wronged faction only.
    const goldRoll = randInt(next.rngSeed, crime.goldMin, crime.goldMax);
    next = { ...next, rngSeed: goldRoll.seed };
    let c = applyReputation(next.character, crime.repSuccess);
    c = { ...c, gold: c.gold + goldRoll.value };
    next = { ...next, character: c };
    next = pushLog(next, {
      text: `${crime.success} +${goldRoll.value} gold.`,
      tone: "good",
    });
    return { state: trainAndXp(next, crime.xp), jailed: false };
  }

  // 4. Failure — a separate luck check: escape or arrest (GDD §6.2.1).
  next = pushLog(next, { text: "It goes wrong — a shout, a grabbing hand.", tone: "bad" });
  const esc = randInt(next.rngSeed, 1, 100);
  next = { ...next, rngSeed: esc.seed };

  if (esc.value <= escapeChance(next.character)) {
    // Escape: seen but not caught.
    next = { ...next, character: applyReputation(next.character, crime.repEscape) };
    next = pushLog(next, {
      text: "You bolt down an alley and lose them in the dark. Witnessed, not caught.",
      tone: "neutral",
    });
    return { state: trainAndXp(next, Math.ceil(crime.xp / 2)), jailed: false };
  }

  // Arrest: caught. Big hit, a fine you can afford, and jail time.
  const fineRoll = randInt(next.rngSeed, crime.fineMin, crime.fineMax);
  next = { ...next, rngSeed: fineRoll.seed };
  const fine = Math.min(next.character.gold, fineRoll.value);
  let c = applyReputation(next.character, crime.repArrest);
  c = { ...c, gold: c.gold - fine };
  next = { ...next, character: c };
  next = pushLog(next, {
    text: `The guard collars you. Hauled to the lockup${fine > 0 ? ` and fined ${fine} gold` : ""}.`,
    tone: "bad",
  });
  return { state: trainAndXp(next, Math.ceil(crime.xp / 2)), jailed: true };
}
