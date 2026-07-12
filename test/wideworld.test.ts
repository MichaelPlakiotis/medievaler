// ---------------------------------------------------------------------------
// wideworld.test.ts — the "wider world" batch: waypoint fast travel, horses,
// eating/drinking to cleanse hunger, the new NPCs of the bigger map, and the
// v15→v16 save migration.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { enterTown, fastTravel, newGame, useConsumable } from "../src/game/engine";
import { fastTravelCost, fastTravelOrigin, fastTravelTo, moveTo, reachableHexes } from "../src/game/travel";
import { buy, shopStockFor } from "../src/game/shop";
import { HORSES } from "../src/game/equipment";
import { NPCS, npcSettlementId } from "../src/game/npcs";
import { hexDistance, hexKey } from "../src/game/worldmap";
import { parseSave } from "../src/game/save";
import { MAP_RADIUS, SAVE_VERSION } from "../src/game/config";
import type { Attributes, GameState, Settlement } from "../src/game/types";

const build: Attributes = { STR: 3, AGI: 3, SMT: 2, CHA: 1 };

function fresh(seed = 7): GameState {
  return newGame("Rover", build, seed);
}

/** Drop the character inside a given settlement (as if they'd walked there). */
function standIn(state: GameState, s: Settlement): GameState {
  return {
    ...state,
    location: { hex: s.hex, settlementId: s.id },
    waypoints: [...new Set([...state.waypoints, s.id])],
  };
}

function townOf(state: GameState): Settlement {
  return state.map.settlements.find((s) => s.kind === "town")!;
}
function cityOf(state: GameState): Settlement {
  return state.map.settlements.find((s) => s.kind === "city")!;
}

// --- Waypoints ---------------------------------------------------------------

describe("waypoints", () => {
  it("a new game knows only the home hamlet", () => {
    expect(fresh().waypoints).toEqual(["hamlet"]);
  });

  it("entering a settlement for the first time unlocks it as a waypoint", () => {
    const s = fresh();
    const town = townOf(s);
    const atGates: GameState = {
      ...s,
      townPrompt: town.id,
      location: { hex: town.hex, settlementId: null },
    };
    const inside = enterTown(atGates);
    expect(inside.waypoints).toContain(town.id);

    // Re-entering doesn't duplicate it.
    const again = enterTown({ ...inside, townPrompt: town.id });
    expect(again.waypoints.filter((w) => w === town.id)).toHaveLength(1);
  });
});

// --- Fast travel ---------------------------------------------------------------

describe("fast travel", () => {
  function withTwoWaypoints(): { state: GameState; town: Settlement } {
    const s = fresh();
    const town = townOf(s);
    return { state: { ...s, waypoints: ["hamlet", town.id] }, town };
  }

  it("moves you inside the destination, charges the fare, and spends a turn", () => {
    const { state, town } = withTwoWaypoints();
    const rich: GameState = { ...state, character: { ...state.character, gold: 500 } };
    const cost = fastTravelCost(rich, "hamlet", town.id);
    expect(cost).toBe(hexDistance({ q: 0, r: 0 }, town.hex) * 2);

    const after = fastTravel(rich, town.id);
    expect(after.location).toEqual({ hex: town.hex, settlementId: town.id });
    expect(after.character.gold).toBe(500 - cost);
    expect(after.turn).toBe(rich.turn + 1);
    expect(after.mapOpen).toBe(false);
  });

  it("refuses a destination that isn't an unlocked waypoint", () => {
    const s = fresh(); // only the hamlet is known
    const town = townOf(s);
    const result = fastTravelTo({ ...s, character: { ...s.character, gold: 500 } }, town.id);
    expect(result.spendTurn).toBe(false);
    expect(result.state.location.settlementId).toBe("hamlet");
  });

  it("refuses when the fare can't be paid", () => {
    const { state, town } = withTwoWaypoints();
    const poor: GameState = { ...state, character: { ...state.character, gold: 0 } };
    const result = fastTravelTo(poor, town.id);
    expect(result.spendTurn).toBe(false);
    expect(result.state).toBe(poor);
  });

  it("can't be boarded from the open wilds", () => {
    const { state } = withTwoWaypoints();
    const wild: GameState = {
      ...state,
      location: { hex: { q: 1, r: 1 }, settlementId: null },
    };
    expect(fastTravelOrigin(wild)).toBeNull();
  });

  it("a horse halves the carter's fare", () => {
    const { state, town } = withTwoWaypoints();
    const walking = fastTravelCost(state, "hamlet", town.id);
    const mounted = fastTravelCost(
      { ...state, character: { ...state.character, horse: "rouncey" } },
      "hamlet",
      town.id,
    );
    expect(mounted).toBe(Math.max(1, Math.round(walking / 2)));
  });
});

