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

import {
  BRIBE_BASE,
  BRIBE_XP_SCALE,
  FAST_TRAVEL_GOLD_PER_HEX,
  FOG_REVEAL_RADIUS,
  HORSE_FAST_TRAVEL_FACTOR,
  HORSE_FLEE_BONUS,
  SAIL_BASE_GOLD,
  SAIL_GOLD_PER_HEX,
  TRAVEL_TIERS,
} from "./config";
import { fleeChance, startCombat } from "./combat";
import { ENEMIES, maybeToughUpgrade, rollPack } from "./enemies";
import { horseSpeedOf } from "./equipment";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import {
  hexDistance,
  hexKey,
  hexNeighbors,
  isLichIsland,
  isRoad,
  isWater,
  nearestSettlementDistance,
  portAt,
  siteAt,
} from "./worldmap";
import type { EnemyDef, GameState, HexCoord } from "./types";

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
 * Bounded BFS over land from the character's hex, out to `maxSteps`. Returns
 * a came-from map keyed by hexKey, so callers can both list what's reachable
 * this turn and reconstruct the path ridden to any of it.
 */
function landRoutes(
  state: GameState,
  maxSteps: number,
): Map<string, { from: string | null; depth: number }> {
  const start = state.location.hex;
  const routes = new Map<string, { from: string | null; depth: number }>([
    [hexKey(start), { from: null, depth: 0 }],
  ]);
  let frontier: HexCoord[] = [start];
  for (let step = 1; step <= maxSteps; step++) {
    const next: HexCoord[] = [];
    for (const cur of frontier) {
      for (const n of hexNeighbors(cur)) {
        const k = hexKey(n);
        if (routes.has(k)) continue;
        if (state.map.terrain[k] === undefined || isWater(state.map, n)) continue;
        routes.set(k, { from: hexKey(cur), depth: step });
        next.push(n);
      }
    }
    frontier = next;
  }
  return routes;
}

/** Every hex one world-map turn can reach from here — 1 step afoot, more when
 *  mounted (equipment.ts HORSES). Drives both moveTo and the map UI. */
export function reachableHexes(state: GameState): HexCoord[] {
  const routes = landRoutes(state, horseSpeedOf(state.character.horse));
  const startKey = hexKey(state.location.hex);
  return [...routes.keys()]
    .filter((k) => k !== startKey)
    .map((k) => {
      const [q, r] = k.split(",").map(Number);
      return { q, r };
    });
}

/**
 * Move to a reachable hex (adjacent afoot; farther on horseback). `spendTurn`
 * tells the caller whether to advance the clock: false for an illegal click
 * (nothing happened) or when a hostile encounter interrupts the journey (the
 * turn is spent once that's resolved, matching how a hamlet action's encounter
 * defers the clock until the fight concludes); true for a clean arrival.
 */
export function moveTo(
  state: GameState,
  hex: HexCoord,
): { state: GameState; spendTurn: boolean } {
  if (!state.mapOpen || state.roadEncounter || state.townPrompt) return { state, spendTurn: false };
  const routes = landRoutes(state, horseSpeedOf(state.character.horse));
  const route = routes.get(hexKey(hex));
  if (!route || route.depth === 0) return { state, spendTurn: false };

  // Reveal every hex ridden through, not just the destination.
  let discovered = state.discovered;
  for (let k: string | null = hexKey(hex); k !== null; k = routes.get(k)?.from ?? null) {
    const [q, r] = k.split(",").map(Number);
    discovered = reveal(discovered, { q, r });
  }
  const settlement = state.map.settlements.find((s) => s.hex.q === hex.q && s.hex.r === hex.r);
  // Reaching a settlement's hex puts you before its gates, not inside them —
  // entering is a choice (engine.enterTown), and until made you're outside.
  let next: GameState = {
    ...state,
    discovered,
    location: { hex, settlementId: null },
  };

  // Roads (and settlement hexes) are safe — no encounter roll at all. So is
  // the lich's island: nothing there hunts without its master's word.
  const safe = isRoad(state.map, hex) || !!settlement || isLichIsland(state.map, hex);
  const dist = nearestSettlementDistance(state.map, hex);
  const tier = tierForDistance(dist);
  const roll = safe ? { value: false, seed: next.rngSeed } : chance(next.rngSeed, TRAVEL_TIERS[tier].chance);
  next = { ...next, rngSeed: roll.seed };

  if (roll.value) {
    const pool = TRAVEL_TIER_ENEMIES[tier];
    const pick = randInt(next.rngSeed, 0, pool.length - 1);
    let enemy = ENEMIES[pool[pick.value]];
    // Rarely, the wilds produce something well above the local tier.
    const tough = maybeToughUpgrade(pick.seed);
    if (tough.enemy) enemy = tough.enemy;
    next = { ...next, rngSeed: tough.seed, roadEncounter: { enemy, tier } };
    return { state: next, spendTurn: false }; // spent once the encounter is resolved
  }

  if (settlement) {
    next = { ...next, townPrompt: settlement.id };
    next = pushLog(next, {
      text: `You stand before the gates of ${settlement.name}.`,
      tone: "neutral",
    });
  } else {
    const site = siteAt(next.map, hex);
    const port = portAt(next.map, hex);
    if (site) {
      next = pushLog(next, {
        text: site.cleared
          ? `You stand again before ${site.name}, silent since you emptied it.`
          : `Ancient stonework rises from the wilds — you've found ${site.name}. It could be explored…`,
        tone: site.cleared ? "neutral" : "good",
      });
    } else if (port) {
      next = pushLog(next, {
        text: `You reach ${port.name}. Boats here can carry you to any other port — for a fare.`,
        tone: "good",
      });
    } else if (isLichIsland(next.map, hex)) {
      next = pushLog(next, {
        text: "The island is utterly silent — no birds, no wind, no ambush. Everything here waits on one will.",
        tone: "neutral",
      });
    } else {
      next = pushLog(next, { text: "You press on along the road.", tone: "neutral" });
    }
  }
  return { state: next, spendTurn: true };
}

