// ---------------------------------------------------------------------------
// rng.ts — a small seeded random number generator.
//
// Why not just use Math.random()? Because we store the RNG's state inside the
// save file. That makes a run reproducible (great for testing) and keeps all
// randomness flowing through one place we control. This is "mulberry32", a
// tiny, well-known generator — you don't need to understand the bit math.
// ---------------------------------------------------------------------------

/** Advance the seed and return { value in [0,1), nextSeed }. Pure — no globals. */
export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Integer in [min, max] inclusive. Returns the value and the advanced seed. */
export function randInt(
  seed: number,
  min: number,
  max: number,
): { value: number; seed: number } {
  const r = nextRandom(seed);
  const span = max - min + 1;
  return { value: min + Math.floor(r.value * span), seed: r.seed };
}

/** True with probability `chance` (0–1). Returns the result and advanced seed. */
export function chance(
  seed: number,
  probability: number,
): { value: boolean; seed: number } {
  const r = nextRandom(seed);
  return { value: r.value < probability, seed: r.seed };
}