// --- Horses ---------------------------------------------------------------------

describe("horses", () => {
  it("towns stable a rouncey; cities also a courser; hamlets none", () => {
    const s = fresh();
    const hamletStock = shopStockFor(s.map.settlements.find((st) => st.id === "hamlet")!);
    const townStock = shopStockFor(townOf(s));
    const cityStock = shopStockFor(cityOf(s));
    expect(hamletStock.some((r) => r.kind === "horse")).toBe(false);
    expect(townStock.some((r) => r.kind === "horse" && r.id === "rouncey")).toBe(true);
    expect(cityStock.some((r) => r.kind === "horse" && r.id === "courser")).toBe(true);
  });

  it("buying a horse sets the mount and buying a better one trades the old in", () => {
    let s = standIn(fresh(), townOf(fresh()));
    s = { ...s, character: { ...s.character, gold: 1000 } };
    const bought = buy(s, { kind: "horse", id: "rouncey" });
    expect(bought.character.horse).toBe("rouncey");
    expect(bought.character.gold).toBeLessThan(1000);

    const upgraded = buy(bought, { kind: "horse", id: "courser" });
    expect(upgraded.character.horse).toBe("courser");
    // Part-exchange: paid less than the courser's full price.
    expect(bought.character.gold - upgraded.character.gold).toBeLessThan(HORSES.courser.price);

    // Re-buying the same horse is a no-op (already owned).
    expect(buy(upgraded, { kind: "horse", id: "courser" })).toBe(upgraded);
  });

  it("a mounted traveler covers more of the map per turn", () => {
    const s = { ...fresh(), mapOpen: true };
    const afoot = reachableHexes(s);
    expect(afoot.every((h) => hexDistance(h, s.location.hex) <= 1)).toBe(true);

    const mounted: GameState = { ...s, character: { ...s.character, horse: "courser" } };
    const reach = reachableHexes(mounted);
    const far = reach.find((h) => hexDistance(h, s.location.hex) === 2);
    expect(far).toBeDefined();

    // An unmounted character can't make that same 2-hex hop…
    expect(moveTo(s, far!).spendTurn).toBe(false);
    expect(moveTo(s, far!).state.location.hex).toEqual(s.location.hex);

    // …but a mounted one arrives (or is interrupted by an encounter there).
    const ride = moveTo(mounted, far!);
    expect(ride.state.location.hex).toEqual(far);
    expect(ride.spendTurn || ride.state.roadEncounter !== null).toBe(true);

    // The ground ridden through is revealed, not just the destination.
    expect(ride.state.discovered).toContain(hexKey(far!));
  });

  it("the heir keeps the family horse", async () => {
    const { succeed } = await import("../src/game/succession");
    const { die } = await import("../src/game/succession");
    let s = fresh();
    s = {
      ...s,
      character: {
        ...s.character,
        horse: "rouncey",
        children: [
          {
            name: "Kid",
            gender: "male" as const,
            attributes: { STR: 2, AGI: 2, SMT: 2, CHA: 2 },
            birthDay: s.day - 200,
            alive: true,
          },
        ],
      },
    };
    const dead = die(s, "testing");
    expect(dead.pendingSuccession).not.toBeNull();
    const next = succeed(dead, 0);
    expect(next.character.horse).toBe("rouncey");
  });
});

// --- Eating & drinking -------------------------------------------------------------