// --- Waypoint fast travel ----------------------------------------------------
// Every settlement whose gates you've passed becomes a waypoint
// (state.waypoints, unlocked in engine.enterTown). From any waypoint you can
// pay a carter to carry you straight to another — no encounter rolls, one
// turn, gold per hex of distance (cheaper with your own horse).

/** The carter's fee to fast-travel between two settlements. */
export function fastTravelCost(state: GameState, fromId: string, toId: string): number {
  const from = state.map.settlements.find((s) => s.id === fromId);
  const to = state.map.settlements.find((s) => s.id === toId);
  if (!from || !to) return Infinity;
  const factor = state.character.horse ? HORSE_FAST_TRAVEL_FACTOR : 1;
  return Math.max(1, Math.round(hexDistance(from.hex, to.hex) * FAST_TRAVEL_GOLD_PER_HEX * factor));
}

/** The settlement the character could fast-travel FROM right now: they must be
 *  standing on a waypoint settlement's hex (inside or at its gates). */
export function fastTravelOrigin(state: GameState): string | null {
  const here = state.location.hex;
  const s = state.map.settlements.find((st) => st.hex.q === here.q && st.hex.r === here.r);
  if (!s || !state.waypoints.includes(s.id)) return null;
  return s.id;
}

/**
 * Ride a carter's wagon from the waypoint underfoot to another unlocked one.
 * Safe by design (carters keep to the roads in convoy — no encounter roll);
 * costs fastTravelCost gold and, per the caller, one turn. Arrives INSIDE the
 * destination's gates, map closed, like enterTown.
 */
export function fastTravelTo(
  state: GameState,
  settlementId: string,
): { state: GameState; spendTurn: boolean } {
  if (state.roadEncounter || state.townPrompt || state.combat) return { state, spendTurn: false };
  const fromId = fastTravelOrigin(state);
  const to = state.map.settlements.find((s) => s.id === settlementId);
  if (!fromId || !to || fromId === settlementId) return { state, spendTurn: false };
  if (!state.waypoints.includes(settlementId)) return { state, spendTurn: false };
  const cost = fastTravelCost(state, fromId, settlementId);
  if (state.character.gold < cost) return { state, spendTurn: false };

  let next: GameState = {
    ...state,
    character: { ...state.character, gold: state.character.gold - cost },
    discovered: reveal(state.discovered, to.hex),
    location: { hex: to.hex, settlementId: to.id },
    mapOpen: false,
  };
  next = pushLog(next, {
    text: `A carter's wagon carries you the long road to ${to.name} for ${cost} gold.`,
    tone: "neutral",
  });
  return { state: next, spendTurn: true };
}

// --- Sailing between ports -----------------------------------------------------
// The sea is not fast travel: no waypoint unlocking is needed (every sailor
// carries the same charts), but only a port hex offers a boat, and only
// another port receives one. This is the sole way onto the lich's island.

/** The boat fare between two ports (config SAIL_*). Horses wait ashore.
 *  Leaving the lich's island is always free — the boatman was paid for both
 *  crossings, so a beaten, penniless challenger is never stranded there. */
