// ---------------------------------------------------------------------------
// engine.ts — the loop that ties turns, days, and nights together (GDD §2).
//
// The engine never touches the screen. The UI calls these functions and re-
// renders from whatever GameState comes back. Keeping it this way means the
// rules are all in one testable place.
//
// The turn flow:
//   takeAction()  — play one action, advance the turn counter.
//                   When the last turn of a DAY is used, we set awaitingRest.
//   sleep()       — end the day, roll for a night mishap, advance to next day.
//   stayUp()      — instead of sleeping, begin a 4-turn NIGHT phase.
//   (night turns also run through takeAction; the last one forces sleep.)
// ---------------------------------------------------------------------------

import {
  NIGHT_TURNS,
  TURNS_PER_DAY,
  FATIGUE_PENALTY,
  SAVE_VERSION,
  OLD_AGE_START,
  NATURAL_DEATH_PER_YEAR,
} from "./config";
import { ageOf, createCharacter } from "./character";
import { resolveAction } from "./actions";
import { maybeEncounter } from "./enemies";
import { startCombat } from "./combat";
import { CRIMES, resolveCrime } from "./crime";
import { COURT_ACTIONS, resolveFamilyAction } from "./family";
import { CITY_ACTIONS, resolveCityAction } from "./amenities";
import { dungeonCombatOutcome, enterDungeon, leaveDungeon as exitDungeon } from "./dungeon";
import {
  moveTo as moveToPure,
  openMap,
  resolveRoadEncounter as resolveRoadEncounterPure,
} from "./travel";
import { generateWorldMap, hexKey, hexNeighbors, settlementOf } from "./worldmap";
import { die } from "./succession";
import { hostileEncounterBonus, sleepRobberyChance } from "./reputation";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import type { Attributes, Gender, GameState, HexCoord, LogLine } from "./types";

/** Start a brand-new run from a character-creation allocation. */
export function newGame(
  name: string,
  allocation: Attributes,
  seed?: number,
  gender: Gender = "male",
): GameState {
  const character = createCharacter(name, allocation, gender);
  const startSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const generated = generateWorldMap(startSeed);
  const hamletHex: HexCoord = { q: 0, r: 0 };
  const discovered = [hamletHex, ...hexNeighbors(hamletHex)].map(hexKey);

  const base: GameState = {
    character,
    day: 1,
    turn: 1,
    phase: "day",
    awaitingRest: false,
    fatigue: 0,
    rngSeed: generated.seed,
    combat: null,
    shopOpen: false,
    dungeon: null,
    map: generated.map,
    discovered,
    location: { hex: hamletHex, settlementId: "hamlet" },
    mapOpen: false,
    roadEncounter: null,
    pendingSuccession: null,
    deathCause: null,
    dead: false,
    log: [],
    version: SAVE_VERSION,
  };
  return pushLog(base, {
    text: `${character.name}, ${character.ageYears}, arrives in the hamlet with ${character.gold} coins and no name worth knowing. Yet.`,
    tone: "neutral",
  });
}

/** How many turns the current phase has. */
function turnsInPhase(state: GameState): number {
  return state.phase === "day" ? TURNS_PER_DAY : NIGHT_TURNS;
}

/**
 * Advance the game clock by one turn's worth of time. Called after an action
 * fully resolves (including after a fight it triggered). If this was the final
 * turn of the DAY, we flip awaitingRest on so the UI shows the Sleep/Stay-Up
 * choice. If it was the final turn of the NIGHT, the player is forced to sleep.
 */
export function advanceClock(state: GameState): GameState {
  const lastTurn = turnsInPhase(state) === state.turn;
  if (!lastTurn) {
    return { ...state, turn: state.turn + 1 };
  }

  if (state.phase === "night") {
    const next = pushLog(state, { text: "Dawn creeps in. You can go no longer.", tone: "neutral" });
    return sleep(next);
  }

  // End of a normal day: the rest decision is now due.
  return { ...state, awaitingRest: true };
}

/**
 * Play one action. First we roll for an encounter (GDD §4/§5): if a fight
 * breaks out, we enter combat and the clock does NOT advance yet — it advances
 * when the fight is finished (see finishCombat). Otherwise the action resolves
 * normally and the clock ticks immediately.
 */
