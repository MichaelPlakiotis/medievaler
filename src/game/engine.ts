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

import { NIGHT_TURNS, TURNS_PER_DAY, FATIGUE_PENALTY, SAVE_VERSION, UNPROTECTED_ROBBERY_CHANCE } from "./config";
import { ageForDay, createCharacter } from "./character";
import { resolveAction } from "./actions";
import { chance, randInt } from "./rng";
import type { Attributes, GameState, LogLine } from "./types";

let nextLogId = 1;

/** Attach a fresh id to a log line so React can key the list. */
function withId(line: Omit<LogLine, "id">): LogLine {
  return { ...line, id: nextLogId++ };
}

/** Append a line to the log, keeping only the most recent ~50 entries. */
function pushLog(state: GameState, line: Omit<LogLine, "id">): GameState {
  const log = [...state.log, withId(line)].slice(-50);
  return { ...state, log };
}

/** Start a brand-new run from a character-creation allocation. */
export function newGame(name: string, allocation: Attributes, seed?: number): GameState {
  const character = createCharacter(name, allocation);
  const base: GameState = {
    character,
    day: 1,
    turn: 1,
    phase: "day",
    awaitingRest: false,
    fatigue: 0,
    rngSeed: seed ?? Math.floor(Math.random() * 2 ** 31),
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
 * Play one action. Returns the new state. If this was the final turn of the
 * DAY, we flip awaitingRest on so the UI shows the Sleep/Stay-Up choice. If it
 * was the final turn of the NIGHT, the player is forced to sleep automatically.
 */
export function takeAction(state: GameState, actionId: string): GameState {
  if (state.awaitingRest) return state; // must resolve rest first

  const result = resolveAction(state, actionId);
  let next = pushLog(result.state, result.line);

  const lastTurn = turnsInPhase(next) === next.turn;
  if (!lastTurn) {
    return { ...next, turn: next.turn + 1 };
  }

  // We just used the final turn of the phase.
  if (next.phase === "night") {
    // Night always ends in sleep.
    next = pushLog(next, { text: "Dawn creeps in. You can go no longer.", tone: "neutral" });
    return sleep(next);
  }

  // End of a normal day: the rest decision is now due.
  return { ...next, awaitingRest: true };
}

/**
 * Sleep: end the day and advance to the next one. Rolls a simplified encounter
 * check (GDD §5.3) — with no secured lodging yet, there's a small robbery risk.
 * Clears fatigue after a full night's rest.
 */
export function sleep(state: GameState): GameState {
  let seed = state.rngSeed;
  let character = state.character;

  // Unprotected-sleep robbery check (placeholder for the lodging/reputation
  // system in a later milestone).
  let mishapLine: Omit<LogLine, "id"> | null = null;
  const robbed = chance(seed, UNPROTECTED_ROBBERY_CHANCE);
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
  const newAge = ageForDay(nextDay);
  const aged = newAge > character.ageYears;
  character = { ...character, ageYears: newAge, hp: character.maxHp };

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

  next = pushLog(next, { text: `— Day ${nextDay} dawns over the hamlet. —`, tone: "neutral" });
  if (mishapLine) next = pushLog(next, mishapLine);
  if (aged) next = pushLog(next, { text: `You are now ${newAge} years old.`, tone: "neutral" });
  if (next.fatigue > 0) {
    next = pushLog(next, {
      text: "You are weary from the long night. Your efforts today will fall short.",
      tone: "bad",
    });
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
 * Age tier label for display (GDD §7.1). Structural for now; the mechanical
 * buffs/debuffs per tier are a later milestone.
 */
export function ageTier(age: number): string {
  if (age <= 17) return "Adolescence";
  if (age <= 35) return "Prime";
  if (age <= 55) return "Maturity";
  return "Old Age";
}
