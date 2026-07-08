// ---------------------------------------------------------------------------
// dungeon.ts — delve runs beneath the barrow (M9). A dungeon action rolls a
// chain of rooms (fights / treasure / events, always ending in a boss); the
// player presses deeper room by room or leaves with whatever they've found.
// Fights hand off to the existing combat engine — this module only decides
// what happens BETWEEN fights, and what a finished fight means for the delve.
//
// Like combat.ts, everything here is pure: GameState in, GameState out, all
// randomness through state.rngSeed.
// ---------------------------------------------------------------------------

import {
  BOSS_BONUS_GOLD_MAX,
  BOSS_BONUS_GOLD_MIN,
  BOSS_SKILL_POINTS,
  DUNGEON_EVENT_HEAL,
  DUNGEON_ROOMS_MAX,
  DUNGEON_ROOMS_MIN,
  DUNGEON_TIER_GOLD_SCALE,
  DUNGEON_TRAP_DMG_MAX,
  DUNGEON_TRAP_DMG_MIN,
  DUNGEON_TRAP_DODGE_AGI,
  DUNGEON_TRAP_DODGE_BASE,
  DUNGEON_TREASURE_MAX,
  DUNGEON_TREASURE_MIN,
  SITE_CLEAR_GOLD_MAX,
  SITE_CLEAR_GOLD_MIN,
  SITE_TIER,
} from "./config";
import { effectiveAttributes } from "./aging";
import { DUNGEON_BOSS, DUNGEON_ENCOUNTER_TABLE, ENEMIES, TOUGH_ENEMIES } from "./enemies";
import { MAGIC_WEAPONS, WEAPONS } from "./equipment";
import { SPELLS, unknownSpells } from "./spells";
import { startCombat } from "./combat";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import type { DungeonState, GameState, RoomKind, Settlement } from "./types";

// A settlement's own dungeon: seeded from its id, so Lazy Springs always has
// the same barrow and every town its own haunt.
const DUNGEON_NAMES = [
  "the Old Barrow",
  "the Drowned Cellar",
  "the Sunken Crypt",
  "the Wolf Warrens",
  "the Ruined Watchtower",
  "the Hollow Mill",
  "the Forgotten Ossuary",
];

function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** The name of this settlement's own dungeon (stable per settlement). */
export function dungeonNameFor(settlement: Settlement): string {
  return DUNGEON_NAMES[nameHash(`dungeon:${settlement.id}`) % DUNGEON_NAMES.length];
}

/** Settlement kind → its dungeon's difficulty/loot tier. */
const KIND_TIER: Record<Settlement["kind"], number> = { hamlet: 1, town: 2, city: 3 };

/** How much richer this tier's treasure and boss purses run. */
function tierGoldFactor(tier: number): number {
  return 1 + DUNGEON_TIER_GOLD_SCALE * (tier - 1);
}

/** Roll a room chain: DUNGEON_ROOMS_MIN..MAX ordinary rooms, then a boss.
 *  Higher tiers run one room deeper. */
function rollRooms(seed: number, tier: number): { rooms: RoomKind[]; seed: number } {
  const extra = tier >= 3 ? 1 : 0;
  const countRoll = randInt(seed, DUNGEON_ROOMS_MIN + extra, DUNGEON_ROOMS_MAX + extra);
  let s = countRoll.seed;
  const kinds: RoomKind[] = ["fight", "fight", "treasure", "event"];
  const rooms: RoomKind[] = [];
  for (let i = 0; i < countRoll.value; i++) {
    const pick = randInt(s, 0, kinds.length - 1);
    s = pick.seed;
    rooms.push(kinds[pick.value]);
  }
  rooms.push("boss");
  return { rooms, seed: s };
}

/** Shared setup for any delve — settlement dungeon or world ruin. */
function beginDelve(
  state: GameState,
  name: string,
  tier: number,
  siteId: string | null,
  introText: string,
): GameState {
  const rolled = rollRooms(state.rngSeed, tier);
  const dungeon: DungeonState = {
    depth: 0,
    rooms: rolled.rooms,
    roomResolved: false,
    mustLeave: false,
    lootGold: 0,
    name,
    tier,
    siteId,
  };
  const next = pushLog(
    { ...state, rngSeed: rolled.seed, dungeon },
    { text: introText, tone: "neutral" },
  );
  return pressOn(next);
}

/** Enter the local settlement's dungeon: each town keeps its own. */
export function enterDungeon(state: GameState): GameState {
  if (state.dungeon) return state;
  const settlement = state.map.settlements.find((s) => s.id === state.location.settlementId);
  const name = settlement ? dungeonNameFor(settlement) : "the Old Barrow";
  const tier = settlement ? KIND_TIER[settlement.kind] : 1;
  return beginDelve(
    state,
    name,
    tier,
    null,
    `You duck into ${name}, torch in hand.`,
  );
}