export function sailCost(state: GameState, fromId: string, toId: string): number {
  const from = state.map.ports.find((p) => p.id === fromId);
  const to = state.map.ports.find((p) => p.id === toId);
  if (!from || !to) return Infinity;
  if (fromId === "port_island") return 0;
  return SAIL_BASE_GOLD + hexDistance(from.hex, to.hex) * SAIL_GOLD_PER_HEX;
}

/** The port the character could sail FROM right now (they stand on its hex). */
export function sailOrigin(state: GameState): string | null {
  return portAt(state.map, state.location.hex)?.id ?? null;
}

/**
 * Take a boat from the port underfoot to another. Sea passage is safe (no
 * encounter roll) and costs sailCost gold plus, per the caller, one turn.
 * Arrival reveals the destination's surroundings; the map stays open — you
 * step off onto a dock, not through anyone's gates.
 */
export function sailTo(
  state: GameState,
  portId: string,
): { state: GameState; spendTurn: boolean } {
  if (state.roadEncounter || state.townPrompt || state.combat) return { state, spendTurn: false };
  const fromId = sailOrigin(state);
  const to = state.map.ports.find((p) => p.id === portId);
  if (!fromId || !to || fromId === portId) return { state, spendTurn: false };
  const cost = sailCost(state, fromId, portId);
  if (state.character.gold < cost) return { state, spendTurn: false };

  let next: GameState = {
    ...state,
    character: { ...state.character, gold: state.character.gold - cost },
    discovered: reveal(state.discovered, to.hex),
    location: { hex: to.hex, settlementId: null },
  };
  next = pushLog(next, {
    text:
      to.id === "port_island"
        ? `For ${cost} gold, a grim-faced boatman rows you across grey water to ${to.name}. He will not stay past dusk.`
        : cost === 0
          ? `The boatman rows you back to ${to.name} without a word — that passage was paid for on the way out.`
          : `You pay ${cost} gold for passage and sail into ${to.name}.`,
    tone: "neutral",
  });
  return { state: next, spendTurn: true };
}

/**
 * Roll the foe (or pack) that finds a camp made outside any settlement —
 * used by engine.sleep for the sleeping-rough ambush. Danger scales with
 * distance from safety, same tiers as daytime travel.
 */
export function rollAmbush(state: GameState): { defs: EnemyDef[]; seed: number } {
  const dist = nearestSettlementDistance(state.map, state.location.hex);
  const tier = tierForDistance(dist);
  const pool = TRAVEL_TIER_ENEMIES[tier];
  const pick = randInt(state.rngSeed, 0, pool.length - 1);
  let enemy = ENEMIES[pool[pick.value]];
  const tough = maybeToughUpgrade(pick.seed);
  if (tough.enemy) enemy = tough.enemy;
  const pack = rollPack(enemy, tough.seed);
  return { defs: pack.defs, seed: pack.seed };
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
    // What you saw on the road may be the front of a pack (enemies.ts).
    const pack = rollPack(encounter.enemy, cleared.rngSeed);
    const armed = { ...cleared, rngSeed: pack.seed };
    return { state: startCombat(armed, pack.defs), spendTurn: false };
  }

  if (choice === "flee") {
    // A mounted traveler outruns most road trouble (config.HORSE_FLEE_BONUS).
    const pct = Math.min(
      95,
      fleeChance(cleared.character, encounter.enemy) +
        (cleared.character.horse ? HORSE_FLEE_BONUS : 0),
    );
    const roll = chance(cleared.rngSeed, pct / 100);
    let next: GameState = { ...cleared, rngSeed: roll.seed };
    if (roll.value) {
      next = pushLog(next, {
        text: cleared.character.horse
          ? `You spur your horse and leave the ${encounter.enemy.name} behind.`
          : `You slip past the ${encounter.enemy.name} and hurry on.`,
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

  // bribe — only a human foe has any use for your coin (the UI hides the
  // option for beasts and the dead; this guard keeps the rule honest).
  if (!encounter.enemy.human) return { state, spendTurn: false };
  const cost = bribeCost(encounter.enemy.xp);
  if (cleared.character.gold < cost) return { state, spendTurn: false }; // UI should already disable this
  const character = { ...cleared.character, gold: cleared.character.gold - cost };
  const next = pushLog(
    { ...cleared, character },
    { text: `You toss ${cost} gold at the ${encounter.enemy.name}'s feet and it lets you pass.`, tone: "neutral" },
  );
  return { state: next, spendTurn: true };
}
