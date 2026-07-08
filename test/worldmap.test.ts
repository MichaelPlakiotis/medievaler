// ---------------------------------------------------------------------------
// worldmap.test.ts — the regional hex map generator (the "bigger world" arc).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  generateWorldMap,
  hexDistance,
  hexKey,
  hexNeighbors,
  isRoad,
  isWater,
  nearestSettlementDistance,
} from "../src/game/worldmap";
import {
  CITY_COUNT,
  HAMLET_COUNT,
  MAP_RADIUS,
  MIN_SETTLEMENT_DISTANCE,
  TOWN_COUNT,
} from "../src/game/config";
import type { WorldMap } from "../src/game/types";

describe("hex math", () => {
  it("hexKey is a stable, distinct string per coordinate", () => {
    expect(hexKey({ q: 1, r: -2 })).toBe("1,-2");
    expect(hexKey({ q: 1, r: -2 })).not.toBe(hexKey({ q: -2, r: 1 }));
  });

  it("hexDistance is 0 for the same hex and symmetric", () => {
    const a = { q: 2, r: -3 };
    const b = { q: -1, r: 4 };
    expect(hexDistance(a, a)).toBe(0);
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it("every neighbor is exactly distance 1 away, and there are 6 of them", () => {
    const origin = { q: 0, r: 0 };
    const neighbors = hexNeighbors(origin);
    expect(neighbors).toHaveLength(6);
    for (const n of neighbors) expect(hexDistance(origin, n)).toBe(1);
  });
});

describe("generateWorldMap", () => {
  it("is deterministic: the same seed produces the same map", () => {
    const a = generateWorldMap(1234);
    const b = generateWorldMap(1234);
    expect(a.map).toEqual(b.map);
  });

  it("different seeds produce different maps", () => {
    const a = generateWorldMap(1);
    const b = generateWorldMap(2);
    expect(a.map).not.toEqual(b.map);
  });

  it("always places the hamlet, named Lazy Springs, at the origin", () => {
    const { map } = generateWorldMap(7);
    const hamlet = map.settlements.find((s) => s.id === "hamlet");
    expect(hamlet).toBeDefined();
    expect(hamlet!.hex).toEqual({ q: 0, r: 0 });
    expect(hamlet!.kind).toBe("hamlet");
    expect(hamlet!.name).toBe("Lazy Springs");
  });

  it("places Lazy Springs + HAMLET_COUNT hamlets + TOWN_COUNT towns + CITY_COUNT cities, uniquely named", () => {
    const { map } = generateWorldMap(42);
    expect(map.settlements).toHaveLength(1 + HAMLET_COUNT + TOWN_COUNT + CITY_COUNT);
    expect(map.settlements.filter((s) => s.kind === "hamlet")).toHaveLength(1 + HAMLET_COUNT);
    expect(map.settlements.filter((s) => s.kind === "town")).toHaveLength(TOWN_COUNT);
    expect(map.settlements.filter((s) => s.kind === "city")).toHaveLength(CITY_COUNT);
    const names = map.settlements.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps non-hamlet settlements at least MIN_SETTLEMENT_DISTANCE apart", () => {
    // Search a spread of seeds so a single unlucky bounded search doesn't flake.
    for (let seed = 0; seed < 25; seed++) {
      const { map } = generateWorldMap(seed);
      for (let i = 0; i < map.settlements.length; i++) {
        for (let j = i + 1; j < map.settlements.length; j++) {
          const d = hexDistance(map.settlements[i].hex, map.settlements[j].hex);
          expect(d).toBeGreaterThanOrEqual(MIN_SETTLEMENT_DISTANCE);
        }
      }
    }
  });

  it("covers exactly the hexagonal region of the configured radius", () => {
    const { map } = generateWorldMap(9);
    const expectedCount = 3 * MAP_RADIUS * (MAP_RADIUS + 1) + 1; // hex-grid cell count formula
    expect(Object.keys(map.terrain)).toHaveLength(expectedCount);
  });
});

describe("water & roads", () => {
  it("stamps water onto the map, but never under a settlement", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      const hasWater = Object.values(map.terrain).some((t) => t === "water");
      expect(hasWater).toBe(true);
      for (const s of map.settlements) expect(isWater(map, s.hex)).toBe(false);
    }
  });

  it("keeps the origin and its surroundings dry", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      expect(isWater(map, { q: 0, r: 0 })).toBe(false);
    }
  });

  it("roads never cross water", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      for (const key of map.roads) expect(map.terrain[key]).not.toBe("water");
    }
  });

  it("the road network connects every settlement to every other", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      // BFS over road hexes from the hamlet must reach all settlement hexes.
      const roadSet = new Set(map.roads);
      const start = hexKey(map.settlements[0].hex);
      expect(roadSet.has(start)).toBe(true); // paths terminate on settlements
      const seen = new Set([start]);
      const queue = [map.settlements[0].hex];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const n of hexNeighbors(cur)) {
          const k = hexKey(n);
          if (!seen.has(k) && roadSet.has(k)) {
            seen.add(k);
            queue.push(n);
          }
        }
      }
      for (const s of map.settlements) expect(seen.has(hexKey(s.hex))).toBe(true);
    }
  });

  it("isRoad reports road hexes and rejects the rest", () => {
    const { map } = generateWorldMap(5);
    const [q, r] = map.roads[0].split(",").map(Number);
    expect(isRoad(map, { q, r })).toBe(true);
    // Find some non-road land hex.
    const nonRoad = Object.keys(map.terrain).find(
      (k) => !map.roads.includes(k) && map.terrain[k] !== "water",
    )!;
    const [nq, nr] = nonRoad.split(",").map(Number);
    expect(isRoad(map, { q: nq, r: nr })).toBe(false);
  });
});

