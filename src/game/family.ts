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
  CHILD_COOLDOWN_DAYS,
  CONCEIVE_BASE,
  CONCEIVE_CHA,
  COURT_BASE_GAIN,
  COURT_CHA_GAIN,
  MARRY_AGE,
  MARRY_RELATIONSHIP,
  MAX_CHILDREN,
  MOVE_FAMILY_COST,
} from "./config";
import { effectiveAttributes } from "./aging";
import { grantXp, practiceAttribute } from "./character";
import { applyReputation } from "./reputation";
import { pushLog } from "./log";
import { chance, randInt } from "./rng";
import { settlementOf } from "./worldmap";
import type {
  ActionDef,
  Attributes,
  AttributeKey,
  Character,
  GameState,
  Gender,
  Suitor,
  WorldMap,
} from "./types";

/** Action ids handled by this module (registered in the menu conditionally). */
export const COURT_ACTIONS = ["court", "seeknew", "propose", "family", "movefamily"];

/** The gender you court and marry — the opposite of your own (GDD §7.3). */
export function oppositeGender(g: Gender): Gender {
  return g === "male" ? "female" : "male";
}

/** True once the newest child is at least a year old, so you can try again. */
export function canConceive(c: Character, day: number): boolean {
  if (c.children.length === 0) return true;
  const newest = Math.max(...c.children.map((k) => k.birthDay));
  return day - newest >= CHILD_COOLDOWN_DAYS;
}

/**
 * The family actions to offer right now, given the character's marital status,
 * age, and where they're standing. These are daytime, social choices (GDD
 * §7.3). The menu appends them to the normal day actions. `settlementId` is
 * where the character currently is (null on the open road); the map is only
 * used to name places in hints.
 */
export function familyActions(
  c: Character,
  day: number,
  settlementId: string | null = null,
  map: WorldMap | null = null,
): ActionDef[] {
  const out: ActionDef[] = [];
  const familyPlace = map ? settlementOf(map, c.familySettlementId)?.name : c.familySettlementId;
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
    if (c.suitor) {
      out.push({
        id: "seeknew",
        label: "Look elsewhere",
        hint: `Part from ${c.suitor.name} and seek a different match.`,
        phases: ["day"],
      });
    }
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
      hint:
        c.ownedHomes.length === 0
          ? "You need a home of your own first (buy one at the shop)."
          : c.familySettlementId !== settlementId
            ? `Your family lives in ${familyPlace ?? "another settlement"} — you must be with them.`
            : !canConceive(c, day)
              ? "Too soon — wait until your youngest is a year old."
              : `Grow your family with ${c.spouse.name}.`,
      phases: ["day"],
    });
  }
  // Relocating the household: standing in a settlement where you own a home,
  // while the family lives somewhere else.
  if (
    (c.spouse || c.children.length > 0) &&
    settlementId !== null &&
    c.ownedHomes.includes(settlementId) &&
    c.familySettlementId !== null &&
    c.familySettlementId !== settlementId
  ) {
    out.push({
      id: "movefamily",
      label: "Send for your family",
      hint: `Hire a cart to bring the household from ${familyPlace ?? "their home"} to your house here. Costs ${MOVE_FAMILY_COST} gold.`,
      phases: ["day"],
    });
  }
  return out;
}

export const ATTR_KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

const MALE_NAMES = [
  "Aldreth", "Cob", "Bram", "Rowan", "Garrick", "Osric", "Hale", "Merek",
  "Fenn", "Edric", "Wystan", "Corin", "Halden", "Alaric",
];
const FEMALE_NAMES = [
  "Mira", "Wynn", "Elda", "Isolde", "Nesta", "Linnet", "Sable", "Talia",
  "Orla", "Bryd", "Maerwen", "Rowena", "Sunniva", "Edith",
];

function namePool(gender: Gender): string[] {
  return gender === "male" ? MALE_NAMES : FEMALE_NAMES;
}

/** Pick a name of a given gender, avoiding any excluded names (e.g. living kin). */
export function pickName(
  seed: number,
  gender: Gender,
  exclude: string[] = [],
): { name: string; seed: number } {
  const all = namePool(gender);
  const pool = all.filter((n) => !exclude.includes(n));
  const list = pool.length > 0 ? pool : all;
  const r = randInt(seed, 0, list.length - 1);
  return { name: list[r.value], seed: r.seed };
}

/** Roll a candidate partner of the opposite gender. Higher Charisma tends to
 *  attract abler matches (better genes for future children). */
