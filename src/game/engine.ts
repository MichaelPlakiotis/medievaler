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
  HUNGER_PER_DAY,
  HUNGER_WARNING,
  RATION_HUNGER_RELIEF,
  STARVE_HP_LOSS,
  STAMINA_PER_TURN,
  STAMINA_REST_HUNGRY,
  FAMILY_FOOD_COST,
  FAMILY_NEGLECT_GRACE,
  FAMILY_DEATH_CHANCE,
  FAMILY_DEATH_REP,
  NIGHT_AMBUSH_CHANCE,
} from "./config";
import { ageOf, createCharacter } from "./character";
import { ageTier } from "./aging";
import { resolveAction } from "./actions";
import { maybeEncounter } from "./enemies";
import { startCombat } from "./combat";
import { CRIMES, resolveCrime } from "./crime";
import { COURT_ACTIONS, resolveFamilyAction } from "./family";
import { CITY_ACTIONS, resolveCityAction } from "./amenities";
import { dungeonCombatOutcome, enterDungeon, enterSite, leaveDungeon as exitDungeon } from "./dungeon";
import {
  fastTravelTo as fastTravelToPure,
  moveTo as moveToPure,
  openMap,
  resolveRoadEncounter as resolveRoadEncounterPure,
  rollAmbush,
  sailTo as sailToPure,
} from "./travel";
import { ITEMS } from "./equipment";
import { ENEMIES } from "./enemies";
import { isLichIsland } from "./worldmap";
import { rollPack } from "./enemies";
import { applyReputation } from "./reputation";
import { generateWorldMap, hexKey, hexNeighbors, settlementOf } from "./worldmap";
import { die } from "./succession";
import { npcsAt } from "./npcs";
import { recordQuestArrival, recordQuestKill, recordQuestNewSettlement } from "./quests";
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
    npcOpen: null,
    quests: {},
    generation: 1,
    townPrompt: null,
    nightAmbush: false,
    victory: null,
    lichHp: ENEMIES.varek_ashveil.maxHp,
    map: generated.map,
    discovered,
    location: { hex: hamletHex, settlementId: "hamlet" },
    mapOpen: false,
    waypoints: ["hamlet"],
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
  // Every turn's exertion draws on the day's stamina (config: STAMINA_PER_TURN).
  const stamina = Math.max(0, state.character.stamina - STAMINA_PER_TURN);
  const worn: GameState = { ...state, character: { ...state.character, stamina } };

  const lastTurn = turnsInPhase(worn) === worn.turn;
  if (!lastTurn) {
    return { ...worn, turn: worn.turn + 1 };
  }

  if (worn.phase === "night") {
    const next = pushLog(worn, { text: "Dawn creeps in. You can go no longer.", tone: "neutral" });
    return sleep(next);
  }

  // End of a normal day: the rest decision is now due.
  return { ...worn, awaitingRest: true };
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
    state.npcOpen ||
    state.townPrompt ||
    state.dead
  ) {
    return state;
  }

  // Visiting the shop opens a browsing mode; the turn isn't spent until you
  // leave (GDD §5.1). See openShop / closeShop below.
  if (actionId === "shop") return openShop(state);

  // Seeking out a quest-giver opens a conversation; the turn is spent when it
  // ends (shop-visit pattern). See openNpc / closeNpc below.
  if (actionId.startsWith("npc:")) return openNpc(state, actionId.slice(4));

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
    // Some foes travel in numbers (enemies.ts rollPack).
    const pack = rollPack(encounter.enemy, encounter.state.rngSeed);
    return startCombat({ ...encounter.state, rngSeed: pack.seed }, pack.defs);
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
 * Explore the world-map ruin the character is standing on. Entering is free
 * (like opening the local dungeon) — the single turn is spent on the way out,
 * through the same leaveDungeon/finishCombat paths as any delve. The map
 * stays open underneath, so leaving puts you back on the road.
 */
