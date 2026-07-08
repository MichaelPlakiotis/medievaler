// ---------------------------------------------------------------------------
// worldmap.ts — the regional hex map (the "bigger world" arc). Generated once
// per run from the game's seed, so it's reproducible like everything else that
// flows through rng.ts. Pure data + pure helpers; the canvas rendering lives
// in src/scene/mapScene.ts, travel rules in travel.ts.
//
// Generation order matters: terrain → lakes (impassable water) → settlements
// (land-only, all on the origin's connected land mass) → per-settlement
// structures → roads (BFS shortest paths over land linking every settlement).
//
// Axial hex coordinates (q, r) — see https://www.redblobgames.com/grids/hexagons/
// for the geometry this leans on (neighbor offsets, cube-distance formula).
// ---------------------------------------------------------------------------

import {
  CITY_COUNT,
  HAMLET_COUNT,
  LAKE_COUNT,
  LAKE_SIZE_MAX,
  LAKE_SIZE_MIN,
  MAP_RADIUS,
  MIN_SETTLEMENT_DISTANCE,
  RUIN_SITE_COUNT,
  SITE_MIN_SETTLEMENT_DIST,
  SITE_MIN_SITE_DIST,
  TOWN_COUNT,
  TOWN_FORGE_CHANCE,
} from "./config";
import { chance, randInt } from "./rng";
import type { HexCoord, RuinSite, Settlement, StructureKind, TerrainKind, WorldMap } from "./types";

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

const HAMLET_NAMES = ["Dewfield", "Bramblewick", "Fernsby"];
const TOWN_NAMES = ["Stonevale", "Ashford", "Millhaven", "Oakhurst", "Redmoor"];
const CITY_NAMES = ["Kingsreach", "Highmarket", "Vellamere"];

/** How far (hex distance) the nearest settlement is from a given hex. */
export function nearestSettlementDistance(map: WorldMap, hex: HexCoord): number {
  let best = Infinity;
  for (const s of map.settlements) best = Math.min(best, hexDistance(hex, s.hex));
  return best;
}

/** The settlement a character is standing in, or null if out on the road. */
export function settlementOf(map: WorldMap, settlementId: string | null): Settlement | null {
  if (!settlementId) return null;
  return map.settlements.find((s) => s.id === settlementId) ?? null;
}

/** Just the tier — the common case for gating tier-scaled content. */
export function settlementKindOf(
  map: WorldMap,
  settlementId: string | null,
): Settlement["kind"] | null {
  return settlementOf(map, settlementId)?.kind ?? null;
}

/** Does this settlement have a given building? Missing = action not offered. */
export function hasStructure(settlement: Settlement | null, kind: StructureKind): boolean {
  return settlement?.structures.includes(kind) ?? false;
}

/** Is this hex water (impassable)? */
export function isWater(map: WorldMap, hex: HexCoord): boolean {
  return map.terrain[hexKey(hex)] === "water";
}

/** Does this hex carry a road (safe travel)? */
export function isRoad(map: WorldMap, hex: HexCoord): boolean {
  return map.roads.includes(hexKey(hex));
}

/** Fisher-Yates, seeded — so each map draws settlement names in a different
 *  (but reproducible) order instead of always picking the pool's front. */
function shuffled<T>(seed: number, items: T[]): { list: T[]; seed: number } {
  const list = [...items];
  let s = seed;
  for (let i = list.length - 1; i > 0; i--) {
    const roll = randInt(s, 0, i);
    s = roll.seed;
    [list[i], list[roll.value]] = [list[roll.value], list[i]];
  }
  return { list, seed: s };
}

/** Stamp LAKE_COUNT water blobs onto the terrain, keeping the origin (and a
 *  ring around it) dry so Lazy Springs never drowns. Mutates `terrain`. */
function stampLakes(
  terrain: Record<string, TerrainKind>,
  seed: number,
): number {
  let s = seed;
  for (let i = 0; i < LAKE_COUNT; i++) {
    // Center at least a third of the map out from the origin.
    let center: HexCoord = { q: 0, r: 0 };
    for (let attempt = 0; attempt < 50; attempt++) {
      const qRoll = randInt(s, -MAP_RADIUS + 2, MAP_RADIUS - 2);
      s = qRoll.seed;
      const rMin = Math.max(-MAP_RADIUS + 2, -qRoll.value - MAP_RADIUS + 2);
      const rMax = Math.min(MAP_RADIUS - 2, -qRoll.value + MAP_RADIUS - 2);
      const rRoll = randInt(s, rMin, rMax);
      s = rRoll.seed;
      const c = { q: qRoll.value, r: rRoll.value };
      if (hexDistance(c, { q: 0, r: 0 }) >= 4) {
        center = c;
        break;
      }
    }
    if (center.q === 0 && center.r === 0) continue; // never found a spot — skip
    const sizeRoll = randInt(s, LAKE_SIZE_MIN, LAKE_SIZE_MAX);
    s = sizeRoll.seed;
    for (const h of hexesInRadius(MAP_RADIUS)) {
      if (hexDistance(h, center) <= sizeRoll.value && hexDistance(h, { q: 0, r: 0 }) >= 3) {
        terrain[hexKey(h)] = "water";
      }
    }
  }
  return s;
}