describe("useConsumable", () => {
  it("eating a ration cleanses hunger and heals, without spending a turn", () => {
    let s = fresh();
    s = {
      ...s,
      character: {
        ...s.character,
        hunger: 60,
        hp: s.character.maxHp - 10,
        inventory: { ration: 2 },
      },
    };
    const after = useConsumable(s, "ration");
    expect(after.character.hunger).toBe(20);
    expect(after.character.hp).toBe(s.character.hp + 7);
    expect(after.character.inventory.ration).toBe(1);
    expect(after.turn).toBe(s.turn);
  });

  it("a waterskin restores stamina", () => {
    let s = fresh();
    s = { ...s, character: { ...s.character, stamina: 40, inventory: { waterskin: 1 } } };
    const after = useConsumable(s, "waterskin");
    expect(after.character.stamina).toBe(70);
    expect(after.character.inventory.waterskin).toBe(0);
  });

  it("refuses combat-only items, empty slots, and use mid-fight", () => {
    const s = fresh();
    const bombed: GameState = {
      ...s,
      character: { ...s.character, inventory: { smoke_bomb: 1 } },
    };
    expect(useConsumable(bombed, "smoke_bomb")).toBe(bombed);
    expect(useConsumable(s, "hearty_meal")).toBe(s); // none held
    const fighting = { ...bombed, combat: {} as GameState["combat"] };
    expect(useConsumable(fighting as GameState, "ration")).toBe(fighting);
  });
});

// --- The new faces of the wider world ------------------------------------------------

describe("new NPCs", () => {
  it("Maren, Sera, and Bram each keep to their own settlement", () => {
    const s = fresh();
    const hamlets = s.map.settlements.filter((st) => st.kind === "hamlet");
    const towns = s.map.settlements.filter((st) => st.kind === "town");
    const cities = s.map.settlements.filter((st) => st.kind === "city");
    expect(npcSettlementId(s, NPCS.maren)).toBe(hamlets[1].id);
    expect(npcSettlementId(s, NPCS.sera)).toBe(towns[1].id);
    expect(npcSettlementId(s, NPCS.bram)).toBe(cities[1].id);
    // Nobody shares a roof with the old cast.
    expect(npcSettlementId(s, NPCS.maren)).not.toBe(npcSettlementId(s, NPCS.mira));
    expect(npcSettlementId(s, NPCS.sera)).not.toBe(npcSettlementId(s, NPCS.valdis));
    expect(npcSettlementId(s, NPCS.bram)).not.toBe(npcSettlementId(s, NPCS.voss));
  });

  it("the Long Road quest counts only first visits to settlements", () => {
    let s = fresh();
    s = { ...s, quests: { the_long_road: { status: "active", progress: 0 } } };
    const [town, city] = [townOf(s), cityOf(s)];

    s = enterTown({ ...s, townPrompt: town.id, location: { hex: town.hex, settlementId: null } });
    expect(s.quests.the_long_road.progress).toBe(1);

    // A settlement already visited doesn't count twice.
    s = enterTown({ ...s, townPrompt: town.id, location: { hex: town.hex, settlementId: null } });
    expect(s.quests.the_long_road.progress).toBe(1);

    s = enterTown({ ...s, townPrompt: city.id, location: { hex: city.hex, settlementId: null } });
    expect(s.quests.the_long_road.progress).toBe(2);
  });
});

// --- Migration -----------------------------------------------------------------------

describe("v15 → v16 migration", () => {
  function asV15(state: GameState): any {
    const s: any = JSON.parse(JSON.stringify(state));
    delete s.waypoints;
    delete s.character.horse;
    s.version = 15;
    return s;
  }

  it("redraws the world to the new size and grants waypoints and an empty stable", () => {
    const old = asV15(fresh());
    const restored = parseSave(JSON.stringify({ app: "hearthbound", version: 15, state: old }));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.character.horse).toBeNull();
    expect(restored.waypoints).toContain("hamlet");
    expect(restored.map.radius).toBe(MAP_RADIUS);
    expect(restored.location).toEqual({ hex: { q: 0, r: 0 }, settlementId: "hamlet" });
    expect(restored.map.settlements.length).toBeGreaterThan(8); // the bigger world
  });

  it("leaves a save that's mid-fight on its old map until the trouble resolves", () => {
    const base = fresh();
    const old = asV15(base);
    old.combat = { enemies: [], target: 0, round: 1, over: false, events: [] };
    const restored = parseSave(JSON.stringify({ app: "hearthbound", version: 15, state: old }));
    expect(restored.map).toEqual(base.map); // untouched
    expect(restored.waypoints).toContain("hamlet");
    expect(restored.character.horse).toBeNull();
  });
});
