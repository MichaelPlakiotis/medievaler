// ---------------------------------------------------------------------------
// lichisland.test.ts — the sea update: an ocean past the continent's edge,
// harbors with boats between them, the lich's island holding Varek's Spire
// (reachable only by water, free of random encounters), and the generational
// boss fight — Varek never heals, so every character's damage carries to the
// next of the line.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { finishCombat, newGame, sail, sleep } from "../src/game/engine";
import { moveTo, sailCost, sailOrigin, sailTo } from "../src/game/travel";
import { startCombat } from "../src/game/combat";
import { ENEMIES } from "../src/game/enemies";
import {
  hexDistance,
  hexKey,
  hexNeighbors,
  isLichIsland,
  isWater,
} from "../src/game/worldmap";
import { parseSave } from "../src/game/save";
import { CONTINENT_RADIUS, SAVE_VERSION } from "../src/game/config";
import type { Attributes, CombatState, GameState, HexCoord } from "../src/game/types";

const build: Attributes = { STR: 3, AGI: 3, SMT: 2, CHA: 1 };

function fresh(seed = 11): GameState {
  return newGame("Rover", build, seed);
}

// --- The map's new shape --------------------------------------------------------

describe("the sea and the island", () => {
  it("everything past the continent's edge is water, except the lich's island", () => {
    const s = fresh();
    for (const key of Object.keys(s.map.terrain)) {
      const [q, r] = key.split(",").map(Number);
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= CONTINENT_RADIUS) continue;
      if (s.map.lichIsland.includes(key)) {
        expect(s.map.terrain[key]).not.toBe("water");
      } else {
        expect(s.map.terrain[key]).toBe("water");
      }
    }
    expect(s.map.lichIsland.length).toBeGreaterThan(0);
  });

  it("the Spire stands on the island, and no walk from home can reach it", () => {
    const s = fresh();
    const spire = s.map.sites.find((st) => st.id === "spire")!;
    expect(isLichIsland(s.map, spire.hex)).toBe(true);

    // Flood-fill the land from the origin: the island is never touched.
    const seen = new Set<string>([hexKey({ q: 0, r: 0 })]);
    const queue: HexCoord[] = [{ q: 0, r: 0 }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of hexNeighbors(cur)) {
        const k = hexKey(n);
        if (seen.has(k) || s.map.terrain[k] === undefined || isWater(s.map, n)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    for (const k of s.map.lichIsland) expect(seen.has(k)).toBe(false);
  });

  it("harbors: three on the mainland coast, one landing on the island", () => {
    const s = fresh();
    const island = s.map.ports.filter((p) => p.id === "port_island");
    const mainland = s.map.ports.filter((p) => p.id !== "port_island");
    expect(island).toHaveLength(1);
    expect(mainland.length).toBeGreaterThanOrEqual(3);
    expect(isLichIsland(s.map, island[0].hex)).toBe(true);
    for (const p of mainland) {
      expect(isWater(s.map, p.hex)).toBe(false);
      // Each mainland port faces the open sea.
      const sea = hexNeighbors(p.hex).some(
        (n) => isWater(s.map, n) && hexDistance(n, { q: 0, r: 0 }) > CONTINENT_RADIUS,
      );
      expect(sea).toBe(true);
    }
  });
});

// --- Sailing --------------------------------------------------------------------

describe("sailing between ports", () => {
  function atPort(state: GameState, portId: string): GameState {
    const port = state.map.ports.find((p) => p.id === portId)!;
    return { ...state, location: { hex: port.hex, settlementId: null } };
  }

  it("carries you port to port for a fare and a turn — including to the island", () => {
    let s = fresh();
    s = atPort({ ...s, character: { ...s.character, gold: 500 } }, "port_0");
    expect(sailOrigin(s)).toBe("port_0");

    const cost = sailCost(s, "port_0", "port_island");
    const after = sail(s, "port_island");
    const landing = s.map.ports.find((p) => p.id === "port_island")!;
    expect(after.location.hex).toEqual(landing.hex);
    expect(after.character.gold).toBe(500 - cost);
    expect(after.turn).toBe(s.turn + 1);
    expect(after.roadEncounter).toBeNull(); // the sea rolls no dice
  });

  it("no boat without a port underfoot, no passage without the fare", () => {
    const s = fresh(); // standing in the hamlet, not at a harbor
    expect(sailOrigin(s)).toBeNull();
    expect(sailTo(s, "port_island").spendTurn).toBe(false);

    const broke = atPort({ ...fresh(), character: { ...fresh().character, gold: 0 } }, "port_0");
    expect(sailTo(broke, "port_island").spendTurn).toBe(false);
  });

  it("leaving the island is free — a beaten challenger is never stranded", () => {
    let s = fresh();
    s = atPort({ ...s, character: { ...s.character, gold: 0 } }, "port_island");
    expect(sailCost(s, "port_island", "port_0")).toBe(0);
    const home = sailTo(s, "port_0");
    expect(home.spendTurn).toBe(true);
    expect(home.state.location.hex).toEqual(s.map.ports.find((p) => p.id === "port_0")!.hex);
  });

  it("the island rolls no encounters and its nights bring no ambush or thief", () => {
    let s = fresh();
    const landing = s.map.ports.find((p) => p.id === "port_island")!;
    s = { ...s, mapOpen: true, location: { hex: landing.hex, settlementId: null } };
    const targets = hexNeighbors(landing.hex).filter((n) => isLichIsland(s.map, n));
    expect(targets.length).toBeGreaterThan(0);

    for (let seed = 1; seed < 150; seed++) {
      const result = moveTo({ ...s, rngSeed: seed }, targets[0]);
      expect(result.state.roadEncounter).toBeNull();
      expect(result.spendTurn).toBe(true);
    }

    // A night on the island: no ambush fight, no robbery, across many seeds.
    for (let seed = 1; seed < 150; seed++) {
      const rich = {
        ...s,
        rngSeed: seed,
        character: { ...s.character, gold: 100 },
      };
      const morning = sleep(rich);
      expect(morning.combat).toBeNull();
      expect(morning.nightAmbush).toBe(false);
      expect(morning.character.gold).toBe(100); // nothing was stolen
    }
  });
});

// --- The generational lich fight ---------------------------------------------------

describe("the Spire's gates", () => {
  it("opens to a first-generation character — no quest required", async () => {
    const { enterSite } = await import("../src/game/dungeon");
    const s = fresh();
    const spire = s.map.sites.find((st) => st.id === "spire")!;
    const there: GameState = { ...s, location: { hex: spire.hex, settlementId: null } };
    expect(there.quests.the_pale_architect).toBeUndefined(); // gen 1, no saga quest
    const inside = enterSite(there);
    expect(inside.dungeon).not.toBeNull();
    expect(inside.dungeon!.name).toBe("Varek's Spire");
    expect(inside.dungeon!.siteId).toBe("spire");
  });
});

describe("Varek Ashveil, who does not heal", () => {
  it("is a wall no first character should breach", () => {
    expect(ENEMIES.varek_ashveil.maxHp).toBeGreaterThanOrEqual(250);
    expect(ENEMIES.varek_ashveil.armor).toBeGreaterThanOrEqual(5);
  });

  it("a new game meets him whole", () => {
    const s = fresh();
    expect(s.lichHp).toBe(ENEMIES.varek_ashveil.maxHp);
    const fight = startCombat(s, ENEMIES.varek_ashveil);
    expect(fight.combat!.enemies[0].hp).toBe(ENEMIES.varek_ashveil.maxHp);
  });

  it("rises already wounded when the line has hurt him before", () => {
    const s: GameState = { ...fresh(), lichHp: 120 };
    const fight = startCombat(s, ENEMIES.varek_ashveil);
    expect(fight.combat!.enemies[0].hp).toBe(120);
    expect(fight.log.some((l) => l.text.includes("your line's work"))).toBe(true);
  });

  it("keeps every wound when the fight ends — however it ends", () => {
    const base = fresh();
    const combat: CombatState = {
      enemies: [{ ...ENEMIES.varek_ashveil, hp: 80, defending: false }],
      target: 0,
      round: 9,
      over: true,
      outcome: "fled",
      events: [],
    };
    const after = finishCombat({ ...base, combat });
    expect(after.lichHp).toBe(80);

    // Even when the fight kills the challenger, the heir inherits the damage.
    const fatal: CombatState = { ...combat, outcome: "killed", slainBy: "Varek Ashveil" };
    const afterDeath = finishCombat({ ...base, combat: fatal });
    expect(afterDeath.lichHp).toBe(80);
  });

  it("his death ends the saga even with no quest active", () => {
    const base = fresh();
    const slain: CombatState = {
      enemies: [{ ...ENEMIES.varek_ashveil, hp: 0, defending: false }],
      target: 0,
      round: 30,
      over: true,
      outcome: "won",
      events: [],
    };
    const after = finishCombat({ ...base, combat: slain });
    expect(after.lichHp).toBe(0);
    expect(after.victory).toBe("won");
  });
});

// --- Migration ----------------------------------------------------------------------

describe("v16 → v17 migration", () => {
  function asV16(state: GameState): any {
    const s: any = JSON.parse(JSON.stringify(state));
    delete s.lichHp;
    delete s.map.ports;
    delete s.map.lichIsland;
    s.version = 16;
    return s;
  }

  it("redraws the coastline, raises the island, and wakes Varek at full strength", () => {
    const old = asV16(fresh());
    const restored = parseSave(JSON.stringify({ app: "hearthbound", version: 16, state: old }));
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.lichHp).toBe(ENEMIES.varek_ashveil.maxHp);
    expect(restored.map.ports.length).toBeGreaterThanOrEqual(4);
    expect(restored.map.lichIsland.length).toBeGreaterThan(0);
  });

  it("a save mid-fight keeps its old landlocked world, gaining only the new fields", () => {
    const base = fresh();
    const old = asV16(base);
    old.combat = { enemies: [], target: 0, round: 1, over: false, events: [] };
    const restored = parseSave(JSON.stringify({ app: "hearthbound", version: 16, state: old }));
    expect(restored.map.settlements).toEqual(base.map.settlements);
    expect(restored.map.ports).toEqual([]);
    expect(restored.map.lichIsland).toEqual([]);
    expect(restored.lichHp).toBe(300);
  });
});
