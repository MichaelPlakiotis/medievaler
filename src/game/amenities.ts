// ---------------------------------------------------------------------------
// amenities.ts — bigger-city amenities the hamlet's church can't host: a
// university (stronger Smartness training) and a brothel (Charisma training;
// for a male character, a chance of fathering a child; if married, a chance
// of being caught, with reputation fallout and possibly divorce).
//
// Mirrors family.ts's shape: pure functions returning a new GameState, all
// randomness through state.rngSeed, dispatched from engine.ts's takeAction
// exactly like COURT_ACTIONS. Kept tasteful/abstracted — same non-explicit
// tone as the existing courtship system.
// ---------------------------------------------------------------------------

import {
  BROTHEL_CAUGHT_CHANCE,
  BROTHEL_CAUGHT_REP_PENALTY,
  BROTHEL_CONCEIVE_BASE,
  BROTHEL_DIVORCE_CHANCE,
  BROTHEL_GOLD_COST,
  CHILD_ATTR_WOBBLE,
  FERTILITY_END_AGE,
  MARRY_AGE,
  UNIVERSITY_GOLD_COST,
  UNIVERSITY_XP_MAX,
  UNIVERSITY_XP_MIN,
} from "./config";
import { grantXp, practiceAttribute } from "./character";
import { ATTR_KEYS, canConceive, pickName, trainCha } from "./family";
import { applyReputation } from "./reputation";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import { hasStructure } from "./worldmap";
import type { ActionDef, Attributes, Character, GameState, Settlement } from "./types";

/** Action ids handled by this module (registered in the menu conditionally,
 *  wherever the structures exist — in practice, cities). */
export const CITY_ACTIONS = ["university", "brothel"];

/**
 * The big-city amenity actions to offer right now, driven by the settlement's
 * actual structures (in practice only cities roll them). The brothel is
 * withheld below MARRY_AGE, same "just don't offer it yet" convention
 * family.ts already uses for `propose`.
 */
export function citySettlementActions(
  character: Character,
  settlement: Settlement | null,
): ActionDef[] {
  const out: ActionDef[] = [];
  if (hasStructure(settlement, "university")) {
    out.push({
      id: "university",
      label: "Study at the university",
      hint: `Rigorous tutoring under city scholars — trains Smartness harder than a church visit. Costs ${UNIVERSITY_GOLD_COST} gold tuition.`,
      phases: ["day"],
      trains: "SMT",
    });
  }
  if (hasStructure(settlement, "brothel") && character.ageYears >= MARRY_AGE) {
    out.push({
      id: "brothel",
      label: "Visit the pleasure house",
      hint: `An evening of company, for a price. Trains Charisma.${character.spouse ? " Risky, married as you are." : ""}`,
      phases: ["day"],
      trains: "CHA",
      danger: true,
    });
  }
  return out;
}

/** University: a richer roll than the church's free `study`, and — the real
 *  difference — trains Smartness twice as hard (practiceAttribute's per-call
 *  gain is a fixed constant, so two calls is how "stronger" is expressed). */
function university(state: GameState): GameState {
  const c = state.character;
  if (c.gold < UNIVERSITY_GOLD_COST) {
    return pushLog(state, {
      text: "You can't afford the university's tuition today.",
      tone: "neutral",
    });
  }

  let character: Character = { ...c, gold: c.gold - UNIVERSITY_GOLD_COST };
  const xpRoll = randInt(state.rngSeed, UNIVERSITY_XP_MIN, UNIVERSITY_XP_MAX);
  let seed = xpRoll.seed;
  const xpRes = grantXp(character, xpRoll.value);
  character = xpRes.character;

  let raised = false;
  for (let i = 0; i < 2; i++) {
    const pr = practiceAttribute(character, "SMT");
    character = pr.character;
    raised = raised || pr.raised;
  }

  let next: GameState = { ...state, character, rngSeed: seed };
  const parts = [
    "You sit in on a lecture and work through the scholars' problems.",
    `+${xpRoll.value} XP`,
  ];
  let tone: "good" | "neutral" = "good";
  if (xpRes.leveledUp > 0) parts.push(`— you reach level ${character.level}!`);
  if (raised) {
    parts.push(`Your SMT rises to ${character.attributes.SMT}.`);
  }
  next = pushLog(next, { text: parts.join(" "), tone });
  return next;
}

/** A one-off "stranger" partner — never persisted as a suitor or spouse,
 *  just enough to blend a child's attributes against. */
