// ---------------------------------------------------------------------------
// actions.ts — the menu of things the player can do, and the outcome logic for
// each one. This is where the hamlet "comes to life" (GDD §5.1). To add a new
// activity later, you add an entry to ACTIONS and a case in resolveAction.
// ---------------------------------------------------------------------------

import { grantXp, practiceAttribute } from "./character";
import { randInt } from "./rng";
import type { ActionDef, ApplyResult, GameState } from "./types";

/** Every action the player can choose, day or night. */
export const ACTIONS: ActionDef[] = [
  // ---- Daytime hamlet actions (GDD §5.1) ----
  {
    id: "tavern",
    label: "Visit the tavern",
    hint: "Rumors, company, the odd coin. Trains Charisma.",
    phases: ["day"],
    trains: "CHA",
  },
  {
    id: "shop",
    label: "Visit the shop",
    hint: "Barter and appraise wares. Trains Smartness.",
    phases: ["day"],
    trains: "SMT",
  },
  {
    id: "roam",
    label: "Roam the outskirts",
    hint: "Forage and wander. Low stakes. Trains Agility.",
    phases: ["day"],
    trains: "AGI",
  },
  {
    id: "work",
    label: "Work for the town",
    hint: "Honest labor: steady gold and XP. Trains Strength.",
    phases: ["day"],
    trains: "STR",
  },
  // ---- Night actions (GDD §5.2, crime deliberately excluded this milestone) ----
  {
    id: "alleys",
    label: "Roam the alleys",
    hint: "The town after dark. Chance finds. Trains Agility.",
    phases: ["night"],
    trains: "AGI",
  },
  {
    id: "hunt",
    label: "Go hunting",
    hint: "Track game beyond the walls for meat and pelts. Trains Strength.",
    phases: ["night"],
    trains: "STR",
  },
];

/** Actions available right now, filtered by the current phase. */
export function availableActions(phase: GameState["phase"]): ActionDef[] {
  return ACTIONS.filter((a) => a.phases.includes(phase));
}

// Reward tables per action: [minGold, maxGold, minXp, maxXp].
// Placeholders — tune freely in one place.
const REWARDS: Record<string, [number, number, number, number]> = {
  tavern: [-2, 3, 4, 8],
  shop: [-1, 4, 4, 8],
  roam: [0, 3, 5, 9],
  work: [3, 6, 6, 10],
  alleys: [0, 5, 5, 10],
  hunt: [2, 7, 6, 11],
};

// Flavor text drawn at random so repeated actions still read nicely.
const FLAVOR: Record<string, string[]> = {
  tavern: [
    "You trade stories over watered ale.",
    "A traveler lets slip a rumor about the eastern road.",
    "You help the keeper haul a keg and earn a nod.",
  ],
  shop: [
    "You haggle over a bundle of tallow candles.",
    "The merchant tests your eye for a fair price.",
    "You sort crates in exchange for a few coins.",
  ],
  roam: [
    "You forage berries along the hedgerow.",
    "A rabbit bolts; you're quicker than you look.",
    "You find a dropped coin in the mud.",
  ],
  work: [
    "You split firewood behind the mill.",
    "You mend a fence for the reeve.",
    "You haul water until your arms ache.",
  ],
  alleys: [
    "You slip between shuttered stalls.",
    "A stray dog eyes you, then trots off.",
    "You pocket a coin someone dropped at dusk.",
  ],
  hunt: [
    "You follow tracks to a thicket beyond the palisade.",
    "You loose a careful shot and eat well tonight.",
    "You set a snare and wait in the cold.",
  ],
};

/**
 * Resolve one chosen action. PURE: takes the current state, returns a new state
 * and a line to narrate. All randomness flows through state.rngSeed, which we
 * advance and store back so the run stays reproducible.
 */
export function resolveAction(state: GameState, actionId: string): ApplyResult {
  const def = ACTIONS.find((a) => a.id === actionId);
  if (!def) {
    return { state, line: { text: "Nothing happens.", tone: "neutral" } };
  }

  const [minG, maxG, minX, maxX] = REWARDS[actionId] ?? [0, 1, 1, 3];
  let seed = state.rngSeed;

  // Roll gold, softened by yesterday's fatigue if any.
  const goldRoll = randInt(seed, minG, maxG);
  seed = goldRoll.seed;
  const gold = goldRoll.value - state.fatigue;

  // Roll XP, likewise reduced (but never below 1) by fatigue.
  const xpRoll = randInt(seed, minX, maxX);
  seed = xpRoll.seed;
  const xp = Math.max(1, xpRoll.value - state.fatigue);

  // Pick flavor text.
  const flavorList = FLAVOR[actionId] ?? ["Time passes."];
  const flavorRoll = randInt(seed, 0, flavorList.length - 1);
  seed = flavorRoll.seed;
  const flavor = flavorList[flavorRoll.value];

  // Apply growth to a fresh character copy.
  let character = { ...state.character, gold: state.character.gold + gold };
  const xpResult = grantXp(character, xp);
  character = xpResult.character;

  let raisedAttr = false;
  if (def.trains) {
    const pr = practiceAttribute(character, def.trains);
    character = pr.character;
    raisedAttr = pr.raised;
  }

  // Build the narrative line.
  const parts: string[] = [flavor];
  if (gold > 0) parts.push(`+${gold} gold`);
  else if (gold < 0) parts.push(`${gold} gold`);
  parts.push(`+${xp} XP`);
  let tone: ApplyResult["line"]["tone"] = gold < 0 ? "neutral" : "good";

  if (xpResult.leveledUp > 0) {
    parts.push(`— you reach level ${character.level}!`);
    tone = "good";
  }
  if (raisedAttr && def.trains) {
    parts.push(`Your ${def.trains} rises to ${character.attributes[def.trains]}.`);
    tone = "good";
  }

  return {
    state: { ...state, character, rngSeed: seed },
    line: { text: parts.join(" "), tone },
  };
}
