// ---------------------------------------------------------------------------
// family.ts — courtship, marriage, and children (GDD §7.3). Charisma is the
// thread running through all of it: it wins hearts faster and makes for better
// matches. Pure functions returning new GameState; the engine spends the turn.
//
// Children inherit a weighted blend of both parents' attributes plus a small
// random wobble (GDD §7.3) — the genetic lottery that makes each heir distinct.
// ---------------------------------------------------------------------------

import {
  CHILD_ATTR_WOBBLE,
  CONCEIVE_BASE,
  CONCEIVE_CHA,
  COURT_BASE_GAIN,
  COURT_CHA_GAIN,
  MARRY_AGE,
  MARRY_RELATIONSHIP,
  MAX_CHILDREN,
} from "./config";
import { grantXp, practiceAttribute } from "./character";
import { applyReputation } from "./reputation";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import type { ActionDef, Attributes, AttributeKey, Character, GameState, Suitor } from "./types";

/** Action ids handled by this module (registered in the menu conditionally). */
export const COURT_ACTIONS = ["court", "propose", "family"];

/**
 * The family actions to offer right now, given the character's marital status
 * and age. These are daytime, social choices (GDD §7.3). The menu appends them
 * to the normal day actions.
 */
export function familyActions(c: Character): ActionDef[] {
  const out: ActionDef[] = [];
  if (!c.spouse) {
    out.push({
      id: "court",
      label: c.suitor ? `Court ${c.suitor.name}` : "Seek a sweetheart",
      hint: c.suitor
        ? `Deepen your bond (fondness ${Math.round(c.suitor.relationship)}/100). Trains Charisma.`
        : "Look for a partner about the hamlet. Trains Charisma.",
      phases: ["day"],
      trains: "CHA",
    });
    if (c.suitor && c.ageYears >= MARRY_AGE && c.suitor.relationship >= MARRY_RELATIONSHIP) {
      out.push({
        id: "propose",
        label: `Propose to ${c.suitor.name}`,
        hint: "Ask for their hand. A life together begins.",
        phases: ["day"],
      });
    }
  } else if (c.children.length < MAX_CHILDREN) {
    out.push({
      id: "family",
      label: "Try for a child",
      hint: `Grow your family with ${c.spouse.name}.`,
      phases: ["day"],
    });
  }
  return out;
}

const ATTR_KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

const NAMES = [
  "Aldreth", "Mira", "Cob", "Wynn", "Elda", "Bram", "Rowan", "Isolde", "Garrick",
  "Nesta", "Osric", "Linnet", "Hale", "Sable", "Merek", "Talia", "Fenn", "Orla",
];

/** Pick a name from the pool, avoiding any excluded names (e.g. living kin). */
function pickName(seed: number, exclude: string[] = []): { name: string; seed: number } {
  const pool = NAMES.filter((n) => !exclude.includes(n));
  const list = pool.length > 0 ? pool : NAMES;
  const r = randInt(seed, 0, list.length - 1);
  return { name: list[r.value], seed: r.seed };
}

/** Roll a candidate partner. Higher Charisma tends to attract abler matches. */
function rollSuitor(character: Character, seed: number): { suitor: Suitor; seed: number } {
  const named = pickName(seed, [character.name]);
  let s = named.seed;
  const attributes = {} as Attributes;
  for (const k of ATTR_KEYS) {
    // 1..(3 + up to CHA/2) — charismatic suitors skew a touch stronger.
    const hi = 3 + Math.floor(character.attributes.CHA / 2);
    const r = randInt(s, 1, Math.max(3, hi));
    s = r.seed;
    attributes[k] = r.value;
  }
  const rel = 10 + character.attributes.CHA * COURT_CHA_GAIN;
  return { suitor: { name: named.name, attributes, relationship: rel }, seed: s };
}

