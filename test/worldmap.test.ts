// ---------------------------------------------------------------------------
// worldmap.test.ts — the regional hex map generator (the "bigger world" arc).
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  generateWorldMap,
  hexDistance,
  hexKey,
  hexNeighbors,
  nearestSettlementDistance,
} from "../src/game/worldmap";
import { CITY_COUNT, MAP_RADIUS, MIN_SETTLEMENT_DISTANCE, TOWN_COUNT } from "../src/game/config";

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

  it("places 1 hamlet + TOWN_COUNT towns + CITY_COUNT cities, each uniquely named", () => {
    const { map } = generateWorldMap(42);
    expect(map.settlements).toHaveLength(1 + TOWN_COUNT + CITY_COUNT);
    const towns = map.settlements.filter((s) => s.kind === "town");
    const cities = map.settlements.filter((s) => s.kind === "city");
    expect(towns).toHaveLength(TOWN_COUNT);
    expect(cities).toHaveLength(CITY_COUNT);
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
