// ---------------------------------------------------------------------------
// aging.ts — what the years do to a body (GDD §7.1). The four life tiers were
// display-only labels until this milestone; now each carries attribute
// modifiers (config.AGE_TIER_MODIFIERS) that are DERIVED from the character's
// current age, never written into the character. Base attributes stay the
// record of training; `effectiveAttributes` is what the dice actually see.
// Because it's derived, it needs no save migration and is always right for
// heirs who take over at any age.
// ---------------------------------------------------------------------------

import { AGE_TIER_MODIFIERS } from "./config";
import type { AgeTier, AttributeKey, Attributes, Character } from "./types";

const ATTR_KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

/** The life tier a given whole-year age falls into (GDD §7.1). */
export function ageTier(age: number): AgeTier {
  if (age <= 17) return "Adolescence";
  if (age <= 35) return "Prime";
  if (age <= 55) return "Maturity";
  return "Old Age";
}

/** The attribute modifiers a given age contributes (0 for unlisted keys). */
export function tierModifiers(age: number): Partial<Attributes> {
  return AGE_TIER_MODIFIERS[ageTier(age)];
}

/**
 * Base attributes with the age-tier modifiers applied, floored at 1 — the
 * values every roll (combat, crime, courtship, traps) should read. Max
 * HP/mana, equipment requirements, practice, and inheritance all stay on
 * `character.attributes`: age changes what you can do, not what you learned.
 */
export function effectiveAttributes(character: Character): Attributes {
  const mods = tierModifiers(character.ageYears);
  const out = {} as Attributes;
  for (const k of ATTR_KEYS) {
    out[k] = Math.max(1, character.attributes[k] + (mods[k] ?? 0));
  }
  return out;
}