export function takeAction(state: GameState, actionId: string): GameState {
  if (
    state.awaitingRest ||
    state.combat ||
    state.shopOpen ||
    state.dungeon ||
    state.mapOpen ||
    state.roadEncounter ||
    state.pendingSuccession ||
    state.dead
  ) {
    return state;
  }

  // Visiting the shop opens a browsing mode; the turn isn't spent until you
  // leave (GDD §5.1). See openShop / closeShop below.
  if (actionId === "shop") return openShop(state);

  // Delving the barrow (M9) opens its own mode; the turn is spent on exit,
  // same shape as the shop — see dungeon.ts.
  if (actionId === "delve") return enterDungeon(state);

  // Taking to the road opens the hex map; browsing it is free, same shape as
  // the shop — see travel.ts. Actual movement is travelTo() below.
  if (actionId === "travel") return openMap(state);

  // Courtship, marriage, and children (GDD §7.3) — each spends the turn.
  if (COURT_ACTIONS.includes(actionId)) {
    return advanceClock(resolveFamilyAction(state, actionId));
  }

  // Bigger-city amenities (university, brothel) — city-only, each spends the
  // turn immediately; no random encounter, same as courting.
  if (CITY_ACTIONS.includes(actionId)) {
    return advanceClock(resolveCityAction(state, actionId));
  }

  // Crimes are deliberate (no random encounter) and run their own resolution
  // (GDD §6.2). An arrest costs the rest of the day in the lockup.
  const crime = CRIMES[actionId];
  if (crime) {
    const outcome = resolveCrime(state, crime);
    return outcome.jailed ? goToJail(outcome.state) : advanceClock(outcome.state);
  }

  const encounter = maybeEncounter(state, actionId, hostileEncounterBonus(state.character));
  if (encounter.enemy) {
    return startCombat(encounter.state, encounter.enemy);
  }

  const result = resolveAction(encounter.state, actionId);
  const next = pushLog(result.state, result.line);
  return advanceClock(next);
}

/** Being jailed burns the rest of the day: you're released at the next dawn. */
function goToJail(state: GameState): GameState {
  const next = pushLog(state, { text: "You lose the rest of the day behind bars.", tone: "bad" });
  return sleep(next);
}

/** Step into the shop (GDD §5.1). Browsing and trading are free; the turn is
 *  only spent when you leave. */
export function openShop(state: GameState): GameState {
  if (state.shopOpen) return state;
  return pushLog({ ...state, shopOpen: true }, {
    text: "You step into the shop, out of the wind.",
    tone: "neutral",
  });
}

/**
 * Leave a delve voluntarily (M9) — the whole barrow trip costs exactly one
 * turn, spent here (or via a forced exit through finishCombat). Mirrors
 * closeShop: dungeon.ts's leaveDungeon only clears state and narrates; the
 * clock advances here so a fight-triggered exit (which already advances the
 * clock itself) doesn't get double-charged.
 */
export function leaveDungeon(state: GameState): GameState {
  if (!state.dungeon) return state;
  return advanceClock(exitDungeon(state));
}

/**
 * Move to an adjacent hex on the world map (M-A "bigger world" arc). Mirrors
 * leaveDungeon: travel.ts's moveTo only decides WHETHER a turn should be
 * spent (`spendTurn`) — the clock advances here, since travel.ts can't call
 * back into engine.ts without a circular import.
 */
export function travelTo(state: GameState, hex: HexCoord): GameState {
  const { state: next, spendTurn } = moveToPure(state, hex);
  return spendTurn ? advanceClock(next) : next;
}

/** Fight, flee, or bribe past a pending road encounter — same spendTurn shape
 *  as travelTo above. */
export function resolveRoadEncounter(
  state: GameState,
  choice: "fight" | "flee" | "bribe",
): GameState {
  const { state: next, spendTurn } = resolveRoadEncounterPure(state, choice);
  return spendTurn ? advanceClock(next) : next;
}

/** The current settlement's name, for narration that should name the place
 *  you're actually in rather than always saying "the hamlet". */
function placeName(state: GameState): string {
  return settlementOf(state.map, state.location.settlementId)?.name ?? "the hamlet";
}

/** Leave the shop — this is where the visit finally costs its turn. */
export function closeShop(state: GameState): GameState {
  if (!state.shopOpen) return state;
  const next = pushLog({ ...state, shopOpen: false }, {
    text: `You step back out into ${placeName(state)}.`,
    tone: "neutral",
  });
  return advanceClock(next);
}

/**
 * Sleep: end the day and advance to the next one. Rolls a simplified encounter
 * check (GDD §5.3) — with no secured lodging yet, there's a small robbery risk.
 * Clears fatigue after a full night's rest.
 */
