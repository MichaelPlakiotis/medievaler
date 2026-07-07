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
  DUNGEON_TRAP_DMG_MAX,
  DUNGEON_TRAP_DMG_MIN,
  DUNGEON_TRAP_DODGE_AGI,
  DUNGEON_TRAP_DODGE_BASE,
  DUNGEON_TREASURE_MAX,
  DUNGEON_TREASURE_MIN,
} from "./config";
import { DUNGEON_BOSS, DUNGEON_ENCOUNTER_TABLE, ENEMIES } from "./enemies";
import { startCombat } from "./combat";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import type { DungeonState, GameState, RoomKind } from "./types";

/** Roll a room chain: DUNGEON_ROOMS_MIN..MAX ordinary rooms, then a boss. */
function rollRooms(seed: number): { rooms: RoomKind[]; seed: number } {
  const countRoll = randInt(seed, DUNGEON_ROOMS_MIN, DUNGEON_ROOMS_MAX);
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

/** Enter the barrow: roll the delve's rooms and step into the first one. */
export function enterDungeon(state: GameState): GameState {
  if (state.dungeon) return state;
  const rolled = rollRooms(state.rngSeed);
  const dungeon: DungeonState = {
    depth: 0,
    rooms: rolled.rooms,
    roomResolved: false,
    mustLeave: false,
    lootGold: 0,
  };
  const next = pushLog(
    { ...state, rngSeed: rolled.seed, dungeon },
    { text: "You duck under the barrow's cracked lintel, torch in hand.", tone: "neutral" },
  );
  return pressOn(next);
}

/** Pick a depth-appropriate non-boss foe. */
function pickFightEnemy(seed: number, depth: number) {
  const tierTop = Math.min(DUNGEON_ENCOUNTER_TABLE.length, 1 + Math.ceil(depth / 2));
  const pick = randInt(seed, 0, tierTop - 1);
  return { enemy: ENEMIES[DUNGEON_ENCOUNTER_TABLE[pick.value]], seed: pick.seed };
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
    const picked =
      kind === "boss"
        ? { enemy: ENEMIES[DUNGEON_BOSS], seed: next.rngSeed }
        : pickFightEnemy(next.rngSeed, depth);
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
    next = {
      ...next,
      rngSeed: goldRoll.seed,
      character: { ...next.character, gold: next.character.gold + goldRoll.value },
      dungeon: {
        ...next.dungeon!,
        roomResolved: true,
        lootGold: next.dungeon!.lootGold + goldRoll.value,
      },
    };
    return pushLog(next, {
      text: `A cracked chest yields ${goldRoll.value} gold.`,
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
    DUNGEON_TRAP_DODGE_BASE + next.character.attributes.AGI * DUNGEON_TRAP_DODGE_AGI;
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
    let next: GameState = {
      ...state,
      rngSeed: bonusRoll.seed,
      character: {
        ...state.character,
        gold: state.character.gold + bonusRoll.value,
        skillPoints: state.character.skillPoints + BOSS_SKILL_POINTS,
      },
    };
    next = pushLog(next, {
      text: `The barrow's guardian falls still. You claim ${bonusRoll.value} bonus gold and feel sharper for the trial — +${BOSS_SKILL_POINTS} skill point.`,
      tone: "good",
    });
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