export function exploreSite(state: GameState): GameState {
  return enterSite(state);
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

/** Pass through the gates the character stands before (townPrompt). Free —
 *  the walk to the gates already cost its turn. */
export function enterTown(state: GameState): GameState {
  const id = state.townPrompt;
  if (!id) return state;
  const settlement = settlementOf(state.map, id);
  if (!settlement) return { ...state, townPrompt: null };
  let next: GameState = {
    ...state,
    townPrompt: null,
    mapOpen: false,
    location: { ...state.location, settlementId: id },
  };
  next = pushLog(next, {
    text: `You pass through the gates of ${settlement.name}.`,
    tone: "good",
  });
  // First visit? The carters' post here now knows your name (fast travel).
  if (!next.waypoints.includes(id)) {
    next = { ...next, waypoints: [...next.waypoints, id] };
    next = pushLog(next, {
      text: `The carters of ${settlement.name} add your name to their ledgers — you can now fast-travel here.`,
      tone: "good",
    });
    next = recordQuestNewSettlement(next);
  }
  // Arriving may satisfy a "reach a town/city" quest objective.
  return recordQuestArrival(next);
}

/**
 * Pay a carter to ride from the waypoint underfoot to another unlocked one
 * (travel.ts fastTravelTo). Same spendTurn shape as travelTo; arrival may
 * satisfy a "reach a town/city" quest objective, just like walking in.
 */
export function fastTravel(state: GameState, settlementId: string): GameState {
  const { state: next, spendTurn } = fastTravelToPure(state, settlementId);
  return spendTurn ? advanceClock(recordQuestArrival(next)) : next;
}

/** Board a boat from the port underfoot to another port (travel.ts sailTo).
 *  Same spendTurn shape as travelTo. */
export function sail(state: GameState, portId: string): GameState {
  const { state: next, spendTurn } = sailToPure(state, portId);
  return spendTurn ? advanceClock(next) : next;
}

/** Decline the gates and keep to the road. Also free — but the night out here
 *  is yours to survive. */
export function stayOutside(state: GameState): GameState {
  if (!state.townPrompt) return state;
  return pushLog({ ...state, townPrompt: null }, {
    text: "You keep to the road outside the walls.",
    tone: "neutral",
  });
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

/** Seek out a quest-giver present in this settlement. Free to open, like the
 *  shop; the turn is spent when the conversation ends (closeNpc). */
export function openNpc(state: GameState, npcId: string): GameState {
  if (state.npcOpen) return state;
  const npc = npcsAt(state).find((n) => n.id === npcId);
  if (!npc) return state;
  return pushLog({ ...state, npcOpen: npcId }, {
    text: `You seek out ${npc.name}.`,
    tone: "neutral",
  });
}

/** End the conversation — this is where the visit costs its turn. */
export function closeNpc(state: GameState): GameState {
  if (!state.npcOpen) return state;
  return advanceClock({ ...state, npcOpen: null });
}

/**
 * Eat or drink from the pack — a bite taken on the move, so it costs no turn
 * (the gold spent on the food was the price). Applies whatever the item
 * carries: health, hunger relief, stamina (equipment.ts ITEMS). Blocked in a
 * fight — combat has its own item action with its own action economy.
 */
export function useConsumable(state: GameState, itemId: string): GameState {
  if (state.combat || state.dead || state.pendingSuccession) return state;
  const item = ITEMS[itemId];
  const held = state.character.inventory[itemId] ?? 0;
  if (!item || item.combatOnly || held <= 0) return state;

  const c = state.character;
  const heal = Math.min(item.heal ?? 0, c.maxHp - c.hp);
  const hungerRelief = Math.min(item.hungerRelief ?? 0, c.hunger);
  const stamina = Math.min(item.staminaRestore ?? 0, 100 - c.stamina);
  const character = {
    ...c,
    hp: c.hp + heal,
    hunger: c.hunger - hungerRelief,
    stamina: c.stamina + stamina,
    inventory: { ...c.inventory, [itemId]: held - 1 },
  };

  const parts: string[] = [];
  if (heal > 0) parts.push(`+${heal} health`);
  if (hungerRelief > 0) parts.push(`−${hungerRelief} hunger`);
  if (stamina > 0) parts.push(`+${stamina} stamina`);
  return pushLog({ ...state, character }, {
    text: `You ${itemId === "waterskin" ? "drink deep from" : "eat"} the ${item.name}.${parts.length > 0 ? ` ${parts.join(", ")}.` : " It changes little."}`,
    tone: "good",
  });
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
 * Sleep: end the day and advance to the next one. Rolls the night's dangers —
 * a robbery under a roofless sky, or a full ambush when camped outside any
 * settlement — then settles hunger, the family's pantry, and stamina.
 * `skipDangers` is set when a night ambush was just fought: the interrupted
 * night then completes without rolling fresh trouble.
 */
export function sleep(state: GameState, skipDangers = false): GameState {
  let seed = state.rngSeed;
  let character = state.character;

  // On the lich's island nothing stirs uninvited — no ambush, no thief. The
  // silence is a promise, not a comfort.
  if (isLichIsland(state.map, state.location.hex)) skipDangers = true;

  // Camped in the wilds? The dark may send something worse than a thief
  // (config.NIGHT_AMBUSH_CHANCE). The night resumes when the fight ends.
  if (!skipDangers && !state.location.settlementId) {
    const roll = chance(seed, NIGHT_AMBUSH_CHANCE);
    seed = roll.seed;
    if (roll.value) {
      const ambush = rollAmbush({ ...state, rngSeed: seed });
      let next: GameState = { ...state, rngSeed: ambush.seed, nightAmbush: true };
      next = pushLog(next, {
        text: "You wake in the dark to snapping twigs — something found your camp!",
        tone: "bad",
      });
      return startCombat(next, ambush.defs);
    }
  }

  // Unprotected-sleep robbery check. The odds now ride on Town Guard standing
  // (GDD §5.3/§6.1): a trusted citizen sleeps safe, an outlaw does not.
  let mishapLine: Omit<LogLine, "id"> | null = null;
  if (!skipDangers) {
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
  }

  // --- Supper, or the lack of it (hunger) -----------------------------------
  let ateLine: Omit<LogLine, "id"> | null = null;
  let hunger = character.hunger + HUNGER_PER_DAY;
  if ((character.inventory.ration ?? 0) > 0) {
    hunger = Math.max(0, hunger - RATION_HUNGER_RELIEF);
    character = {
      ...character,
      inventory: { ...character.inventory, ration: character.inventory.ration - 1 },
    };
  } else if (hunger >= HUNGER_WARNING) {
    ateLine = {
      text:
        hunger >= 100
          ? "You have nothing to eat. You are starving."
          : "You go to sleep on an empty stomach — buy rations while you can.",
      tone: "bad",
    };
  }
  hunger = Math.min(100, hunger);
  character = { ...character, hunger };

  // Starvation eats the body itself (config.STARVE_HP_LOSS).
  let starveLine: Omit<LogLine, "id"> | null = null;
  if (hunger >= 100) {
    const hp = character.hp - STARVE_HP_LOSS;
    if (hp <= 0) {
      const dying = pushLog(
        { ...state, character: { ...character, hp: 0 }, rngSeed: seed },
        { text: "Hunger takes the last of your strength in the night.", tone: "bad" },
      );
      return die(dying, "starved to death");
    }
    character = { ...character, hp };
    starveLine = { text: `Hunger gnaws you through the night. −${STARVE_HP_LOSS} health.`, tone: "bad" };
  }

  // --- The family's table (the pantry fund) ----------------------------------
  const familyLines: Omit<LogLine, "id">[] = [];
  const mouths = (character.spouse ? 1 : 0) + character.children.filter((k) => k.alive).length;
  if (character.familySettlementId && mouths > 0) {
    const cost = mouths * FAMILY_FOOD_COST;
    if (character.familyFund >= cost) {
      character = { ...character, familyFund: character.familyFund - cost, familyNeglect: 0 };
      if (character.familyFund < cost * 3) {
        familyLines.push({
          text: `The pantry fund at home runs thin — ${character.familyFund} gold left for ${mouths} mouth${mouths === 1 ? "" : "s"}.`,
          tone: "bad",
        });
      }
    } else {
      character = { ...character, familyFund: 0, familyNeglect: character.familyNeglect + 1 };
      familyLines.push({
        text: `Your family goes hungry — the pantry fund is empty (day ${character.familyNeglect} without bread).`,
        tone: "bad",
      });
      if (character.familyNeglect > FAMILY_NEGLECT_GRACE) {
        const death = chance(seed, FAMILY_DEATH_CHANCE);
        seed = death.seed;
        if (death.value) {
          // Hunger takes whoever is frailest to it: a child first, then the spouse.
          const starvingChild = character.children.find((k) => k.alive);
          if (starvingChild) {
            character = {
              ...character,
              children: character.children.map((k) =>
                k === starvingChild ? { ...k, alive: false } : k,
              ),
            };
            familyLines.push({
              text: `${starvingChild.name} has starved to death. The settlement will not forget whose table stood empty.`,
              tone: "bad",
            });
          } else if (character.spouse) {
            familyLines.push({
              text: `${character.spouse.name} has starved to death. The settlement will not forget whose table stood empty.`,
              tone: "bad",
            });
            character = { ...character, spouse: null };
          }
          character = applyReputation(character, FAMILY_DEATH_REP);
        }
      }
    }
  }

  // You only ever reach a night phase by staying up, so if we're sleeping out
  // of a night, tomorrow starts fatigued (GDD §2.2). A normal day-end sleep
  // clears fatigue entirely.
  const cameFromNight = state.phase === "night";

  const nextDay = state.day + 1;
  const newAge = ageOf(character.birthDay, nextDay);
  const aged = newAge > character.ageYears;
  // A night's rest restores health, mana, and — appetite allowing — stamina.
  character = {
    ...character,
    ageYears: newAge,
    hp: hunger >= 100 ? character.hp : character.maxHp,
    mana: character.maxMana,
    stamina: hunger >= HUNGER_WARNING ? STAMINA_REST_HUNGRY : 100,
  };

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
  if (ateLine) next = pushLog(next, ateLine);
  if (starveLine) next = pushLog(next, starveLine);
  for (const line of familyLines) next = pushLog(next, line);
  if (aged) {
    next = pushLog(next, { text: `You are now ${newAge} years old.`, tone: "neutral" });
    // Crossing into a new life tier changes your derived stats (aging.ts) —
    // announce it, since nothing on the character itself changes.
    const newTier = ageTier(newAge);
    if (newTier !== ageTier(state.character.ageYears)) {
      const lines: Partial<Record<ReturnType<typeof ageTier>, { text: string; tone: "good" | "neutral" }>> = {
        Prime: { text: "You've come into your prime.", tone: "good" },
        Maturity: {
          text: "Your years settle into wisdom — your mind and tongue are sharper than ever.",
          tone: "good",
        },
        "Old Age": {
          text: "Age has caught you at last — your grip and step are not what they were, but your wits stay keen.",
          tone: "neutral",
        },
      };
      const line = lines[newTier];
      if (line) next = pushLog(next, line);
    }
  }
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
  const combat = state.combat;
  const killed = combat.outcome === "killed";

  // The lich does not heal. However this fight ended, whatever health Varek
  // has left is whatever he'll have when the next of the line returns.
  const varek = combat.enemies.find((e) => e.id === "varek_ashveil");
  if (varek) {
    state = { ...state, lichHp: Math.max(0, varek.hp) };
    if (varek.hp > 0 && varek.hp < ENEMIES.varek_ashveil.maxHp) {
      state = pushLog(state, {
        text: `Varek Ashveil withdraws into the Spire's cold, wounded and unhealing — ${varek.hp} of his strength remains for the next of your line to face.`,
        tone: "neutral",
      });
    }
    // The lich falls: the saga ends here and now, quest or no quest — the
    // ending screen is owed. (Turning in Eddan's quest still pays its reward.)
    if (varek.hp <= 0 && !state.victory) {
      state = { ...state, victory: "won" };
    }
  }

  if (killed) {
    // Death may pass to an heir instead of ending the run (GDD §2.4).
    const slayer = combat.slainBy ?? combat.enemies[0].name;
    return die({ ...state, combat: null }, `slain by a ${slayer}`);
  }

  // Every foe actually felled advances a kill quest (quests.ts) — even if the
  // fight ended with the survivors (or you) running.
  let tallied = state;
  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) tallied = recordQuestKill(tallied, enemy.id);
  }

  // A night ambush interrupted your sleep: with the fight survived, the
  // night now completes (no fresh dangers) instead of a turn advancing.
  if (tallied.nightAmbush) {
    return sleep({ ...tallied, combat: null, nightAmbush: false }, true);
  }

  // A dungeon fight decides the delve's course (press on / retreat / exit)
  // before the clock advances (dungeon exits spend the turn themselves).
  if (tallied.dungeon) {
    const resolved = dungeonCombatOutcome(tallied);
    const cleared: GameState = { ...resolved, combat: null };
    return cleared.dungeon ? cleared : advanceClock(cleared);
  }

  return advanceClock({ ...tallied, combat: null });
}

// Age tiers (and their stat modifiers) live in aging.ts; re-exported here so
// the UI's existing `import { ageTier } from "../game/engine"` keeps working.
export { ageTier } from "./aging";