function rollStrangerAttributes(seed: number): { attributes: Attributes; seed: number } {
  const attributes = {} as Attributes;
  let s = seed;
  for (const k of ATTR_KEYS) {
    const r = randInt(s, 1, 4);
    s = r.seed;
    attributes[k] = r.value;
  }
  return { attributes, seed: s };
}

/** Father a child by a stranger (male characters only) — same blending,
 *  fertility-age, and cooldown rules as family.ts's tryForChild, just against
 *  a randomly generated one-off partner instead of a spouse. */
function conceiveWithStranger(state: GameState): GameState {
  const c = state.character;
  if (c.ageYears >= FERTILITY_END_AGE || !canConceive(c, state.day)) return state;

  const roll = chance(state.rngSeed, BROTHEL_CONCEIVE_BASE);
  let seed = roll.seed;
  if (!roll.value) return { ...state, rngSeed: seed };

  const stranger = rollStrangerAttributes(seed);
  seed = stranger.seed;

  const attributes = {} as Attributes;
  for (const k of ATTR_KEYS) {
    const avg = (c.attributes[k] + stranger.attributes[k]) / 2;
    const wobble = randInt(seed, -CHILD_ATTR_WOBBLE, CHILD_ATTR_WOBBLE);
    seed = wobble.seed;
    attributes[k] = Math.max(1, Math.round(avg) + wobble.value);
  }
  const childGender = chance(seed, 0.5);
  seed = childGender.seed;
  const named = pickName(
    seed,
    childGender.value ? "male" : "female",
    [c.name, ...c.children.map((k) => k.name)],
  );
  seed = named.seed;

  const child = {
    name: named.name,
    gender: childGender.value ? ("male" as const) : ("female" as const),
    attributes,
    birthDay: state.day,
    alive: true,
  };
  const character = { ...c, children: [...c.children, child] };
  return pushLog(
    { ...state, rngSeed: seed, character },
    {
      text: `Word reaches you, weeks later, of a ${child.gender === "male" ? "son" : "daughter"} born of that night: ${child.name}.`,
      tone: "good",
    },
  );
}

/** If married: a chance of being caught, with reputation fallout — and, only
 *  if caught, a further chance the marriage doesn't survive it. */
function checkInfidelity(state: GameState): GameState {
  const c = state.character;
  if (!c.spouse) return state;

  const caughtRoll = chance(state.rngSeed, BROTHEL_CAUGHT_CHANCE);
  let seed = caughtRoll.seed;
  if (!caughtRoll.value) return { ...state, rngSeed: seed };

  let character = applyReputation(c, BROTHEL_CAUGHT_REP_PENALTY);
  let next = pushLog(
    { ...state, rngSeed: seed, character },
    {
      text: "Someone recognizes you leaving — word has a way of traveling. Your standing suffers for it.",
      tone: "bad",
    },
  );

  const divorceRoll = chance(next.rngSeed, BROTHEL_DIVORCE_CHANCE);
  next = { ...next, rngSeed: divorceRoll.seed };
  if (divorceRoll.value) {
    const spouseName = next.character.spouse!.name;
    next = {
      ...next,
      character: { ...next.character, spouse: null },
    };
    next = pushLog(next, {
      text: `${spouseName} hears the whispers, and by week's end your marriage is over.`,
      tone: "bad",
    });
  }
  return next;
}

/** Visit the brothel: Charisma training, a possible child, and — if married —
 *  the risk of being caught. */
function brothel(state: GameState): GameState {
  const c = state.character;
  if (c.gold < BROTHEL_GOLD_COST) {
    return pushLog(state, {
      text: "You haven't the coin for the pleasure house tonight.",
      tone: "neutral",
    });
  }

  let next: GameState = {
    ...state,
    character: { ...c, gold: c.gold - BROTHEL_GOLD_COST },
  };
  next = pushLog(next, {
    text: "You spend a memorable evening at the pleasure house.",
    tone: "neutral",
  });
  next = trainCha(next);

  if (next.character.gender === "male") next = conceiveWithStranger(next);
  next = checkInfidelity(next);

  return next;
}

/** Dispatch a city-amenity action by id (routed from the engine). */
export function resolveCityAction(state: GameState, actionId: string): GameState {
  switch (actionId) {
    case "university":
      return university(state);
    case "brothel":
      return brothel(state);
    default:
      return state;
  }
}