/** Court a sweetheart (GDD §7.3): find one, or deepen the bond with the current. */
function court(state: GameState): GameState {
  const c = state.character;
  let seed = state.rngSeed;
  let next: GameState;

  if (!c.suitor) {
    const rolled = rollSuitor(c, seed);
    seed = rolled.seed;
    next = { ...state, rngSeed: seed, character: { ...c, suitor: rolled.suitor } };
    next = pushLog(next, {
      text: `You catch the eye of ${rolled.suitor.name} at the tavern.`,
      tone: "good",
    });
  } else {
    const gain = COURT_BASE_GAIN + c.attributes.CHA * COURT_CHA_GAIN;
    const relationship = Math.min(100, c.suitor.relationship + gain);
    next = {
      ...state,
      character: { ...c, suitor: { ...c.suitor, relationship } },
    };
    next = pushLog(next, {
      text: `You spend the evening with ${c.suitor.name}. You grow closer.`,
      tone: "good",
    });
  }

  // Courting is Charisma practice, and grants a little XP.
  return trainCha(next);
}

/** Propose marriage (GDD §7.1/§7.3): needs a fond sweetheart and adulthood. */
function propose(state: GameState): GameState {
  const c = state.character;
  if (!c.suitor) return state;
  if (c.ageYears < MARRY_AGE || c.suitor.relationship < MARRY_RELATIONSHIP) {
    return pushLog(state, {
      text: "The moment isn't right — either you're too young, or the bond too green.",
      tone: "neutral",
    });
  }
  const spouse = { name: c.suitor.name, attributes: c.suitor.attributes };
  let character: Character = { ...c, spouse, suitor: null };
  // A wedding is a public good: the Church and community look kindly on it.
  character = applyReputation(character, { church: 4, merchants: 2 });
  return pushLog({ ...state, character }, {
    text: `You wed ${spouse.name}. The hamlet drinks to your health.`,
    tone: "good",
  });
}

/** Try for a child (GDD §7.3): married only, chance rises slightly with Charisma. */
function tryForChild(state: GameState): GameState {
  const c = state.character;
  if (!c.spouse) return state;
  if (c.children.length >= MAX_CHILDREN) {
    return pushLog(state, { text: "Your household is full and lively enough.", tone: "neutral" });
  }

  const odds = CONCEIVE_BASE + c.attributes.CHA * CONCEIVE_CHA;
  const conceived = chance(state.rngSeed, odds);
  let seed = conceived.seed;
  if (!conceived.value) {
    return pushLog({ ...state, rngSeed: seed }, {
      text: "No child comes of it, this season.",
      tone: "neutral",
    });
  }

  // Blend both parents' attributes plus a small random wobble (GDD §7.3).
  const attributes = {} as Attributes;
  for (const k of ATTR_KEYS) {
    const avg = (c.attributes[k] + c.spouse.attributes[k]) / 2;
    const wobble = randInt(seed, -CHILD_ATTR_WOBBLE, CHILD_ATTR_WOBBLE);
    seed = wobble.seed;
    attributes[k] = Math.max(1, Math.round(avg) + wobble.value);
  }
  const named = pickName(seed, [c.name, c.spouse.name, ...c.children.map((k) => k.name)]);
  seed = named.seed;

  const child = { name: named.name, attributes, birthDay: state.day, alive: true };
  const character = { ...c, children: [...c.children, child] };
  return pushLog({ ...state, rngSeed: seed, character }, {
    text: `A child is born to you and ${c.spouse.name}: ${child.name}.`,
    tone: "good",
  });
}

/** Charisma practice + a little XP for a social turn. */
function trainCha(state: GameState): GameState {
  const xpRes = grantXp(state.character, 5);
  const pr = practiceAttribute(xpRes.character, "CHA");
  let next: GameState = { ...state, character: pr.character };
  if (pr.raised) {
    next = pushLog(next, {
      text: `Your CHA rises to ${pr.character.attributes.CHA}.`,
      tone: "good",
    });
  }
  return next;
}

/** Dispatch a family action by id (routed from the engine). */
export function resolveFamilyAction(state: GameState, actionId: string): GameState {
  switch (actionId) {
    case "court":
      return court(state);
    case "propose":
      return propose(state);
    case "family":
      return tryForChild(state);
    default:
      return state;
  }
}
