// ---------------------------------------------------------------------------
// reputation.ts — standing with the four powers of the world (GDD §6.1) and the
// gameplay knobs it turns. Pure helpers: give them a character, get data back.
//
// The key rule (GDD §6.1.1): before adulthood, what you do barely sticks. A
// reckless youth is cheap; at 18 the same deeds start to carry full weight.
// ---------------------------------------------------------------------------

import {
  AGE_OF_CONSEQUENCE,
  REP_MAX,
  REP_MIN,
  YOUTH_REP_MULTIPLIER,
} from "./config";
import type { Character, Faction, Reputation } from "./types";

/** Display names for each faction. */
export const FACTION_LABELS: Record<Faction, string> = {
  guard: "Town Guard",
  merchants: "Merchants' Guild",
  thieves: "Thieves' Den",
  church: "The Church",
};

/** Everyone starts unknown to all factions. */
export function makeReputation(): Reputation {
  return { guard: 0, merchants: 0, thieves: 0, church: 0 };
}

/** A word for a standing value, for the UI. */
export function standingLabel(value: number): string {
  if (value <= -40) return "Hostile";
  if (value <= -10) return "Disliked";
  if (value < 10) return "Neutral";
  if (value < 40) return "Liked";
  return "Trusted";
}

function clampRep(v: number): number {
  return Math.max(REP_MIN, Math.min(REP_MAX, v));
}

/**
 * Apply a bundle of reputation changes to a character, muted if they're still a
 * youth (GDD §6.1.1). Returns a NEW character. Deltas are keyed by faction.
 */
export function applyReputation(
  character: Character,
  deltas: Partial<Record<Faction, number>>,
): Character {
  const young = character.ageYears < AGE_OF_CONSEQUENCE;
  const factor = young ? YOUTH_REP_MULTIPLIER : 1;

  const reputation: Reputation = { ...character.reputation };
  for (const key of Object.keys(deltas) as Faction[]) {
    const raw = (deltas[key] ?? 0) * factor;
    // Round toward the delta's own sign so a real change never rounds to nothing
    // unless the youth multiplier genuinely swallowed it.
    const applied = raw === 0 ? 0 : Math.sign(raw) * Math.round(Math.abs(raw));
    reputation[key] = clampRep(reputation[key] + applied);
  }
  return { ...character, reputation };
}

// --- Reputation-driven gameplay modifiers ----------------------------------

/**
 * Chance (0–1) of a robbery/eviction while sleeping unprotected (GDD §5.3).
 * Good standing with the Town Guard makes the night safer; a hated outlaw
 * sleeps poorly.
 */
export function sleepRobberyChance(character: Character): number {
  const base = 0.15;
  const chance = base - character.reputation.guard * 0.002;
  return Math.max(0.02, Math.min(0.6, chance));
}

/** Extra encounter chance from a bad reputation with the guard (GDD §6.1). */
export function hostileEncounterBonus(character: Character): number {
  return character.reputation.guard < -20 ? 0.12 : 0;
}

/** Bonus gold on honest work from Merchants' Guild goodwill. */
export function workGoldBonus(character: Character): number {
  return Math.floor(Math.max(0, character.reputation.merchants) / 20);
}