/** Enter a world-map ruin (from the map, standing on its hex). */
export function enterSite(state: GameState): GameState {
  if (state.dungeon) return state;
  const here = state.location.hex;
  const site = state.map.sites.find((s) => s.hex.q === here.q && s.hex.r === here.r);
  if (!site) return state;
  return beginDelve(
    state,
    site.name,
    SITE_TIER,
    site.id,
    `You step into ${site.name}. The dark inside is older than any barrow's.`,
  );
}

/** Pick a depth- and tier-appropriate non-boss foe. Ruin-tier delves can pull
 *  from the elite pool once you're deep. */
function pickFightEnemy(seed: number, depth: number, tier: number) {
  const table =
    tier >= SITE_TIER && depth >= 3
      ? [...DUNGEON_ENCOUNTER_TABLE, ...TOUGH_ENEMIES]
      : DUNGEON_ENCOUNTER_TABLE;
  // Higher tiers unlock the table's deeper entries a room sooner.
  const tierTop = Math.min(table.length, Math.max(1, tier - 1) + Math.ceil(depth / 2));
  const pick = randInt(seed, 0, tierTop - 1);
  return { enemy: ENEMIES[table[pick.value]], seed: pick.seed };
}

/** Advance into the next room and resolve it (fights start combat). */
export function pressOn(state: GameState): GameState {
  const dungeon = state.dungeon;
  if (!dungeon || dungeon.mustLeave) return state;
  if (dungeon.roomResolved === false && dungeon.depth > 0) return state; // still mid-room
  if (dungeon.depth >= dungeon.rooms.length) return state; // nothing left to press into

  const depth = dungeon.depth + 1;
  const kind = dungeon.rooms[depth - 1];
  let next: GameState = { ...state, dungeon: { ...dungeon, depth, roomResolved: false } };

  if (kind === "fight" || kind === "boss") {
    let picked;
    if (kind === "boss") {
      if (dungeon.tier >= SITE_TIER) {
        // A ruin's guardian could be any of the great terrors.
        const pool = [DUNGEON_BOSS, "hill_troll", "brigand_captain"];
        const roll = randInt(next.rngSeed, 0, pool.length - 1);
        picked = { enemy: ENEMIES[pool[roll.value]], seed: roll.seed };
      } else {
        picked = { enemy: ENEMIES[DUNGEON_BOSS], seed: next.rngSeed };
      }
    } else {
      picked = pickFightEnemy(next.rngSeed, depth, dungeon.tier);
    }
    next = { ...next, rngSeed: picked.seed };
    if (kind === "boss") {
      next = pushLog(next, {
        text: "The passage opens into a wide chamber — this delve's guardian awaits.",
        tone: "bad",
      });
    }
    return startCombat(next, picked.enemy);
  }

  if (kind === "treasure") {
    const goldRoll = randInt(next.rngSeed, DUNGEON_TREASURE_MIN, DUNGEON_TREASURE_MAX);
    const gold = Math.round(goldRoll.value * tierGoldFactor(dungeon.tier));
    next = {
      ...next,
      rngSeed: goldRoll.seed,
      character: { ...next.character, gold: next.character.gold + gold },
      dungeon: {
        ...next.dungeon!,
        roomResolved: true,
        lootGold: next.dungeon!.lootGold + gold,
      },
    };
    return pushLog(next, {
      text: `A cracked chest yields ${gold} gold.`,
      tone: "good",
    });
  }

  // "event": a coin flip between a healing shrine and a trap, with an Agility
  // check to dodge the latter.
  const eventRoll = chance(next.rngSeed, 0.5);
  next = { ...next, rngSeed: eventRoll.seed };
  if (eventRoll.value) {
    const healed = Math.min(next.character.maxHp, next.character.hp + DUNGEON_EVENT_HEAL);
    const gained = healed - next.character.hp;
    next = {
      ...next,
      character: { ...next.character, hp: healed },
      dungeon: { ...next.dungeon!, roomResolved: true },
    };
    return pushLog(next, {
      text: `A moss-grown shrine still holds some grace. You recover ${gained} health.`,
      tone: "good",
    });
  }

  const dodgeChance =
    DUNGEON_TRAP_DODGE_BASE + effectiveAttributes(next.character).AGI * DUNGEON_TRAP_DODGE_AGI;
  const dodgeRoll = chance(next.rngSeed, dodgeChance / 100);
  next = { ...next, rngSeed: dodgeRoll.seed };
  if (dodgeRoll.value) {
    next = { ...next, dungeon: { ...next.dungeon!, roomResolved: true } };
    return pushLog(next, {
      text: "A tripwire snaps taut — you feel it against your shin and freeze just in time.",
      tone: "neutral",
    });
  }

  const dmgRoll = randInt(next.rngSeed, DUNGEON_TRAP_DMG_MIN, DUNGEON_TRAP_DMG_MAX);
  next = {
    ...next,
    rngSeed: dmgRoll.seed,
    character: { ...next.character, hp: Math.max(0, next.character.hp - dmgRoll.value) },
    dungeon: { ...next.dungeon!, roomResolved: true },
  };
  return pushLog(next, {
    text: `A dart trap springs from the wall — you take ${dmgRoll.value} damage.`,
    tone: "bad",
  });
}

