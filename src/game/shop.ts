// ---------------------------------------------------------------------------
// shop.ts — the market (GDD §5.1) and equipment management. Pure functions that
// take a GameState and return a new one. Prices flex with your Merchants' Guild
// standing (GDD §6.1): goodwill earns a better deal at the stall.
//
// Buying gear you can't yet wield is allowed — you carry it until your
// attributes catch up (GDD §3.3). Equipping is what the requirement gates.
// ---------------------------------------------------------------------------

import {
  HOME_PRICE,
  MERCHANT_BUY_DISCOUNT,
  MERCHANT_SELL_BONUS,
  SELL_FRACTION,
} from "./config";
import { ARMORS, ITEMS, MAGIC_WEAPONS, QUEST_GEAR, WEAPONS, meetsRequirements } from "./equipment";
import { pushLog } from "./log";
import type { Character, GameState, Settlement } from "./types";

/** The kinds of thing the shop deals in. */
export type StockKind = "weapon" | "armor" | "consumable" | "home";

export interface StockRef {
  kind: StockKind;
  id: string;
}

// A tiny self-contained generator (mulberry32) seeded from the settlement id —
// stock is presentation-stable data, deliberately NOT drawn from the run's
// rngSeed stream (browsing a shop must never shift the game's dice).
function stockHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
function stockRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much smithy a settlement can support: a price ceiling for its stock and
 *  how many weapons/armors its racks hold. */
const STOCK_TIERS: Record<Settlement["kind"], { ceiling: number; weapons: number; armors: number }> = {
  hamlet: { ceiling: 60, weapons: 2, armors: 1 },
  town: { ceiling: 160, weapons: 4, armors: 2 },
  city: { ceiling: Infinity, weapons: 5, armors: 3 },
};

/**
 * What THIS settlement's shop stocks — deterministic per settlement, so a
 * blacksmith always carries the same racks on your next visit, but no two
 * smithies carry quite the same selection. Magic weapons never appear; homes
 * and basic supplies are everywhere; the finer consumables need a town.
 */
export function shopStockFor(settlement: Settlement): StockRef[] {
  const tier = STOCK_TIERS[settlement.kind];
  const r = stockRng(stockHash(`stock:${settlement.id}`));

  function pick<T extends { id: string; price: number }>(pool: T[], count: number): T[] {
    const list = [...pool];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, count).sort((a, b) => a.price - b.price);
  }

  const weaponPool = Object.values(WEAPONS).filter(
    (w) => !MAGIC_WEAPONS.includes(w.id) && !QUEST_GEAR.includes(w.id) && w.price <= tier.ceiling,
  );
  const armorPool = Object.values(ARMORS).filter(
    (a) => !QUEST_GEAR.includes(a.id) && a.price <= tier.ceiling,
  );

  const consumables: StockRef[] = [
    { kind: "consumable", id: "ration" },
    { kind: "consumable", id: "healing_draught" },
  ];
  if (settlement.kind !== "hamlet") {
    consumables.push({ kind: "consumable", id: "greater_draught" });
    consumables.push({ kind: "consumable", id: "smoke_bomb" });
  }

  return [
    { kind: "home", id: "home" },
    ...pick(weaponPool, tier.weapons).map((w): StockRef => ({ kind: "weapon", id: w.id })),
    ...pick(armorPool, tier.armors).map((a): StockRef => ({ kind: "armor", id: a.id })),
    ...consumables,
  ];
}

/** Look up the base record + price + display name for any stock reference. */
export function stockInfo(ref: StockRef): { name: string; basePrice: number } {
  if (ref.kind === "home") {
    return { name: "A Home of Your Own", basePrice: HOME_PRICE };
  }
  if (ref.kind === "weapon") {
    const w = WEAPONS[ref.id];
    return { name: w.name, basePrice: w.price };
  }
  if (ref.kind === "armor") {
    const a = ARMORS[ref.id];
    return { name: a.name, basePrice: a.price };
  }
  const i = ITEMS[ref.id];
  return { name: i.name, basePrice: i.price };
}

/** The price to BUY, after Merchants' Guild goodwill (min 1). */
export function buyPrice(character: Character, basePrice: number): number {
  const factor = 1 - character.reputation.merchants * MERCHANT_BUY_DISCOUNT;
  return Math.max(1, Math.round(basePrice * factor));
}

/** The price to SELL, after goodwill (never more than the buy price). */
export function sellPrice(character: Character, basePrice: number): number {
  const factor = SELL_FRACTION + character.reputation.merchants * MERCHANT_SELL_BONUS;
  return Math.max(1, Math.round(basePrice * Math.min(0.9, factor)));
}

/** Do you already own this weapon/armor/home? (Consumables stack instead.)
 *  Homes are per-settlement, so the home check needs to know where you are. */
