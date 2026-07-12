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
  // --- The wider world's smithies (per-settlement stock) ---------------------
  hunting_spear: {
    id: "hunting_spear",
    name: "Hunting Spear",
    baseDamage: 7,
    skill: 10,
    attackAttr: "STR",
    requirements: { STR: 3 },
    price: 45,
  },
  falchion: {
    id: "falchion",
    name: "Falchion",
    baseDamage: 8,
    skill: 11,
    attackAttr: "STR",
    requirements: { STR: 4 },
    price: 65,
  },
  composite_bow: {
    id: "composite_bow",
    name: "Composite Bow",
    baseDamage: 9,
    skill: 13,
    attackAttr: "AGI",
    requirements: { AGI: 6 },
    price: 110,
  },
  masterwork_saber: {
    id: "masterwork_saber",
    name: "Masterwork Saber",
    baseDamage: 11,
    skill: 14,
    attackAttr: "AGI",
    requirements: { AGI: 7 },
    price: 150,
  },
  steel_warhammer: {
    id: "steel_warhammer",
    name: "Steel Warhammer",
    baseDamage: 12,
    skill: 9,
    attackAttr: "STR",
    requirements: { STR: 7 },
    price: 160,
  },
  // --- Quest gear: never sold — earned from the saga's quest-givers ---------
  // The Wardens' service blade, given by Valdis Crane for proof of skill.
  wardens_shortblade: {
    id: "wardens_shortblade",
    name: "Warden's Shortblade",
    baseDamage: 7,
    skill: 12,
    attackAttr: "AGI",
    requirements: { AGI: 3 },
    price: 70,
  },
  // Rook's payment: a blade that belongs to neither the living nor the dead.
  pale_brand: {
    id: "pale_brand",
    name: "The Pale Brand",
    baseDamage: 11,
    skill: 13,
    attackAttr: "AGI",
    requirements: { AGI: 5 },
    price: 250,
  },
  // --- Magic weapons: never sold — found in the world's ruins ---------------
  runed_blade: {
    id: "runed_blade",
    name: "Runed Blade",
    baseDamage: 10,
    skill: 15,
    attackAttr: "AGI",
    requirements: { AGI: 5 },
    price: 240, // its sale value, should you ever part with it
  },
  ember_maul: {
    id: "ember_maul",
    name: "Ember Maul",
    baseDamage: 13,
    skill: 9,
    attackAttr: "STR",
    requirements: { STR: 6 },
    price: 260,
  },
};

/** Weapons no shop ever stocks — they come out of the world's ruins. */
export const MAGIC_WEAPONS = ["runed_blade", "ember_maul"];

/** Gear no shop stocks and no ruin drops — only quest-givers hand these out
 *  (quests.ts). Ids must exist in WEAPONS or ARMORS. */
export const QUEST_GEAR = ["wardens_shortblade", "wardens_field_armor", "pale_brand"];

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
  // Quest-only: Valdis Crane's reward for finding the lost patrol.
  wardens_field_armor: {
    id: "wardens_field_armor",
    name: "Warden's Field Armor",
    armorValue: 3,
    weightPenalty: 1,
    requirements: { AGI: 3 },
    price: 110,
  },
  studded_leather: {
    id: "studded_leather",
    name: "Studded Leather",
    armorValue: 2,
    weightPenalty: 0,
    requirements: { AGI: 3 },
    price: 70,
  },
  plate_cuirass: {
    id: "plate_cuirass",
    name: "Plate Cuirass",
    armorValue: 6,
    weightPenalty: 4,
    requirements: { STR: 6 },
    price: 220,
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
  /** Hunger cleansed when eaten (0–100 scale; see Character.hunger). */
  hungerRelief?: number;
  /** Stamina restored when consumed (0–100 scale; see Character.stamina). */
  staminaRestore?: number;
  /** Shop price in gold. */
  price: number;
}

export const ITEMS: Record<string, ItemDef> = {
  ration: {
    id: "ration",
    name: "Ration",
    desc: "Bread and cheese. Eases hunger and restores a little health — vital on the road.",
    effect: "heal",
    combatOnly: false,
    heal: 7,
    hungerRelief: 40,
    price: 5,
  },
  waterskin: {
    id: "waterskin",
    name: "Waterskin",
    desc: "Cool well-water. Washes some of the day's weariness off.",
    effect: "heal",
    combatOnly: false,
    heal: 0,
    hungerRelief: 5,
    staminaRestore: 30,
    price: 4,
  },
  hearty_meal: {
    id: "hearty_meal",
    name: "Hearty Meal",
    desc: "A trencher of stew, bread, and small beer, packed by a tavern cook. A feast on the road.",
    effect: "heal",
    combatOnly: false,
    heal: 10,
    hungerRelief: 80,
    staminaRestore: 20,
    price: 12,
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

// --- Horses (the stables) ----------------------------------------------------
// Not gear in the equip sense — a mount is a lifestyle. Owning one multiplies
// how far each world-map turn carries you (travel.ts), makes mounted escapes
// easier on the road, and earns a carter's discount on fast travel. A horse is
// family property: it passes to heirs like the stable it lives in.

export interface HorseDef {
  id: string;
  name: string;
  desc: string;
  /** Hexes covered per world-map turn (an unmounted traveler covers 1). */
  speed: number;
  price: number;
}

export const HORSES: Record<string, HorseDef> = {
  rouncey: {
    id: "rouncey",
    name: "Rouncey",
    desc: "A sturdy all-purpose horse. Covers 2 hexes per turn on the world map.",
    speed: 2,
    price: 90,
  },
  courser: {
    id: "courser",
    name: "Courser",
    desc: "A swift, long-legged runner bred for the road. Covers 3 hexes per turn.",
    speed: 3,
    price: 260,
  },
};

/** How many hexes one world-map turn covers for a character with this mount. */
export function horseSpeedOf(horseId: string | null): number {
  return horseId ? (HORSES[horseId]?.speed ?? 1) : 1;
}

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