/**
 * First-clear reward for a world ruin (called on the boss-won path): mark the
 * site cleared, then grant — in order of wonder — an unlearned spell's tome, a
 * magic weapon you don't own, or a heavy purse. Repeat clears grant nothing
 * extra (the tier-scaled ordinary loot is still worth the trip).
 */
function claimSiteReward(state: GameState, siteId: string): GameState {
  const site = state.map.sites.find((s) => s.id === siteId);
  if (!site || site.cleared) return state;

  const sites = state.map.sites.map((s) => (s.id === siteId ? { ...s, cleared: true } : s));
  let next: GameState = { ...state, map: { ...state.map, sites } };

  // A tome, if there's anything left to learn.
  const unlearned = unknownSpells(next.character);
  if (unlearned.length > 0) {
    const pick = randInt(next.rngSeed, 0, unlearned.length - 1);
    const spell = unlearned[pick.value];
    next = {
      ...next,
      rngSeed: pick.seed,
      character: {
        ...next.character,
        knownSpells: [...next.character.knownSpells, spell.id],
      },
    };
    return pushLog(next, {
      text: `Among the guardian's hoard lies a worn tome. You study it by torchlight — you learn ${SPELLS[spell.id].name}!`,
      tone: "good",
    });
  }

  // A magic weapon, if one remains unclaimed.
  const unowned = MAGIC_WEAPONS.filter((id) => !next.character.ownedWeapons.includes(id));
  if (unowned.length > 0) {
    const pick = randInt(next.rngSeed, 0, unowned.length - 1);
    const weaponId = unowned[pick.value];
    next = {
      ...next,
      rngSeed: pick.seed,
      character: {
        ...next.character,
        ownedWeapons: [...next.character.ownedWeapons, weaponId],
      },
    };
    return pushLog(next, {
      text: `Set upon an altar of black stone: ${WEAPONS[weaponId].name}. It hums faintly as you take it.`,
      tone: "good",
    });
  }

  // Nothing left to teach or bestow — the ruin pays in coin instead.
  const goldRoll = randInt(next.rngSeed, SITE_CLEAR_GOLD_MIN, SITE_CLEAR_GOLD_MAX);
  next = {
    ...next,
    rngSeed: goldRoll.seed,
    character: { ...next.character, gold: next.character.gold + goldRoll.value },
  };
  return pushLog(next, {
    text: `The deepest vault holds a hoard of old coin — ${goldRoll.value} gold, yours now.`,
    tone: "good",
  });
}

/** Leave the delve: narrate the haul and spend the turn (shop-visit pattern). */
export function leaveDungeon(state: GameState): GameState {
  if (!state.dungeon) return state;
  const loot = state.dungeon.lootGold;
  const lootText = loot > 0 ? ` You carry out ${loot} gold in plunder.` : "";
  const next = pushLog(
    { ...state, dungeon: null },
    { text: `You climb back into the daylight, glad of it.${lootText}`, tone: "neutral" },
  );
  return next;
}

/**
 * Called by the engine when a fight inside the dungeon finishes. Decides what
 * the outcome means for the delve: press on, forced retreat, or a full exit.
 */
export function dungeonCombatOutcome(state: GameState): GameState {
  const dungeon = state.dungeon;
  const combat = state.combat;
  if (!dungeon || !combat || !combat.over) return state;

  const isBoss = dungeon.rooms[dungeon.depth - 1] === "boss";

  if (combat.outcome === "won" && isBoss) {
    const bonusRoll = randInt(state.rngSeed, BOSS_BONUS_GOLD_MIN, BOSS_BONUS_GOLD_MAX);
    const bonus = Math.round(bonusRoll.value * tierGoldFactor(dungeon.tier));
    let next: GameState = {
      ...state,
      rngSeed: bonusRoll.seed,
      character: {
        ...state.character,
        gold: state.character.gold + bonus,
        skillPoints: state.character.skillPoints + BOSS_SKILL_POINTS,
      },
    };
    next = pushLog(next, {
      text: `The guardian of ${dungeon.name} falls still. You claim ${bonus} bonus gold and feel sharper for the trial — +${BOSS_SKILL_POINTS} skill point.`,
      tone: "good",
    });
    if (dungeon.siteId) next = claimSiteReward(next, dungeon.siteId);
    return leaveDungeon(next);
  }

  if (combat.outcome === "won") {
    return { ...state, dungeon: { ...dungeon, roomResolved: true } };
  }

  if (combat.outcome === "fled") {
    return { ...state, dungeon: { ...dungeon, roomResolved: true, mustLeave: true } };
  }

  // "beaten" — thrown out with whatever penalties combat.ts already applied.
  return leaveDungeon(state);
}