export function owns(character: Character, ref: StockRef, settlementId: string | null = null): boolean {
  if (ref.kind === "weapon") return character.ownedWeapons.includes(ref.id);
  if (ref.kind === "armor") return character.ownedArmor.includes(ref.id);
  if (ref.kind === "home") return settlementId !== null && character.ownedHomes.includes(settlementId);
  return false;
}

/** Buy one unit of a stock item. No-op (returns same state) if unaffordable or
 *  already owned (for unique things). */
export function buy(state: GameState, ref: StockRef): GameState {
  const c = state.character;
  const { name, basePrice } = stockInfo(ref);
  const price = buyPrice(c, basePrice);
  if (c.gold < price) return state;
  if (ref.kind !== "consumable" && owns(c, ref, state.location.settlementId)) return state;
  if (ref.kind === "home" && state.location.settlementId === null) return state; // no plots on the open road

  let character: Character = { ...c, gold: c.gold - price };
  if (ref.kind === "weapon") {
    character = { ...character, ownedWeapons: [...character.ownedWeapons, ref.id] };
  } else if (ref.kind === "armor") {
    character = { ...character, ownedArmor: [...character.ownedArmor, ref.id] };
  } else if (ref.kind === "home") {
    const here = state.location.settlementId!;
    character = {
      ...character,
      ownedHomes: [...character.ownedHomes, here],
      // The household settles into the first home; later homes need the
      // "Send for your family" action to become the family's seat.
      familySettlementId: character.familySettlementId ?? here,
    };
  } else {
    character = {
      ...character,
      inventory: { ...character.inventory, [ref.id]: (character.inventory[ref.id] ?? 0) + 1 },
    };
  }

  const settlementName = state.map.settlements.find((s) => s.id === state.location.settlementId)?.name;
  return pushLog({ ...state, character }, {
    text:
      ref.kind === "home"
        ? `You buy a home of your own${settlementName ? ` in ${settlementName}` : ""} for ${price} gold. A place to raise a family at last.`
        : `You buy the ${name} for ${price} gold.`,
    tone: ref.kind === "home" ? "good" : "neutral",
  });
}

/** Sell one unit. Won't sell currently-equipped gear or an item you lack. */
export function sell(state: GameState, ref: StockRef): GameState {
  const c = state.character;
  const { name, basePrice } = stockInfo(ref);
  const price = sellPrice(c, basePrice);

  if (ref.kind === "weapon") {
    if (c.weapon.id === ref.id) return state; // can't sell what you're wielding
    if (!c.ownedWeapons.includes(ref.id)) return state;
    const character = {
      ...c,
      gold: c.gold + price,
      ownedWeapons: c.ownedWeapons.filter((id) => id !== ref.id),
    };
    return pushLog({ ...state, character }, { text: `You sell the ${name} for ${price} gold.`, tone: "good" });
  }

  if (ref.kind === "armor") {
    if (c.armor?.id === ref.id) return state; // can't sell what you're wearing
    if (!c.ownedArmor.includes(ref.id)) return state;
    const character = {
      ...c,
      gold: c.gold + price,
      ownedArmor: c.ownedArmor.filter((id) => id !== ref.id),
    };
    return pushLog({ ...state, character }, { text: `You sell the ${name} for ${price} gold.`, tone: "good" });
  }

  // consumable
  if ((c.inventory[ref.id] ?? 0) <= 0) return state;
  const character = {
    ...c,
    gold: c.gold + price,
    inventory: { ...c.inventory, [ref.id]: c.inventory[ref.id] - 1 },
  };
  return pushLog({ ...state, character }, { text: `You sell the ${name} for ${price} gold.`, tone: "good" });
}

/** Equip an owned weapon, if its requirements are met (GDD §3.3). */
export function equipWeapon(state: GameState, id: string): GameState {
  const c = state.character;
  const weapon = WEAPONS[id];
  if (!weapon || !c.ownedWeapons.includes(id)) return state;
  if (!meetsRequirements(c.attributes, weapon.requirements)) return state;
  return pushLog(
    { ...state, character: { ...c, weapon } },
    { text: `You ready the ${weapon.name}.`, tone: "neutral" },
  );
}

/** Equip an owned armor, if its requirements are met (GDD §3.3). */
export function equipArmor(state: GameState, id: string): GameState {
  const c = state.character;
  const armor = ARMORS[id];
  if (!armor || !c.ownedArmor.includes(id)) return state;
  if (!meetsRequirements(c.attributes, armor.requirements)) return state;
  return pushLog(
    { ...state, character: { ...c, armor } },
    { text: `You don the ${armor.name}.`, tone: "neutral" },
  );
}

/** Take off armor (fight unarmored). */
export function removeArmor(state: GameState): GameState {
  const c = state.character;
  if (!c.armor) return state;
  return pushLog(
    { ...state, character: { ...c, armor: null } },
    { text: "You strip off your armor.", tone: "neutral" },
  );
}