export function sleep(state: GameState): GameState {
  let seed = state.rngSeed;
  let character = state.character;

  // Unprotected-sleep robbery check. The odds now ride on Town Guard standing
  // (GDD §5.3/§6.1): a trusted citizen sleeps safe, an outlaw does not.
  let mishapLine: Omit<LogLine, "id"> | null = null;
  const robbed = chance(seed, sleepRobberyChance(character));
  seed = robbed.seed;
  if (robbed.value && character.gold > 0) {
    const lossRoll = randInt(seed, 1, Math.max(1, Math.ceil(character.gold / 2)));
    seed = lossRoll.seed;
    character = { ...character, gold: Math.max(0, character.gold - lossRoll.value) };
    mishapLine = {
      text: `You wake to find ${lossRoll.value} gold gone — you slept without a roof or a friend to watch it.`,
      tone: "bad",
    };
  }

  // You only ever reach a night phase by staying up, so if we're sleeping out
  // of a night, tomorrow starts fatigued (GDD §2.2). A normal day-end sleep
  // clears fatigue entirely.
  const cameFromNight = state.phase === "night";

  const nextDay = state.day + 1;
  const newAge = ageOf(character.birthDay, nextDay);
  const aged = newAge > character.ageYears;
  // A night's rest restores health and mana (GDD §4.2).
  character = { ...character, ageYears: newAge, hp: character.maxHp, mana: character.maxMana };

  let next: GameState = {
    ...state,
    character,
    rngSeed: seed,
    day: nextDay,
    turn: 1,
    phase: "day",
    awaitingRest: false,
    fatigue: cameFromNight ? FATIGUE_PENALTY : 0,
  };

  next = pushLog(next, { text: `— Day ${nextDay} dawns over ${placeName(next)}. —`, tone: "neutral" });
  if (mishapLine) next = pushLog(next, mishapLine);
  if (aged) next = pushLog(next, { text: `You are now ${newAge} years old.`, tone: "neutral" });
  if (next.fatigue > 0) {
    next = pushLog(next, {
      text: "You are weary from the long night. Your efforts today will fall short.",
      tone: "bad",
    });
  }

  // Natural death in old age (GDD §7.1/§7.2): a rising per-day risk past 55.
  if (newAge >= OLD_AGE_START) {
    const risk = (newAge - (OLD_AGE_START - 1)) * NATURAL_DEATH_PER_YEAR;
    const passed = chance(next.rngSeed, risk);
    next = { ...next, rngSeed: passed.seed };
    if (passed.value) {
      return die(next, `passed away peacefully at ${newAge}`);
    }
  }

  return next;
}

/**
 * Stay Up: instead of sleeping, enter a 4-turn night phase (GDD §2.2). The cost
 * (fatigue) is paid tomorrow, and sleep() applies it automatically because it
 * sees the night phase — so there's nothing to stash here.
 */
export function stayUp(state: GameState): GameState {
  if (!state.awaitingRest) return state;
  const next: GameState = {
    ...state,
    phase: "night",
    turn: 1,
    awaitingRest: false,
  };
  return pushLog(next, {
    text: "You choose to stay up. The hamlet's honest folk bar their doors; the night belongs to others now.",
    tone: "neutral",
  });
}

/**
 * Leave a finished fight. Called when the player acknowledges the result. If the
 * fight killed them, the run ends (GDD §4.4 — the Generational Loop is a later
 * milestone, so for now death is game over). Otherwise we clear combat and let
 * the clock tick for the turn the encounter interrupted.
 */
export function finishCombat(state: GameState): GameState {
  if (!state.combat || !state.combat.over) return state;
  const enemyName = state.combat.enemy.name;
  const killed = state.combat.outcome === "killed";

  if (killed) {
    // Death may pass to an heir instead of ending the run (GDD §2.4).
    return die({ ...state, combat: null }, `slain by a ${enemyName}`);
  }

  // A dungeon fight decides the delve's course (press on / retreat / exit)
  // before the clock advances (dungeon exits spend the turn themselves).
  if (state.dungeon) {
    const resolved = dungeonCombatOutcome(state);
    const cleared: GameState = { ...resolved, combat: null };
    return cleared.dungeon ? cleared : advanceClock(cleared);
  }

  return advanceClock({ ...state, combat: null });
}

/**
 * Age tier label for display (GDD §7.1). Structural for now; the mechanical
 * buffs/debuffs per tier are a later milestone.
 */
export function ageTier(age: number): string {
  if (age <= 17) return "Adolescence";
  if (age <= 35) return "Prime";
  if (age <= 55) return "Maturity";
  return "Old Age";
}