function rollSuitor(character: Character, seed: number): { suitor: Suitor; seed: number } {
  const cha = effectiveAttributes(character).CHA; // age-adjusted (aging.ts)
  const gender = oppositeGender(character.gender);
  const named = pickName(seed, gender, [character.name]);
  let s = named.seed;
  const attributes = {} as Attributes;
  for (const k of ATTR_KEYS) {
    // 1..(3 + up to CHA/2) — charismatic suitors skew a touch stronger.
    const hi = 3 + Math.floor(cha / 2);
    const r = randInt(s, 1, Math.max(3, hi));
    s = r.seed;
    attributes[k] = r.value;
  }
  const rel = 10 + cha * COURT_CHA_GAIN;
  return { suitor: { name: named.name, gender, attributes, relationship: rel }, seed: s };
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
    const gain = COURT_BASE_GAIN + effectiveAttributes(c).CHA * COURT_CHA_GAIN;
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

/** Part from the current sweetheart and meet a fresh candidate (GDD §7.3 —
 *  shopping around for a better match). */
function seekNew(state: GameState): GameState {
  const c = state.character;
  if (!c.suitor) return state;
  const former = c.suitor.name;
  const rolled = rollSuitor(c, state.rngSeed);
  let next: GameState = {
    ...state,
    rngSeed: rolled.seed,
    character: { ...c, suitor: rolled.suitor },
  };
  next = pushLog(next, {
    text: `You part ways with ${former}, and soon ${rolled.suitor.name} catches your eye instead.`,
    tone: "neutral",
  });
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
  const spouse = { name: c.suitor.name, gender: c.suitor.gender, attributes: c.suitor.attributes };
  let character: Character = { ...c, spouse, suitor: null };
  // A wedding is a public good: the Church and community look kindly on it.
  character = applyReputation(character, { church: 4, merchants: 2 });
  return pushLog({ ...state, character }, {
    text: `You wed ${spouse.name}. The hamlet drinks to your health.`,
    tone: "good",
  });
}

/** Try for a child (GDD §7.3): married, with a home, and no more than one child
 *  per year. Chance of conceiving rises slightly with Charisma. */
function tryForChild(state: GameState): GameState {
  const c = state.character;
  if (!c.spouse) return state;
  if (c.children.length >= MAX_CHILDREN) {
    return pushLog(state, { text: "Your household is full and lively enough.", tone: "neutral" });
  }
  if (c.ownedHomes.length === 0) {
    return pushLog(state, {
      text: "You've nowhere to raise a child — buy a home of your own first.",
      tone: "neutral",
    });
  }
  if (c.familySettlementId !== state.location.settlementId) {
    const placeName = settlementOf(state.map, c.familySettlementId)?.name ?? "another settlement";
    return pushLog(state, {
      text: `Your family lives in ${placeName} — a child needs you both under the same roof.`,
      tone: "neutral",
    });
  }
  if (!canConceive(c, state.day)) {
    return pushLog(state, {
      text: "It's too soon — best to wait until your youngest is a year old.",
      tone: "neutral",
    });
  }

  const odds = CONCEIVE_BASE + effectiveAttributes(c).CHA * CONCEIVE_CHA;
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
  // A child of either gender.
  const gRoll = chance(seed, 0.5);
  seed = gRoll.seed;
  const gender: Gender = gRoll.value ? "male" : "female";
  const named = pickName(seed, gender, [c.name, c.spouse.name, ...c.children.map((k) => k.name)]);
  seed = named.seed;

  const child = { name: named.name, gender, attributes, birthDay: state.day, alive: true };
  const character = { ...c, children: [...c.children, child] };
  return pushLog({ ...state, rngSeed: seed, character }, {
    text: `A ${gender === "male" ? "son" : "daughter"} is born to you and ${c.spouse.name}: ${child.name}.`,
    tone: "good",
  });
}

/** Charisma practice + a little XP for a social turn. */
export function trainCha(state: GameState): GameState {
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

/** Send for the family: relocate the household to an owned home in the
 *  settlement the character is standing in. Costs MOVE_FAMILY_COST gold. */
function moveFamily(state: GameState): GameState {
  const c = state.character;
  const here = state.location.settlementId;
  if (here === null || !c.ownedHomes.includes(here) || c.familySettlementId === here) return state;
  if (!c.spouse && c.children.length === 0) return state; // no household to move
  if (c.gold < MOVE_FAMILY_COST) {
    return pushLog(state, {
      text: "You can't afford to hire the cart for the move just now.",
      tone: "neutral",
    });
  }
  const hereName = settlementOf(state.map, here)?.name ?? "your new home";
  const character: Character = {
    ...c,
    gold: c.gold - MOVE_FAMILY_COST,
    familySettlementId: here,
  };
  return pushLog({ ...state, character }, {
    text: `Within the week the cart arrives — your family settles into the ${hereName} house.`,
    tone: "good",
  });
}

/** Dispatch a family action by id (routed from the engine). */
export function resolveFamilyAction(state: GameState, actionId: string): GameState {
  switch (actionId) {
    case "court":
      return court(state);
    case "seeknew":
      return seekNew(state);
    case "propose":
      return propose(state);
    case "family":
      return tryForChild(state);
    case "movefamily":
      return moveFamily(state);
    default:
      return state;
  }
}
