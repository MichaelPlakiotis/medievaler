// ---------------------------------------------------------------------------
// worldmap.ts — the regional hex map (the "bigger world" arc, Milestone A).
// Generated once per run from the game's seed, so it's reproducible like
// everything else that flows through rng.ts. Pure data + pure helpers; the
// canvas rendering lives in src/scene/mapScene.ts, travel rules in travel.ts.
//
// Axial hex coordinates (q, r) — see https://www.redblobgames.com/grids/hexagons/
// for the geometry this leans on (neighbor offsets, cube-distance formula).
// ---------------------------------------------------------------------------

import { MAP_RADIUS, MIN_SETTLEMENT_DISTANCE, SETTLEMENT_COUNT } from "./config";
import { randInt } from "./rng";
import type { HexCoord, Settlement, TerrainKind, WorldMap } from "./types";

/** A stable string key for a hex, used to index terrain/discovered maps. */
export function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`;
}

/** Hex (cube) distance between two axial coordinates. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** The 6 axial neighbor offsets, pointy-top convention. */
const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(h: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** Every hex within `radius` of the origin (a full hexagonal region). */
function hexesInRadius(radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) out.push({ q, r });
  }
  return out;
}

const TERRAIN_WEIGHTS: [TerrainKind, number][] = [
  ["plains", 50],
  ["forest", 25],
  ["hills", 15],
  ["mountains", 10],
];

function rollTerrain(seed: number): { terrain: TerrainKind; seed: number } {
  const roll = randInt(seed, 0, 99);
  let acc = 0;
  for (const [kind, weight] of TERRAIN_WEIGHTS) {
    acc += weight;
    if (roll.value < acc) return { terrain: kind, seed: roll.seed };
  }
  return { terrain: "plains", seed: roll.seed };
}

const CITY_NAMES = ["Kingsreach", "Highmarket", "Stonevale", "Ashford", "Millhaven"];

/** How far (hex distance) the nearest settlement is from a given hex. */
export function nearestSettlementDistance(map: WorldMap, hex: HexCoord): number {
  let best = Infinity;
  for (const s of map.settlements) best = Math.min(best, hexDistance(hex, s.hex));
  return best;
}

/**
 * Generate the regional map for a run. The hamlet always sits at the origin;
 * additional settlements (SETTLEMENT_COUNT − 1 of them) are placed at least
 * MIN_SETTLEMENT_DISTANCE hexes from the hamlet and from each other. Pure and
 * deterministic — same seed in, same map out.
 */
export function generateWorldMap(seed: number): { map: WorldMap; seed: number } {
  let s = seed;
  const hexes = hexesInRadius(MAP_RADIUS);

  const terrain: Record<string, TerrainKind> = {};
  for (const h of hexes) {
    const rolled = rollTerrain(s);
    s = rolled.seed;
    terrain[hexKey(h)] = rolled.terrain;
  }

  const hamlet: Settlement = { id: "hamlet", name: "the hamlet", hex: { q: 0, r: 0 }, kind: "hamlet" };
  const settlements: Settlement[] = [hamlet];

  const cityCount = Math.max(0, SETTLEMENT_COUNT - 1);
  for (let i = 0; i < cityCount; i++) {
    let best: HexCoord | null = null;
    let bestScore = -1;
    // Bounded search: try random hexes, keep whichever clears the minimum
    // distance from every settlement placed so far; fall back to the
    // farthest candidate seen if nothing clears it outright (a tiny/crowded
    // map shouldn't be able to loop forever).
    for (let attempt = 0; attempt < 200; attempt++) {
      const qRoll = randInt(s, -MAP_RADIUS, MAP_RADIUS);
      s = qRoll.seed;
      const rMin = Math.max(-MAP_RADIUS, -qRoll.value - MAP_RADIUS);
      const rMax = Math.min(MAP_RADIUS, -qRoll.value + MAP_RADIUS);
      const rRoll = randInt(s, rMin, rMax);
      s = rRoll.seed;
      const candidate: HexCoord = { q: qRoll.value, r: rRoll.value };

      const minDist = Math.min(...settlements.map((st) => hexDistance(candidate, st.hex)));
      if (minDist >= MIN_SETTLEMENT_DISTANCE) {
        best = candidate;
        break;
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        best = candidate;
      }
    }
    const hex = best ?? { q: MAP_RADIUS, r: 0 };
    settlements.push({
      id: `city_${i}`,
      name: CITY_NAMES[i % CITY_NAMES.length],
      hex,
      kind: "city",
    });
  }

  return { map: { radius: MAP_RADIUS, settlements, terrain }, seed: s };
}
