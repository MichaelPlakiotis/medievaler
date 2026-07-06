// ---------------------------------------------------------------------------
// equipment.ts — weapons and consumable items. Like enemies, these are plain
// data tables plus a couple of helpers. Adding a weapon or item later means
// adding an entry here; the combat engine reads from these registries.
// ---------------------------------------------------------------------------

import { MANA_PER_SMT } from "./config";
import type { Attributes, Weapon } from "./types";

/** All weapons in the game (GDD §3.3 / §4). Balance numbers freely. */
export const WEAPONS: Record<string, Weapon> = {
  // A light, quick blade — leans on Agility.
  travelers_knife: {
    id: "travelers_knife",
    name: "Traveler's Knife",
    baseDamage: 4,
    skill: 9,
    attackAttr: "AGI",
  },
  // A blunt, heavier tool — leans on Strength.
  oak_cudgel: {
    id: "oak_cudgel",
    name: "Oak Cudgel",
    baseDamage: 5,
    skill: 8,
    attackAttr: "STR",
  },
};

/** What a consumable does when used. */
export type ItemEffect = "heal" | "flee";

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  effect: ItemEffect;
  /** Only usable inside a fight? (both current items are combat-only). */
  combatOnly: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  healing_draught: {
    id: "healing_draught",
    name: "Healing Draught",
    desc: "Restores a chunk of health.",
    effect: "heal",
    combatOnly: false,
  },
  smoke_bomb: {
    id: "smoke_bomb",
    name: "Smoke Bomb",
    desc: "Break off a fight and escape.",
    effect: "flee",
    combatOnly: true,
  },
};

/** Max mana is derived from Smartness (GDD §4.2). */
export function maxManaFor(attributes: Attributes): number {
  return attributes.SMT * MANA_PER_SMT;
}

/**
 * Pick a sensible starting weapon from the character's build: a knife for the
 * nimble, a cudgel for the strong. A small nod to honoring the player's points.
 */
export function startingWeapon(attributes: Attributes): Weapon {
  return attributes.AGI >= attributes.STR ? WEAPONS.travelers_knife : WEAPONS.oak_cudgel;
}

/** The bag every new character starts with. */
export function startingInventory(): Record<string, number> {
  return { healing_draught: 2, smoke_bomb: 1 };
}
