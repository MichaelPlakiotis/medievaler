// ---------------------------------------------------------------------------
// travel.ts — leaving a settlement and crossing the regional hex map (the
// "bigger world" arc, Milestone A). Mirrors dungeon.ts's shape: pure
// GameState → GameState functions, all randomness through state.rngSeed.
//
// Opening the map is free (shop-visit pattern). Moving to a neighboring hex
// costs a turn, reveals fog around the destination, and may roll a hostile
// encounter scaled by distance from the nearest settlement — which pauses on
// a Fight / Flee / Bribe choice (roadEncounter) rather than jumping straight
// into combat, unlike an ordinary hamlet encounter.
//
// moveTo/resolveRoadEncounter report whether a turn should be spent instead
// of calling engine.ts's advanceClock directly — engine.ts imports this
// module, so calling back into it here would be circular. The engine.ts
// wrappers (travelTo/resolveRoadEncounter) apply advanceClock when told to,
// exactly like crime.ts's resolveCrime reporting `{ state, jailed }`.
// ---------------------------------------------------------------------------

import { BRIBE_BASE, BRIBE_XP_SCALE, FOG_REVEAL_RADIUS, TRAVEL_TIERS } from "./config";
import { fleeChance, startCombat } from "./combat";
import { ENEMIES } from "./enemies";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import { hexKey, hexNeighbors, nearestSettlementDistance } from "./worldmap";
import type { GameState, HexCoord } from "./types";

/** Enemy pools per travel tier, index-aligned with config.TRAVEL_TIERS. Reuses
 *  the existing bestiary (surface + barrow) rather than a new one — the
 *  barrow's boss (barrow_wight) is deliberately excluded, kept special to the
 *  dungeon. */
const TRAVEL_TIER_ENEMIES: string[][] = [
  ["stray_dog", "giant_rat", "drunkard"],
  ["boar", "wolf", "cutpurse"],
  ["tomb_bandit", "crypt_spider", "barrow_skeleton"],
];

function tierForDistance(dist: number): number {
  const idx = TRAVEL_TIERS.findIndex((t) => dist <= t.upTo);
  return idx < 0 ? TRAVEL_TIERS.length - 1 : idx;
}

/** Gold cost to buy off a road encounter outright — scales with the foe's XP,
 *  same "derive from existing fields" approach as crime.ts/dungeon.ts. */
export function bribeCost(enemyXp: number): number {
  return Math.round(BRIBE_BASE + enemyXp * BRIBE_XP_SCALE);
}

/** Open the hex map. Free — like stepping into the shop. */
export function openMap(state: GameState): GameState {
  if (state.mapOpen) return state;
  return { ...state, mapOpen: true };
}

/** Close the hex map without moving. Also free. */
export function closeMap(state: GameState): GameState {
  if (!state.mapOpen) return state;
  return { ...state, mapOpen: false };
}

/** Reveal a hex and everything within FOG_REVEAL_RADIUS of it. */
function reveal(discovered: string[], hex: HexCoord): string[] {
  const set = new Set(discovered);
  set.add(hexKey(hex));
  if (FOG_REVEAL_RADIUS >= 1) {
    for (const n of hexNeighbors(hex)) set.add(hexKey(n));
  }
  return [...set];
}

/**
 * Move to an adjacent hex. `spendTurn` tells the caller whether to advance
 * the clock: false for an illegal click (nothing happened) or when a hostile
 * encounter interrupts the journey (the turn is spent once that's resolved,
 * matching how a hamlet action's encounter defers the clock until the fight
 * concludes); true for a clean arrival.
 */
export function moveTo(
  state: GameState,
  hex: HexCoord,
): { state: GameState; spendTurn: boolean } {
  if (!state.mapOpen || state.roadEncounter) return { state, spendTurn: false };
  const isNeighbor = hexNeighbors(state.location.hex).some((n) => n.q === hex.q && n.r === hex.r);
  if (!isNeighbor) return { state, spendTurn: false };

  const discovered = reveal(state.discovered, hex);
  const settlement = state.map.settlements.find((s) => s.hex.q === hex.q && s.hex.r === hex.r);
  let next: GameState = {
    ...state,
    discovered,
    location: { hex, settlementId: settlement?.id ?? null },
  };

  const dist = nearestSettlementDistance(state.map, hex);
  const tier = tierForDistance(dist);
  const roll = chance(next.rngSeed, TRAVEL_TIERS[tier].chance);
  next = { ...next, rngSeed: roll.seed };

  if (roll.value) {
    const pool = TRAVEL_TIER_ENEMIES[tier];
    const pick = randInt(next.rngSeed, 0, pool.length - 1);
    next = { ...next, rngSeed: pick.seed, roadEncounter: { enemy: ENEMIES[pool[pick.value]], tier } };
    return { state: next, spendTurn: false }; // spent once the encounter is resolved
  }

  if (settlement) {
    next = { ...next, mapOpen: false };
    next = pushLog(next, { text: `You arrive at ${settlement.name}.`, tone: "good" });
  } else {
    next = pushLog(next, { text: "You press on along the road.", tone: "neutral" });
  }
  return { state: next, spendTurn: true };
}

/**
 * Fight, flee, or bribe your way past a pending road encounter. `spendTurn`
 * is true only when the encounter resolved outright without a fight (a
 * successful flee or a paid bribe) — choosing to fight, or failing to flee,
 * hands off to combat, whose own finishCombat spends the turn once it ends.
 */
export function resolveRoadEncounter(
  state: GameState,
  choice: "fight" | "flee" | "bribe",
): { state: GameState; spendTurn: boolean } {
  const encounter = state.roadEncounter;
  if (!encounter) return { state, spendTurn: false };
  const cleared: GameState = { ...state, roadEncounter: null };

  if (choice === "fight") {
    return { state: startCombat(cleared, encounter.enemy), spendTurn: false };
  }

  if (choice === "flee") {
    const roll = chance(cleared.rngSeed, fleeChance(cleared.character, encounter.enemy) / 100);
    let next: GameState = { ...cleared, rngSeed: roll.seed };
    if (roll.value) {
      next = pushLog(next, {
        text: `You slip past the ${encounter.enemy.name} and hurry on.`,
        tone: "good",
      });
      return { state: next, spendTurn: true };
    }
    next = pushLog(next, {
      text: `You can't shake the ${encounter.enemy.name} — it closes in.`,
      tone: "bad",
    });
    return { state: startCombat(next, encounter.enemy), spendTurn: false };
  }

  // bribe
  const cost = bribeCost(encounter.enemy.xp);
  if (cleared.character.gold < cost) return { state, spendTurn: false }; // UI should already disable this
  const character = { ...cleared.character, gold: cleared.character.gold - cost };
  const next = pushLog(
    { ...cleared, character },
    { text: `You toss ${cost} gold at the ${encounter.enemy.name}'s feet and it lets you pass.`, tone: "neutral" },
  );
  return { state: next, spendTurn: true };
}