/** All land hexes reachable from the origin without crossing water. */
function landComponent(terrain: Record<string, TerrainKind>): Set<string> {
  const reachable = new Set<string>();
  const queue: HexCoord[] = [{ q: 0, r: 0 }];
  reachable.add(hexKey({ q: 0, r: 0 }));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const k = hexKey(n);
      if (reachable.has(k)) continue;
      const t = terrain[k];
      if (t === undefined || t === "water") continue; // off-map or wet
      reachable.add(k);
      queue.push(n);
    }
  }
  return reachable;
}

/**
 * Find a hex at least MIN_SETTLEMENT_DISTANCE from every settlement placed so
 * far, on the origin's land mass, via a bounded random search; falls back to
 * the farthest valid candidate seen if nothing clears the minimum outright.
 */
function placeSettlement(
  seed: number,
  settlements: Settlement[],
  land: Set<string>,
): { hex: HexCoord; seed: number } {
  let s = seed;
  let best: HexCoord | null = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < 400; attempt++) {
    const qRoll = randInt(s, -MAP_RADIUS, MAP_RADIUS);
    s = qRoll.seed;
    const rMin = Math.max(-MAP_RADIUS, -qRoll.value - MAP_RADIUS);
    const rMax = Math.min(MAP_RADIUS, -qRoll.value + MAP_RADIUS);
    const rRoll = randInt(s, rMin, rMax);
    s = rRoll.seed;
    const candidate: HexCoord = { q: qRoll.value, r: rRoll.value };
    if (!land.has(hexKey(candidate))) continue; // water, or cut off by it

    const minDist = Math.min(...settlements.map((st) => hexDistance(candidate, st.hex)));
    if (minDist >= MIN_SETTLEMENT_DISTANCE) return { hex: candidate, seed: s };
    if (minDist > bestScore) {
      bestScore = minDist;
      best = candidate;
    }
  }
  return { hex: best ?? { q: 0, r: 1 }, seed: s };
}

/** Which buildings a settlement of this tier gets (GDD §5.1 / user design):
 *  every settlement lives around a tavern and a well/market; a hamlet's one
 *  structure beyond that is its forge; towns always keep a church and usually
 *  a forge; cities have everything. */
function rollStructures(
  kind: Settlement["kind"],
  seed: number,
): { structures: StructureKind[]; seed: number } {
  const base: StructureKind[] = ["tavern", "well"];
  if (kind === "hamlet") return { structures: [...base, "forge"], seed };
  if (kind === "town") {
    const forgeRoll = chance(seed, TOWN_FORGE_CHANCE);
    const structures: StructureKind[] = [...base, "church"];
    if (forgeRoll.value) structures.push("forge");
    return { structures, seed: forgeRoll.seed };
  }
  return { structures: [...base, "forge", "church", "university", "brothel"], seed };
}

/** BFS shortest path over land from one hex to another (water is a wall).
 *  Deterministic — fixed neighbor order, no randomness. */
function landPath(
  from: HexCoord,
  to: HexCoord,
  terrain: Record<string, TerrainKind>,
): HexCoord[] {
  const startKey = hexKey(from);
  const goalKey = hexKey(to);
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  const queue: HexCoord[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (hexKey(cur) === goalKey) break;
    for (const n of hexNeighbors(cur)) {
      const k = hexKey(n);
      if (cameFrom.has(k)) continue;
      const t = terrain[k];
      if (t === undefined || t === "water") continue;
      cameFrom.set(k, hexKey(cur));
      queue.push(n);
    }
  }
  if (!cameFrom.has(goalKey)) return []; // unreachable (shouldn't happen — same land mass)
  const path: HexCoord[] = [];
  let k: string | null = goalKey;
  while (k !== null) {
    const [q, r] = k.split(",").map(Number);
    path.push({ q, r });
    k = cameFrom.get(k) ?? null;
  }
  return path.reverse();
}

/** Link every settlement into one road network: each connects to the nearest
 *  already-connected settlement by a BFS land path. */
function buildRoads(settlements: Settlement[], terrain: Record<string, TerrainKind>): string[] {
  const roads = new Set<string>();
  const connected: Settlement[] = [settlements[0]];
  for (const s of settlements.slice(1)) {
    let nearest = connected[0];
    for (const c of connected) {
      if (hexDistance(s.hex, c.hex) < hexDistance(s.hex, nearest.hex)) nearest = c;
    }
    for (const h of landPath(s.hex, nearest.hex, terrain)) roads.add(hexKey(h));
    connected.push(s);
  }
  return [...roads];
}