describe("settlement structures", () => {
  function byKind(map: WorldMap, kind: string) {
    return map.settlements.filter((s) => s.kind === kind);
  }

  it("every settlement has a tavern and a well", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      for (const s of map.settlements) {
        expect(s.structures).toContain("tavern");
        expect(s.structures).toContain("well");
      }
    }
  });

  it("hamlets get a forge and nothing grander — no church, no city amenities", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      for (const h of byKind(map, "hamlet")) {
        expect(h.structures).toContain("forge");
        expect(h.structures).not.toContain("church");
        expect(h.structures).not.toContain("university");
        expect(h.structures).not.toContain("brothel");
      }
    }
  });

  it("towns always keep a church, may lack a forge, never have city amenities", () => {
    let sawForgeless = false;
    let sawForged = false;
    for (let seed = 0; seed < 60 && !(sawForgeless && sawForged); seed++) {
      const { map } = generateWorldMap(seed);
      for (const t of byKind(map, "town")) {
        expect(t.structures).toContain("church");
        expect(t.structures).not.toContain("university");
        expect(t.structures).not.toContain("brothel");
        if (t.structures.includes("forge")) sawForged = true;
        else sawForgeless = true;
      }
    }
    expect(sawForged).toBe(true);
    expect(sawForgeless).toBe(true); // TOWN_FORGE_CHANCE < 1 must actually bite sometimes
  });

  it("cities have everything", () => {
    for (let seed = 0; seed < 10; seed++) {
      const { map } = generateWorldMap(seed);
      for (const c of byKind(map, "city")) {
        for (const k of ["tavern", "well", "forge", "church", "university", "brothel"]) {
          expect(c.structures).toContain(k);
        }
      }
    }
  });
});

describe("nearestSettlementDistance", () => {
  it("is 0 exactly on a settlement's own hex", () => {
    const { map } = generateWorldMap(3);
    expect(nearestSettlementDistance(map, map.settlements[0].hex)).toBe(0);
  });

  it("returns the true minimum across all settlements", () => {
    const { map } = generateWorldMap(3);
    const far = { q: MAP_RADIUS * 2, r: MAP_RADIUS * 2 }; // outside the map, still well-defined
    const expected = Math.min(...map.settlements.map((s) => hexDistance(far, s.hex)));
    expect(nearestSettlementDistance(map, far)).toBe(expected);
  });
});
