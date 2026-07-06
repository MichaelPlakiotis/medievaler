// ---------------------------------------------------------------------------
// equipment.ts — weapons, armor, and consumables, plus the attribute-gating
// rules (GDD §3.3). All plain data tables + a few helpers. Adding gear later =
// adding an entry here; the combat engine and shop read from these registries.
// ---------------------------------------------------------------------------

import { MANA_PER_SMT } from "./config";
import type { Armor, Attributes, Requirements, Weapon } from "./types";

/** All weapons in the game (GDD §3.3 / §4). Balance numbers freely. */
export const WEAPONS: Record<string, Weapon> = {
  // A light, quick blade — leans on Agility. The nimble start here.
  travelers_knife: {
    id: "travelers_knife",
    name: "Traveler's Knife",
    baseDamage: 4,
    skill: 9,
    attackAttr: "AGI",
    price: 15,
  },
  // A blunt, heavier tool — leans on Strength. The strong start here.
  oak_cudgel: {
    id: "oak_cudgel",
    name: "Oak Cudgel",
    baseDamage: 5,
    skill: 8,
    attackAttr: "STR",
    price: 15,
  },
  // A step up for an Agility build.
  leather_shortbow: {
    id: "leather_shortbow",
    name: "Leather Shortbow",
    baseDamage: 6,
    skill: 11,
    attackAttr: "AGI",
    requirements: { AGI: 3 },
    price: 40,
  },
  // A fast finesse blade for a nimble fighter.
  steel_rapier: {
    id: "steel_rapier",
    name: "Steel Rapier",
    baseDamage: 8,
    skill: 13,
    attackAttr: "AGI",
    requirements: { AGI: 5 },
    price: 75,
  },
  // A brutal two-hander.
  war_axe: {
    id: "war_axe",
    name: "War Axe",
    baseDamage: 9,
    skill: 9,
    attackAttr: "STR",
    requirements: { STR: 5 },
    price: 80,
  },
  // The GDD's example heavy weapon — a serious Strength commitment.
  iron_greatsword: {
    id: "iron_greatsword",
    name: "Iron Greatsword",
    baseDamage: 10,
    skill: 10,
    attackAttr: "STR",
    requirements: { STR: 6 },
    price: 90,
  },
};

/** All armor (GDD §3.3 / §4.2). Higher value blocks more but weighs on dodge. */
export const ARMORS: Record<string, Armor> = {
  padded_tunic: {
    id: "padded_tunic",
    name: "Padded Tunic",
    armorValue: 1,
    weightPenalty: 0,
    price: 25,
  },
  leather_jerkin: {
    id: "leather_jerkin",
    name: "Leather Jerkin",
    armorValue: 2,
    weightPenalty: 1,
    requirements: { AGI: 2 },
    price: 55,
  },
  iron_cuirass: {
    id: "iron_cuirass",
    name: "Iron Cuirass",
    armorValue: 3,
    weightPenalty: 2,
    requirements: { STR: 3 },
    price: 95,
  },
  chainmail: {
    id: "chainmail",
    name: "Chainmail Hauberk",
    armorValue: 4,
    weightPenalty: 3,
    requirements: { STR: 4 },
    price: 130,
  },
};

/** What a consumable does when used. */
export type ItemEffect = "heal" | "flee";

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  effect: ItemEffect;
  /** Only usable inside a fight? */
  combatOnly: boolean;
  /** Health restored by a "heal" item (defaults to the global HEAL_AMOUNT). */
  heal?: number;
  /** Shop price in gold. */
  price: number;
}

export const ITEMS: Record<string, ItemDef> = {
  ration: {
    id: "ration",
    name: "Ration",
    desc: "Bread and cheese. Restores a little health — vital on the road.",
    effect: "heal",
    combatOnly: false,
    heal: 7,
    price: 5,
  },
  healing_draught: {
    id: "healing_draught",
    name: "Healing Draught",
    desc: "Restores a chunk of health.",
    effect: "heal",
    combatOnly: false,
    heal: 12,
    price: 12,
  },
  greater_draught: {
    id: "greater_draught",
    name: "Greater Draught",
    desc: "A potent brew that restores a lot of health.",
    effect: "heal",
    combatOnly: false,
    heal: 26,
    price: 30,
  },
  smoke_bomb: {
    id: "smoke_bomb",
    name: "Smoke Bomb",
    desc: "Break off a fight and escape.",
    effect: "flee",
    combatOnly: true,
    price: 18,
  },
};

/** Max mana is derived from Smartness (GDD §4.2). */
export function maxManaFor(attributes: Attributes): number {
  return attributes.SMT * MANA_PER_SMT;
}

/** Does a character's attributes meet an item's requirements (GDD §3.3)? */
export function meetsRequirements(attributes: Attributes, req?: Requirements): boolean {
  if (!req) return true;
  return (Object.keys(req) as (keyof Attributes)[]).every(
    (k) => attributes[k] >= (req[k] ?? 0),
  );
}

/** A readable "STR 6, AGI 3" string for a requirements bundle (or "" if none). */
export function requirementText(req?: Requirements): string {
  if (!req) return "";
  return (Object.keys(req) as (keyof Attributes)[])
    .map((k) => `${k} ${req[k]}`)
    .join(", ");
}

/**
 * Pick a sensible starting weapon from the character's build: a knife for the
 * nimble, a cudgel for the strong.
 */
export function startingWeapon(attributes: Attributes): Weapon {
  return attributes.AGI >= attributes.STR ? WEAPONS.travelers_knife : WEAPONS.oak_cudgel;
}

/** The consumable bag every new character starts with. */
export function startingInventory(): Record<string, number> {
  return { healing_draught: 2, smoke_bomb: 1 };
}