const RUIN_NAMES = [
  "the Howling Cairn",
  "Wyrmstone Delve",
  "the Pale King's Vault",
  "Gallows Deep",
  "the Weeping Halls",
  "Thornroot Hollow",
];

/** The ruin the character is standing on, if any. */
export function siteAt(map: WorldMap, hex: HexCoord): RuinSite | null {
  return map.sites.find((s) => s.hex.q === hex.q && s.hex.r === hex.r) ?? null;
}

/**
 * Scatter RUIN_SITE_COUNT explorable ruins across an existing map: on land,
 * never on a road or a settlement, at least SITE_MIN_SETTLEMENT_DIST from any
 * settlement and SITE_MIN_SITE_DIST from each other. Exported separately from
 * generateWorldMap so the save migration can add ruins to an older world
 * without regenerating it. Pure — returns the sites and the advanced seed.
 */
export function placeSites(
  map: Omit<WorldMap, "sites">,
  seed: number,
): { sites: RuinSite[]; seed: number } {
  let s = seed;
  const roads = new Set(map.roads);
  const names = shuffled(s, RUIN_NAMES);
  s = names.seed;
  const sites: RuinSite[] = [];

  for (let i = 0; i < RUIN_SITE_COUNT; i++) {
    let best: HexCoord | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 300; attempt++) {
      const qRoll = randInt(s, -map.radius, map.radius);
      s = qRoll.seed;
      const rMin = Math.max(-map.radius, -qRoll.value - map.radius);
      const rMax = Math.min(map.radius, -qRoll.value + map.radius);
      const rRoll = randInt(s, rMin, rMax);
      s = rRoll.seed;
      const candidate: HexCoord = { q: qRoll.value, r: rRoll.value };
      const key = hexKey(candidate);
      if (map.terrain[key] === undefined || map.terrain[key] === "water") continue;
      if (roads.has(key)) continue; // ruins hide OFF the beaten path
      const settlementDist = Math.min(
        ...map.settlements.map((st) => hexDistance(candidate, st.hex)),
      );
      if (settlementDist < SITE_MIN_SETTLEMENT_DIST) continue;
      const siteDist =
        sites.length === 0
          ? Infinity
          : Math.min(...sites.map((st) => hexDistance(candidate, st.hex)));
      if (siteDist >= SITE_MIN_SITE_DIST) {
        best = candidate;
        break;
      }
      if (siteDist > bestScore) {
        bestScore = siteDist;
        best = candidate;
      }
    }
    if (!best) continue; // hopeless map (shouldn't happen at this size) — fewer ruins
    sites.push({
      id: `site_${i}`,
      name: names.list[i % names.list.length],
      hex: best,
      cleared: false,
    });
  }
  return { sites, seed: s };
}

/**
 * Generate the regional map for a run. The hamlet ("Lazy Springs") always
 * sits at the origin; HAMLET_COUNT more hamlets, TOWN_COUNT towns and
 * CITY_COUNT cities are placed on the same land mass, at least
 * MIN_SETTLEMENT_DISTANCE hexes apart, then joined by roads. Pure and
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
  s = stampLakes(terrain, s);
  const land = landComponent(terrain);

  const settlements: Settlement[] = [];
  function addSettlement(id: string, name: string, kind: Settlement["kind"], hex: HexCoord) {
    const rolled = rollStructures(kind, s);
    s = rolled.seed;
    settlements.push({ id, name, hex, kind, structures: rolled.structures });
  }

  addSettlement("hamlet", "Lazy Springs", "hamlet", { q: 0, r: 0 });

  const hamletNames = shuffled(s, HAMLET_NAMES);
  s = hamletNames.seed;
  for (let i = 0; i < HAMLET_COUNT; i++) {
    const placed = placeSettlement(s, settlements, land);
    s = placed.seed;
    addSettlement(`hamlet_${i}`, hamletNames.list[i % hamletNames.list.length], "hamlet", placed.hex);
  }

  const townNames = shuffled(s, TOWN_NAMES);
  s = townNames.seed;
  for (let i = 0; i < TOWN_COUNT; i++) {
    const placed = placeSettlement(s, settlements, land);
    s = placed.seed;
    addSettlement(`town_${i}`, townNames.list[i % townNames.list.length], "town", placed.hex);
  }

  const cityNames = shuffled(s, CITY_NAMES);
  s = cityNames.seed;
  for (let i = 0; i < CITY_COUNT; i++) {
    const placed = placeSettlement(s, settlements, land);
    s = placed.seed;
    addSettlement(`city_${i}`, cityNames.list[i % cityNames.list.length], "city", placed.hex);
  }

  const roads = buildRoads(settlements, terrain);

  const placed = placeSites({ radius: MAP_RADIUS, settlements, terrain, roads }, s);
  s = placed.seed;

  return {
    map: { radius: MAP_RADIUS, settlements, terrain, roads, sites: placed.sites },
    seed: s,
  };
}
