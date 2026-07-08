// ---------------------------------------------------------------------------
// succession.ts — death and the Generational Loop (GDD §2.4 / §7.2). When a
// character dies, we look for a living child aged 12+. If one exists the run
// continues as that heir, who inherits blended attributes (set at birth), the
// family's gold and gear, and a partial share of the parent's standing. If no
// heir exists, the run is over for good.
// ---------------------------------------------------------------------------

import { HEIR_MIN_AGE, INHERIT_REP_FRACTION } from "./config";
import { ageOf, makeAttributes, maxHpFor } from "./character";
import { maxManaFor, meetsRequirements, startingWeapon } from "./equipment";
import { pushLog } from "./log";
import type { Character, Child, GameState, Reputation } from "./types";

/** The children old enough to inherit, eldest first (GDD §2.4). */
export function eligibleHeirs(children: Child[], day: number): Child[] {
  return children
    .filter((c) => c.alive && ageOf(c.birthDay, day) >= HEIR_MIN_AGE)
    .sort((a, b) => a.birthDay - b.birthDay); // earlier birthDay = older = first
}

/**
 * Resolve a death. If there are eligible heirs, stash them for the player to
 * choose from; otherwise the run ends permanently.
 */
export function die(state: GameState, cause: string): GameState {
  const heirs = eligibleHeirs(state.character.children, state.day);
  // Clear any in-progress delve — it belonged to the deceased, not the heir.
  const next = pushLog(
    { ...state, dungeon: null },
    { text: `${state.character.name} has died — ${cause}.`, tone: "bad" },
  );
  if (heirs.length > 0) {
    return { ...next, pendingSuccession: heirs, deathCause: cause };
  }
  return { ...next, dead: true, deathCause: cause };
}

/** A partial copy of a reputation map (the family name only carries so far). */
function inheritedReputation(rep: Reputation): Reputation {
  const out = {} as Reputation;
  (Object.keys(rep) as (keyof Reputation)[]).forEach((k) => {
    out[k] = Math.round(rep[k] * INHERIT_REP_FRACTION);
  });
  return out;
}

/**
 * Build the heir's character from the deceased parent and the chosen child. The
 * heir keeps their own (blended) attributes and age, starts fresh at level 0,
 * and inherits the family's coffer, gear, and a share of its standing.
 */
export function buildHeir(parent: Character, child: Child, day: number): Character {
  const attributes = { ...child.attributes };
  const maxHp = maxHpFor(attributes);
  const maxMana = maxManaFor(attributes);

  // Inherit the family armory, but only wield/wear what the heir can (GDD §3.3).
  const weapon = meetsRequirements(attributes, parent.weapon.requirements)
    ? parent.weapon
    : startingWeapon(attributes);
  const ownedWeapons = [...parent.ownedWeapons];
  if (!ownedWeapons.includes(weapon.id)) ownedWeapons.push(weapon.id);
  const armor =
    parent.armor && meetsRequirements(attributes, parent.armor.requirements)
      ? parent.armor
      : null;

  return {
    name: child.name,
    gender: child.gender,
    birthDay: child.birthDay,
    ageYears: ageOf(child.birthDay, day),
    attributes,
    attributeProgress: makeAttributes(0),
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    gold: parent.gold, // the family coffer passes on
    level: 0,
    xp: 0,
    weapon,
    armor,
    ownedWeapons,
    ownedArmor: [...parent.ownedArmor],
    inventory: { ...parent.inventory },
    reputation: inheritedReputation(parent.reputation),
    suitor: null,
    spouse: null,
    children: [],
    // Family property persists across generations (GDD §7.3) — and so do the
    // family's books: an heir keeps every spell the line has learned.
    ownedHomes: [...parent.ownedHomes],
    familySettlementId: parent.familySettlementId,
    knownSpells: [...parent.knownSpells],
    skillPoints: 0, // an heir earns their own
  };
}

/**
 * Continue the run as the chosen heir (GDD §2.4). Clears the death state and
 * starts the heir on a fresh day.
 */
export function succeed(state: GameState, heirIndex: number): GameState {
  const heirs = state.pendingSuccession;
  if (!heirs || heirIndex < 0 || heirIndex >= heirs.length) return state;

  const parent = state.character;
  const heir = buildHeir(parent, heirs[heirIndex], state.day);

  let next: GameState = {
    ...state,
    character: heir,
    pendingSuccession: null,
    deathCause: null,
    combat: null,
    shopOpen: false,
    dungeon: null,
    awaitingRest: false,
    fatigue: 0,
    turn: 1,
    phase: "day",
  };
  next = pushLog(next, {
    text: `The name lives on. You take up the life of ${heir.name}, ${heir.ageYears}, heir to ${parent.name}.`,
    tone: "good",
  });
  return next;
}
