// ---------------------------------------------------------------------------
// spells.ts — the spellbook. Every character knows Bolt of Force; the rest are
// learned from tomes found in the world's ruins. Plain data + tiny helpers,
// same registry pattern as equipment.ts; combat.ts does the actual casting.
// ---------------------------------------------------------------------------

import { SPELL_BASE_DAMAGE, SPELL_COST, SPELL_SMT_SCALE } from "./config";
import type { Character } from "./types";

export interface SpellDef {
  id: string;
  name: string;
  /** Mana spent per cast. */
  cost: number;
  /** Damage dealt (or health restored): round(base + SMT × scale). */
  base: number;
  scale: number;
  kind: "damage" | "heal";
  desc: string;
}

export const SPELLS: Record<string, SpellDef> = {
  // The spell everyone starts with — numbers identical to the original
  // hardcoded Spell Attack, so nothing about early balance changes.
  force_bolt: {
    id: "force_bolt",
    name: "Bolt of Force",
    cost: SPELL_COST,
    base: SPELL_BASE_DAMAGE,
    scale: SPELL_SMT_SCALE,
    kind: "damage",
    desc: "A reliable lance of raw will. Part-ignores armor.",
  },
  // --- Learned from tomes in the ruins ---------------------------------------
  firebrand: {
    id: "firebrand",
    name: "Firebrand",
    cost: 5,
    base: 7,
    scale: 2,
    kind: "damage",
    desc: "A gout of clinging flame — costly, and it hits like a falling roof.",
  },
  frost_needle: {
    id: "frost_needle",
    name: "Frost Needle",
    cost: 1,
    base: 2,
    scale: 1,
    kind: "damage",
    desc: "A sliver of ice for a sliver of mana. Chip damage that never runs dry early.",
  },
  // Quest-only: learned from Brother Eddan's strange book (quests.ts) — the
  // ruins' tomes never teach it.
  ember_ward: {
    id: "ember_ward",
    name: "Ember Ward",
    cost: 2,
    base: 4,
    scale: 1.2,
    kind: "damage",
    desc: "A ring of warding embers flares outward. Cheap, steady, and older than any church doctrine.",
  },
  mending: {
    id: "mending",
    name: "Mending",
    cost: 4,
    base: 6,
    scale: 2,
    kind: "heal",
    desc: "Knit flesh mid-fight. The enemy still gets its turn.",
  },
};

/** The spell every new character starts knowing. */
export const STARTING_SPELLS = ["force_bolt"];

/** Spells only a quest-giver teaches — kept out of the ruins' tome pool. */
export const QUEST_SPELLS = ["ember_ward"];

/** Spells this character has yet to learn — the tome pool in the ruins. */
export function unknownSpells(character: Character): SpellDef[] {
  return Object.values(SPELLS).filter(
    (sp) => !character.knownSpells.includes(sp.id) && !QUEST_SPELLS.includes(sp.id),
  );
}
