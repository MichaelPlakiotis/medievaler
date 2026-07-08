// @ts-nocheck
// ---------------------------------------------------------------------------
// townScene.ts — the animated pixel-art settlement that sits behind the whole
// game. Every settlement (the hamlet, a town, a city) gets its own generated
// layout — building count, order, and roof styles all vary — seeded
// deterministically from the settlement's id, so a given place always looks
// the same across visits without persisting the layout in the save (same
// philosophy as the world map and dungeon generation in src/game/).
//
// This is the "Medieval Town" live-wallpaper engine (a self-contained canvas
// renderer with Day / Sunset / Night palettes, drifting clouds, and chimney
// smoke), adapted from a one-shot IIFE into a mountable module. The game drives
// its time-of-day to match the day / dusk / night cycle.
//
// It's deliberately kept as loose, fast canvas code (hence @ts-nocheck) — it's a
// renderer, not game logic. The public surface is just mountTownScene().
// ---------------------------------------------------------------------------

import { drawHero, villagerLook, type HeroLook } from "./sprites";

export type TimeOfDay = "Day" | "Sunset" | "Night";

/** The bits of a Settlement (src/game/types.ts) the scene actually needs. */
export interface SceneSettlement {
  id: string;
  kind: "hamlet" | "town" | "city";
  /** Which buildings this settlement actually has (forge/church/university/…). */
  structures: string[];
}

export interface TownSceneHandle {
  /** Switch the scene between Day, Sunset (dusk), and Night. */
  setTimeOfDay(mode: TimeOfDay): void;
  /** Put the player's paper-doll in the town (or remove it with null). */
  setHero(look: HeroLook | null): void;
  /** Send the hero walking to a named spot (action ids; "idle" = loiter). */
  heroGoTo(spotId: string): void;
  /** (Re)generate for a settlement — its own building layout & population.
   *  `ownedHomes` decides whether the home lot renders built-up here. */
  setSettlement(settlement: SceneSettlement, ownedHomes: string[]): void;
  /** Stop the animation loop and release the frame. */
  destroy(): void;
}

/** Population & building-count by settlement tier. */
var TIER_INFO = {
  hamlet: { fillerHouses: 1, npcCount: 3, waitMin: 2200, waitMax: 4200 },
  town: { fillerHouses: 2, npcCount: 6, waitMin: 1600, waitMax: 3400 },
  // Cities spend their width budget on the university & pleasure house, so
  // fewer anonymous filler houses.
  city: { fillerHouses: 1, npcCount: 10, waitMin: 900, waitMax: 2200 },
};

// --- per-settlement layout generation (module scope, so the DOM hotspot layer
// can ask "where IS the forge here?" through hotspotAnchors below and never
// drift from what the canvas draws) ------------------------------------------
var WIDTH_BUDGET = 460; // leave a little margin either side of the 480px canvas

function sceneRng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function sceneHash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }

/** Generate a settlement's building layout — seeded from its id, so the same
 *  place always looks the same. Anchors (forge, tavern, church, …) keep fixed
 *  roles; a greedy left-to-right packer fills the width with a tier-driven
 *  number of randomized houses, occasionally leaving a dark alley gap. */
export function computeTownLayout(settlement, ownedHomes) {
  var r = sceneRng(sceneHash(settlement.id));
  var tier = TIER_INFO[settlement.kind] || TIER_INFO.hamlet;
  var structures = settlement.structures || [];
  var homes = ownedHomes || [];
  function has(kind) { return structures.indexOf(kind) >= 0; }
  var slots = [];
  var x = 4;

  function place(type, w, extra) {
    if (slots.length > 0 && x + w <= WIDTH_BUDGET - 60 && r() > 0.55) {
      var gap = 8 + Math.floor(r() * 12);
      slots[slots.length - 1].alleyAfter = true;
      x += gap;
    }
    var slot = { type: type, x: x, w: w };
    for (var k in extra) slot[k] = extra[k];
    slots.push(slot);
    x += w;
    return slot;
  }

  // The forge and tavern only go up where the settlement actually has them
  // (a churchless, forgeless hamlet is just houses around a well).
  var forgeSlot = has("forge") ? place("forge", 66) : null;
  var tavernSlot = has("tavern") ? place("tavern", 74) : null;

  var remaining = [];
  for (var i = 0; i < tier.fillerHouses; i++) {
    remaining.push({
      type: "house",
      w: 40 + Math.floor(r() * 22),
      roof: r() > 0.5 ? "gable" : "eave",
      win: 1 + (r() > 0.5 ? 1 : 0),
    });
  }
  if (has("church")) remaining.push({ type: "church", w: 56 });
  remaining.push({ type: "home", w: 50 });
  if (has("university")) remaining.push({ type: "university", w: 70 });
  if (has("brothel")) remaining.push({ type: "brothel", w: 38 });
  // Seeded shuffle (Fisher–Yates) so the building order varies per settlement.
  for (var i2 = remaining.length - 1; i2 > 0; i2--) {
    var j = Math.floor(r() * (i2 + 1));
    var tmp = remaining[i2]; remaining[i2] = remaining[j]; remaining[j] = tmp;
  }

  var churchSlot = null, homeSlot = null, universitySlot = null, brothelSlot = null;
  for (var i3 = 0; i3 < remaining.length; i3++) {
    var item = remaining[i3];
    // Always place the anchors; filler houses stop once the width budget is
    // spent, so a busy city tier can never overflow.
    if (item.type === "house" && x + item.w > WIDTH_BUDGET) continue;
    if (item.type === "church") churchSlot = place("church", item.w);
    else if (item.type === "home") homeSlot = place("home", item.w, { built: homes.indexOf(settlement.id) >= 0 });
    else if (item.type === "university") universitySlot = place("university", item.w);
    else if (item.type === "brothel") brothelSlot = place("brothel", item.w);
    else if (item.type === "house") place("house", item.w, { roof: item.roof, win: item.win });
  }

  var totalWidth = x;
  var centerX = 4 + totalWidth / 2;
  // A second road exits a different edge per settlement, so towns don't all
  // read as having the exact same way out.
  var altExit = r() > 0.5 ? 70 + Math.floor(r() * 40) : 400 - Math.floor(r() * 40);

  var wellX = Math.min(WIDTH_BUDGET - 40, Math.max(180, Math.round(centerX - 20)));
  // Waypoint fallbacks for structures this settlement lacks: aim at the well.
  var fallbackX = wellX;
  return {
    slots: slots,
    width: totalWidth,
    forgeX: forgeSlot ? forgeSlot.x : fallbackX,
    tavernX: tavernSlot ? tavernSlot.x : fallbackX,
    churchX: churchSlot ? churchSlot.x : fallbackX,
    universityX: universitySlot ? universitySlot.x : fallbackX,
    brothelX: brothelSlot ? brothelSlot.x : fallbackX,
    homeX: homeSlot ? homeSlot.x : fallbackX,
    homeBuilt: !!(homeSlot && homeSlot.built),
    wellX: wellX,
    stall1X: Math.max(70, Math.round(centerX - 130)),
    stall2X: Math.min(WIDTH_BUDGET - 40, Math.round(centerX + 90)),
    altExitX: altExit,
  };
}

/**
 * Where each action's button should hover, in the scene's logical 480×270
 * coordinates — derived from the same layout the canvas draws, so buttons
 * always sit over their buildings no matter how a settlement shuffled them.
 * ActionHotspots.tsx converts these to viewport % (the canvas is object-fit:
 * cover) and falls back to its static table for ids not present here.
 */
export function hotspotAnchors(
  settlement: SceneSettlement,
  ownedHomes: string[],
): Record<string, { x: number; y: number }> {
  var L = computeTownLayout(settlement, ownedHomes);
  var over = 166; // hovering over a building's upper floor
  var ground = 232; // out on the square
  return {
    shop: { x: L.forgeX + 33, y: over },
    tavern: { x: L.tavernX + 37, y: over },
    study: { x: L.churchX + 28, y: over - 8 },
    university: { x: L.universityX + 35, y: over - 6 },
    brothel: { x: L.brothelX + 19, y: over },
    family: { x: L.homeX + 25, y: over },
    movefamily: { x: L.homeX + 25, y: over + 22 },
    work: { x: L.wellX + 20, y: ground + 8 },
    court: { x: L.stall2X + 22, y: ground },
    seeknew: { x: L.stall1X + 22, y: ground + 10 },
    propose: { x: L.stall2X + 22, y: ground - 12 },
    pickpocket: { x: L.stall1X + 22, y: ground },
    burgle: { x: L.tavernX + 60, y: over + 14 },
    alleys: { x: Math.max(60, L.forgeX + 90), y: ground + 6 },
    travel: { x: 16, y: 246 },
    roam: { x: 430, y: 244 },
    hunt: { x: 452, y: 214 },
    delve: { x: 444, y: 168 }, // the barrow arch on the hillside (fixed in the backdrop)
  };
}

/** Mount the animated town onto a canvas element. */
export function mountTownScene(canvas: HTMLCanvasElement): TownSceneHandle {
  "use strict";
  var cv = canvas;
  cv.width = 960;
  cv.height = 540;
  var vctx = cv.getContext("2d");
  vctx.imageSmoothingEnabled = false;

  var LW = 480, LH = 270; // logical art resolution
  var BASE = 196; // ground line — top of the cobbled square
  var clouds = [], puffs = [], emitters = [];
  var hero = null; // { look, x, y, tx, ty, facing, animT, moving }
  var npcs = []; // background townsfolk
  var lastT = 0, spawnT = 0;
  var P; // active palette
  var back, front, log; // offscreen layers
  var rafId = 0, stopped = false;
  var settlement = { id: "hamlet", kind: "hamlet", structures: ["tavern", "well", "forge"] }; // current settlement (scene-only shape)
  var ownedHomes = [];
  var layout = null; // this settlement's generated building layout
  var heroSpots = {}; // derived per-layout — see buildHeroSpots()

  var CONFIG = { timeOfDay: "Day", cloudSpeed: 1, chimneySmoke: true };

  // --- helpers -------------------------------------------------
  function mk() { var c = document.createElement("canvas"); c.width = LW; c.height = LH; return c; }
  function R(ctx, x, y, w, h, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
  var rng = sceneRng, hashString = sceneHash;
  void hashString; // (kept for parity; the layout generator hashes ids itself now)
  // Shared walk-toward-target step, used by both the hero and background NPCs.
  function stepWalker(w, dt, speed) {
    var dx = w.tx - w.x, dy = w.ty - w.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var step = speed * dt;
    if (dist > 1.5) {
      w.x += (dx / dist) * Math.min(step, dist);
      w.y += (dy / dist) * Math.min(step, dist);
      if (Math.abs(dx) > 2) w.facing = dx >= 0 ? 1 : -1;
      w.moving = true;
    } else {
      w.moving = false;
    }
    w.animT += dt;
  }
  function hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { var A = hx(a), B = hx(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")"; }

  // --- palettes ------------------------------------------------
  function pal(mode) {
    if (mode === "Night") return {
      skyTop: "#141a33", skyHz: "#3a4a72", stars: true, moon: true,
      hillFar: "#26324e", hill: "#1d2a1f", hillDark: "#141d16", distant: "#2b3550",
      grass: "#22331f", cobble: "#4b4a52", cobbleLt: "#5c5b64", cobbleDk: "#37363d", joint: "#2b2a30", dirt: "#4d4436",
      wallA: "#6f6752", wallB: "#5b5443", beam: "#3a2a1a", beamDk: "#241a10",
      roofA: "#7a3a2c", roofADk: "#54271d", slate: "#3d3a45", slateDk: "#2a2830",
      stone: "#5a5650", stoneDk: "#3f3c38", door: "#2e2013",
      pane: "#ffcf72", paneOff: "#3a3524", glow: true,
      awn1: "#8a2f28", awn2: "#c8b98f", wood: "#4a331c", woodLt: "#6a4c2a",
      forge: "#ff8a2e", cloud: "#3c4763", cloudDk: "#2c3550"
    };
    if (mode === "Sunset") return {
      skyTop: "#5b4a86", skyHz: "#f6b25a", sun: "#ffd979", sunHi: "#fff2c0", sunLow: true,
      hillFar: "#8a6a7e", hill: "#6a7a3e", hillDark: "#516030", distant: "#7d6b84",
      grass: "#6e7a38", cobble: "#b39a86", cobbleLt: "#c9b199", cobbleDk: "#8f7866", joint: "#6f5b4c", dirt: "#c39a63",
      wallA: "#f0d3a0", wallB: "#e0bd85", beam: "#6a4526", beamDk: "#4a3018",
      roofA: "#c85a38", roofADk: "#9a4026", slate: "#7a6a72", slateDk: "#584c54",
      stone: "#a2887a", stoneDk: "#7a6256", door: "#5a3a20",
      pane: "#ffdf8f", paneOff: "#c9a86a", glow: true,
      awn1: "#c0392b", awn2: "#f0e2c2", wood: "#6a4526", woodLt: "#8a5f30",
      forge: "#ff7a1e", cloud: "#f2cf9e", cloudDk: "#d9a878"
    };
    return { // Day
      skyTop: "#5fb1e6", skyHz: "#c6e9f7", sun: "#ffe15c", sunHi: "#fff6c2",
      hillFar: "#8fb6c0", hill: "#6fa03e", hillDark: "#537d2e", distant: "#94a9bc",
      grass: "#77a83f", cobble: "#a89d8c", cobbleLt: "#c1b7a4", cobbleDk: "#847a68", joint: "#6f6656", dirt: "#c6ac74",
      wallA: "#efdcb0", wallB: "#ddc78d", beam: "#6a4526", beamDk: "#4a3018",
      roofA: "#c65a3a", roofADk: "#9c4026", slate: "#6f6a76", slateDk: "#524d58",
      stone: "#948b80", stoneDk: "#6f6860", door: "#5a3a20",
      pane: "#9dc4dc", paneOff: "#7fa6bf", glow: false,
      awn1: "#c0392b", awn2: "#efe4c8", wood: "#6a4526", woodLt: "#8a5f30",
      forge: "#ff7a1e", cloud: "#ffffff", cloudDk: "#d6e6f0"
    };
  }

  /** Hero waypoints derived from the current layout — matches action ids. */
  function buildHeroSpots() {
    var L = layout;
    heroSpots = {
      idle: { x: L.wellX + 20, y: 250 },
      shop: { x: L.forgeX + 20, y: 212 },
      tavern: { x: L.tavernX + 35, y: 204 },
      work: { x: L.wellX + 10, y: 248 },
      study: { x: L.churchX + 25, y: 206 },
      university: { x: L.universityX + 32, y: 206 },
      brothel: { x: L.brothelX + 16, y: 206 },
      movefamily: { x: L.homeX + 25, y: 204 },
      roam: { x: 452, y: 252 },
      delve: { x: 444, y: 194 },
      travel: { x: 8, y: 250 },
      alleys: { x: Math.max(60, L.forgeX + 90), y: 244 },
      hunt: { x: 466, y: 238 },
      pickpocket: { x: L.stall1X + 20, y: 242 },
      burgle: { x: L.tavernX + 60, y: 204 },
      court: { x: L.wellX, y: 240 },
      seeknew: { x: L.stall1X, y: 248 },
      propose: { x: L.wellX, y: 240 },
      family: { x: L.homeX + 25, y: 204 },
    };
  }

  // --- background ----------------------------------------------
  function buildBack() {
    var W = LW, H = LH, hz = 178;
    var bc = back.getContext("2d"); bc.clearRect(0, 0, W, H);
    var bands = 9, i;
    for (i = 0; i < bands; i++) {
      var y0 = Math.round(i / bands * hz), y1 = Math.round((i + 1) / bands * hz);
      R(bc, 0, y0, W, y1 - y0, mix(P.skyTop, P.skyHz, Math.pow(i / (bands - 1), 0.85)));
    }
    if (P.stars) {
      var r = rng(7);
      for (i = 0; i < 70; i++) { var x = Math.floor(r() * W), y = Math.floor(r() * (hz - 30)); var b = r(); R(bc, x, y, 1, 1, b > 0.85 ? "#ffffff" : "#cfd6ee"); }
    }
    if (P.moon) {
      var mx = W - 92, my = 44; R(bc, mx - 1, my, 20, 1, "#e9edff"); R(bc, mx, my - 1, 18, 1, "#e9edff");
      R(bc, mx, my, 18, 18, "#eef2ff"); R(bc, mx + 1, my + 1, 16, 16, "#eef2ff");
      R(bc, mx + 9, my + 3, 7, 7, "#d7ddf2"); R(bc, mx + 4, my + 10, 5, 5, "#d7ddf2");
    }
    if (P.sun) {
      var lo = P.sunLow, sx = W - 118, sy = lo ? 96 : 34, s = lo ? 34 : 24;
      R(bc, sx - 2, sy + 4, s + 4, s - 8, P.sun); R(bc, sx + 4, sy - 2, s - 8, s + 4, P.sun);
      R(bc, sx, sy, s, s, P.sun); R(bc, sx + 4, sy + 4, s - 8, s - 8, P.sunHi);
    }
    hillRow(bc, hz, 26, 0.021, 1.2, P.hillFar, P.hillFar, 40);
    distantTown(bc, hz - 14, P.distant);
    hillRow(bc, hz, 16, 0.03, 3.7, P.hill, P.hillDark, 30);
    barrowArch(bc, 434, hz - 4);
    R(bc, 0, hz, W, H - hz, P.grass);
  }
  function hillRow(ctx, baseY, amp, freq, phase, cTop, cBot, depth) {
    for (var x = 0; x < LW; x++) {
      var y = Math.round(baseY - (amp * (0.5 + 0.5 * Math.sin(x * freq + phase)))); R(ctx, x, y, 1, depth, cTop);
      R(ctx, x, y, 1, 2, mix(cTop, "#ffffff", 0.12)); R(ctx, x, y + depth - 3, 1, 3, cBot);
    }
  }
  // A squat stone barrow entrance set into the hillside, off past the hamlet —
  // the "delve" hotspot's anchor. Dark inside; a lintel stone across the top.
  function barrowArch(ctx, x, y) {
    var w = 22, h = 16;
    R(ctx, x - 2, y, w + 4, h, P.stoneDk || "#5a5650");
    R(ctx, x - 2, y, w + 4, 3, mix(P.stoneDk || "#5a5650", "#fff", 0.15));
    R(ctx, x + 2, y + 4, w - 4, h - 4, "#0e0b08"); // the black mouth of the tunnel
    R(ctx, x + 4, y + 4, 2, h - 6, "#1c1712"); // faint depth shading
    R(ctx, x - 4, y + h - 2, w + 8, 3, P.stoneDk || "#5a5650"); // threshold slab
  }
  function distantTown(ctx, y, c) {
    var spots = [[150, 10, 12], [168, 8, 9], [184, 12, 14], [300, 9, 10], [316, 11, 12], [334, 8, 9]], i;
    for (i = 0; i < spots.length; i++) { var s = spots[i]; R(ctx, s[0], y - s[2], s[1], s[2], c); R(ctx, s[0] - 1, y - s[2], s[1] + 2, 3, mix(c, "#000000", 0.15)); }
    var cx = 232; R(ctx, cx, y - 16, 20, 16, c); R(ctx, cx + 6, y - 30, 8, 14, c);
    for (i = 0; i < 8; i++) R(ctx, cx + 9 - Math.floor(i / 2), y - 38 + i, 1 + Math.floor(i / 2) * 2, 1, mix(c, "#000", 0.12));
    R(ctx, cx + 9, y - 42, 2, 4, mix(c, "#000", 0.2)); R(ctx, cx + 8, y - 40, 4, 1, mix(c, "#000", 0.2));
  }

  // --- foreground ----------------------------------------------
  function buildFront() {
    var W = LW; var fc = front.getContext("2d"); fc.clearRect(0, 0, W, LH);
    layout = computeTownLayout(settlement, ownedHomes);
    buildHeroSpots();
    emitters = [];

    for (var i = 0; i < layout.slots.length; i++) {
      var s = layout.slots[i];
      if (s.type === "forge") { blacksmith(fc, s.x, BASE, s.w); emitters.push({ x: s.x + 54, y: BASE - 46 }); }
      else if (s.type === "tavern") { tavern(fc, s.x, BASE, s.w); emitters.push({ x: s.x + 45, y: BASE - 56 }); }
      else if (s.type === "church") { church(fc, s.x, BASE, s.w); }
      else if (s.type === "university") { university(fc, s.x, BASE, s.w); }
      else if (s.type === "brothel") { brothel(fc, s.x, BASE, s.w); }
      else if (s.type === "home") { homeLot(fc, s.x, BASE, s.w, s.built); if (s.built) emitters.push({ x: s.x + s.w - 12, y: BASE - 44 }); }
      else if (s.type === "house") {
        house(fc, s.x, BASE, s.w, 58, { roof: s.roof, rc: P.slate, rd: P.slateDk, win: s.win, chimney: true, cx: s.x + s.w - 12 });
        emitters.push({ x: s.x + s.w - 8, y: BASE - 46 });
      }
      if (s.alleyAfter) alley(fc, s.x + s.w, BASE);
    }

    ground(fc, BASE, layout);
    stall(fc, layout.stall1X, 214, false);
    stall(fc, layout.stall2X, 214, true);
    well(fc, layout.wellX, 236);
    signpost(fc, layout.wellX - 14, 208);
    lampPost(fc, layout.wellX - 42, 224); lampPost(fc, layout.wellX + 64, 224);
    fence(fc, layout.wellX - 32, 254); fence(fc, layout.wellX + 44, 254);
    bench(fc, layout.wellX + 74, 250);
    planter(fc, Math.min(WIDTH_BUDGET - 14, layout.homeX + 8), 190);
  }

  // A dark shadowed gap between two building slots — an alley to slip through.
  function alley(fc, x, base) {
    var w = 1;
    for (var y = base - 60; y < base; y++) {
      var t = (y - (base - 60)) / 60;
      R(fc, x - 4, y, 8, 1, mix("#0c0a08", P.wallA, 0.15 + t * 0.1));
    }
    R(fc, x - 5, base - 2, 10, 2, mix(P.cobbleDk, "#000", 0.2));
  }

  function ground(fc, base, L) {
    var W = LW, H = LH; R(fc, 0, base, W, H - base, P.cobble);
    var y, x;
    var mainExit = Math.round(L.width / 2) + 4;
    roadStrip(fc, base, mainExit);
    roadStrip(fc, base, L.altExitX);
    var r = rng(99);
    for (y = base + 2; y < H; y += 4) {
      var off = ((y / 4) | 0) % 2 ? 2 : 0;
      for (x = -2; x < W; x += 6) {
        var px = x + off, py = y + Math.floor((r() * 2));
        var t = (py - base) / (H - base);
        var inRoad = onRoad(px, t, mainExit) || onRoad(px, t, L.altExitX);
        var stc = inRoad ? (r() > 0.6 ? mix(P.dirt, "#000", 0.12) : P.dirt) : (r() > 0.5 ? P.cobbleLt : (r() > 0.5 ? P.cobbleDk : P.cobble));
        R(fc, px, py, 4, 3, stc); R(fc, px, py + 2, 4, 1, P.joint);
      }
    }
    // Worn dirt tracks where feet actually go most — the forge, the tavern
    // door, the well, the church — fading out a few steps from the threshold.
    wornPath(fc, L.forgeX + 22, base, 20);
    wornPath(fc, L.tavernX + 37, base, 24);
    wornPath(fc, L.wellX + 20, base, 28);
    wornPath(fc, L.churchX + 25, base, 20);
    // A couple of grimy puddles catching the sky's color.
    puddle(fc, Math.max(40, L.wellX - 60), base + 34, 10, 4);
    puddle(fc, Math.min(W - 40, L.wellX + 90), base + 46, 12, 5);
    var g = rng(31);
    for (x = 0; x < W; x += 7) { if (g() > 0.55) { var yy = base - 1; R(fc, x, yy - 2, 1, 3, P.hill); R(fc, x + 1, yy - 1, 1, 2, P.hillDark); } }
    // Sparser weed tufts scattered further into the square, past the wall seam.
    var w = rng(52);
    for (x = 0; x < W; x += 11) { if (w() > 0.82) { var wy = base + 6 + Math.floor(w() * 40); R(fc, x, wy, 1, 2, P.hillDark); R(fc, x + 1, wy + 1, 1, 1, P.hill); } }
  }
  // A tapering dirt road strip from the given exit point at the wall seam,
  // widening toward the viewer — reusable so a settlement can have more than one.
  function roadStrip(fc, base, exitX) {
    var H = LH;
    for (var y = base; y < H; y++) {
      var t = (y - base) / (H - base); var cw = 18 + t * 46, cx = exitX - t * 8;
      R(fc, cx, y, cw, 1, P.dirt);
    }
  }
  function onRoad(px, t, exitX) {
    var cx = exitX - t * 8, cw = 18 + t * 46;
    return px > cx - 2 && px < cx + cw;
  }
  // A tapering darker track worn into the cobble leading up to a doorway.
  function wornPath(fc, cx, base, len) {
    var i, tone = mix(P.dirt, "#000", 0.1);
    for (i = 0; i < len; i++) {
      var t = i / len, half = 6 * (1 - t * 0.7);
      R(fc, cx - half, base + i, half * 2, 1, mix(P.cobble, tone, 0.7 * (1 - t)));
    }
  }
  // A small still puddle, tinted by the sky.
  function puddle(fc, x, y, w, h) {
    var wet = mix("#3a86c8", P.skyHz || "#c6e9f7", 0.35);
    R(fc, x, y, w, h, mix(P.cobbleDk, wet, 0.5));
    R(fc, x + 1, y, w - 2, 1, mix(wet, "#fff", 0.25));
    R(fc, x, y + h - 1, w, 1, mix(P.joint, "#000", 0.1));
  }

  function house(fc, x, base, w, wh, o) {
    var top = base - wh;
    R(fc, x, top, w, wh, P.wallA); R(fc, x, top, w, 3, mix(P.wallA, "#fff", 0.12)); R(fc, x, base - 4, w, 4, mix(P.wallB, "#000", 0.08));
    R(fc, x, top, 3, wh, P.beam); R(fc, x + w - 3, top, 3, wh, P.beam);
    R(fc, x, top, w, 3, P.beam); R(fc, x, top + Math.floor(wh * 0.5), w, 3, P.beam);
    R(fc, x + Math.floor(w / 2) - 1, top, 3, Math.floor(wh * 0.5), P.beam);
    R(fc, x + 6, top + 3, 2, Math.floor(wh * 0.5) - 3, P.beamDk); R(fc, x + w - 8, top + 3, 2, Math.floor(wh * 0.5) - 3, P.beamDk);
    var glow = P.glow ? P.pane : P.paneOff;
    var winY = top + Math.floor(wh * 0.56);
    function drawWin(wx) {
      R(fc, wx - 1, winY - 1, 10, 12, P.beam); R(fc, wx, winY, 8, 10, glow);
      R(fc, wx + 3, winY, 2, 10, P.beam); R(fc, wx, winY + 4, 8, 2, P.beam);
      if (P.glow) R(fc, wx + 1, winY + 1, 3, 3, mix(P.pane, "#fff", 0.4));
    }
    if (o.win >= 1) drawWin(x + Math.floor(w * 0.22));
    if (o.win >= 2) drawWin(x + Math.floor(w * 0.62));
    var dw = 12, dx = x + Math.floor(w / 2) - 6; R(fc, dx - 1, base - 20, dw + 2, 20, P.beam); R(fc, dx, base - 18, dw, 18, P.door);
    R(fc, dx + 1, base - 17, 2, 17, mix(P.door, "#fff", 0.15)); R(fc, dx + dw - 3, base - 6, 2, 2, "#d8b24a");
    if (o.roof === "gable") roofGable(fc, x, top, w, o.rc, o.rd); else roofEave(fc, x, top, w, o.rc, o.rd);
    if (o.chimney) { var cx = o.cx != null ? o.cx : x + w - 12; R(fc, cx, top - 24, 7, 24, P.stone); R(fc, cx - 1, top - 24, 9, 3, P.stoneDk); R(fc, cx, top - 24, 7, 2, mix(P.stone, "#fff", 0.2)); }
  }
  function roofGable(fc, x, top, w, rc, rd) {
    var rh = Math.floor(w * 0.62), ov = 3, peak = top - rh, cx = x + w / 2, ry;
    for (ry = 0; ry < rh; ry++) {
      var t = ry / rh; var half = (w / 2 + ov) * t; var y = peak + ry;
      R(fc, cx - half, y, half * 2, 1, rc); R(fc, cx - half, y, 2, 1, rd); R(fc, cx + half - 2, y, 2, 1, rd);
    }
    R(fc, cx - 1, peak, 3, 3, mix(rc, "#fff", 0.25)); R(fc, x - ov, top - 1, w + ov * 2, 2, rd);
  }
  function roofEave(fc, x, top, w, rc, rd) {
    var rh = 16, ov = 3; R(fc, x - ov, top - rh, w + ov * 2, rh, rc);
    R(fc, x - ov, top - rh, w + ov * 2, 3, mix(rc, "#fff", 0.22)); R(fc, x - ov, top - 3, w + ov * 2, 3, rd);
    for (var ry = top - rh + 4; ry < top - 3; ry += 4) R(fc, x - ov, ry, w + ov * 2, 1, mix(rc, "#000", 0.14));
  }

  function blacksmith(fc, x, base, w) {
    var wh = 54, top = base - wh, xx, yy;
    R(fc, x, top, w, wh, P.wallB); R(fc, x, base - 26, w, 26, P.stone);
    var r = rng(5); for (yy = base - 24; yy < base; yy += 6) for (xx = x + 1; xx < x + w; xx += 8) { R(fc, xx + ((yy / 6 | 0) % 2 ? 4 : 0), yy, 6, 4, r() > 0.5 ? mix(P.stone, "#fff", 0.1) : P.stoneDk); R(fc, xx, yy + 3, 7, 1, P.stoneDk); }
    R(fc, x, top, w, 3, P.beam); R(fc, x, base - 28, w, 3, P.beam); R(fc, x, top, 3, wh, P.beam); R(fc, x + w - 3, top, 3, wh, P.beam);
    var fx = x + 8, fy = base - 24, fw = 20, fh = 20;
    R(fc, fx - 1, fy - 1, fw + 2, fh + 1, "#1a1109"); R(fc, fx, fy, fw, fh, P.forge);
    R(fc, fx + 3, fy + 6, fw - 6, fh - 8, mix(P.forge, "#ffef7a", 0.55)); R(fc, fx + 6, fy + 10, fw - 12, fh - 13, "#fff1b0");
    R(fc, fx + 5, fy + fh - 5, 10, 4, "#20242a"); R(fc, fx + 8, fy + fh - 8, 4, 3, "#20242a"); R(fc, fx + 3, fy + fh - 2, 14, 2, "#15181d");
    R(fc, x + w - 14, top + 8, 8, 9, P.beam); R(fc, x + w - 13, top + 9, 6, 7, P.glow ? P.pane : P.paneOff);
    R(fc, x + w - 4, top + 6, 2, 10, P.beam); R(fc, x + w - 8, top + 15, 8, 2, P.beam);
    R(fc, x + w - 8, top + 17, 2, 6, "#c9b24a"); R(fc, x + w - 2, top + 17, 2, 6, "#c9b24a"); R(fc, x + w - 6, top + 22, 4, 2, "#c9b24a");
    roofEave(fc, x, top, w, P.slate, P.slateDk);
    R(fc, x + 48, top - 30, 12, 30, P.stone); R(fc, x + 47, top - 30, 14, 3, P.stoneDk); R(fc, x + 48, top - 30, 12, 2, mix(P.stone, "#fff", 0.2));
    R(fc, x + 50, top - 30, 8, 2, "#20130c");
  }

  function tavern(fc, x, base, w) {
    var wh = 64, top = base - wh, i;
    R(fc, x, top, w, wh, P.wallA); R(fc, x, top, w, 3, mix(P.wallA, "#fff", 0.12));
    R(fc, x, top + Math.floor(wh * 0.42), w, 3, P.beam);
    R(fc, x, top, 3, wh, P.beam); R(fc, x + w - 3, top, 3, wh, P.beam); R(fc, x, top, w, 3, P.beam);
    var glow = P.glow ? P.pane : P.paneOff;
    for (i = 0; i < 3; i++) { var wx = x + 8 + i * 22, wy = top + 8; R(fc, wx - 1, wy - 1, 12, 12, P.beam); R(fc, wx, wy, 10, 10, glow); R(fc, wx + 4, wy, 2, 10, P.beam); R(fc, wx, wy + 4, 10, 2, P.beam); }
    var dx = x + Math.floor(w / 2) - 8; R(fc, dx - 1, base - 24, 18, 24, P.beam); R(fc, dx, base - 22, 16, 22, P.door);
    R(fc, dx + 7, base - 22, 2, 22, mix(P.door, "#000", 0.2)); R(fc, dx + 2, base - 12, 3, 3, "#d8b24a"); R(fc, dx + 11, base - 12, 3, 3, "#d8b24a");
    R(fc, x + 6, base - 22, 14, 14, P.beam); R(fc, x + 7, base - 21, 12, 12, glow); R(fc, x + 12, base - 21, 2, 12, P.beam); R(fc, x + 7, base - 16, 12, 2, P.beam);
    R(fc, x + w - 6, top + wh * 0.5, 2, 12, P.beam); R(fc, x + w - 16, top + wh * 0.5, 12, 2, P.beam);
    var sx = x + w - 16, sy = top + wh * 0.5 + 3; R(fc, sx - 1, sy - 1, 12, 12, P.wood); R(fc, sx, sy, 10, 10, mix(P.wallB, "#fff", 0.1));
    R(fc, sx + 2, sy + 2, 5, 6, "#caa25a"); R(fc, sx + 7, sy + 3, 2, 4, "#caa25a"); R(fc, sx + 2, sy + 2, 5, 2, "#f0e8d0");
    roofGable(fc, x, top, w, P.roofA, P.roofADk);
    R(fc, x + 30, top - 26, 8, 26, P.stone); R(fc, x + 29, top - 26, 10, 3, P.stoneDk);
  }

  // A modest chapel: a steep gable, a stone base, and a small spire with a
  // cross — distinct from every house roofline. Anchors the "study" action.
  function church(fc, x, base, w) {
    var wh = 60, top = base - wh;
    R(fc, x, top, w, wh, P.stone); R(fc, x, base - 3, w, 3, mix(P.stoneDk, "#000", 0.1));
    R(fc, x, top, w, 3, mix(P.stone, "#fff", 0.15));
    var glow = P.glow ? P.pane : P.paneOff;
    var wx = x + Math.floor(w / 2) - 4;
    R(fc, wx - 1, top + 10, 10, 14, P.stoneDk); R(fc, wx, top + 11, 8, 12, glow);
    R(fc, wx + 3, top + 11, 2, 12, P.stoneDk); R(fc, wx, top + 16, 8, 2, P.stoneDk);
    R(fc, wx, top + 8, 8, 3, P.stoneDk); // pointed lintel hint
    var dw = 14, dx = x + Math.floor(w / 2) - 7;
    R(fc, dx - 1, base - 22, dw + 2, 22, P.stoneDk); R(fc, dx, base - 20, dw, 20, P.door);
    R(fc, dx + dw / 2 - 1, base - 20, 2, 20, mix(P.door, "#000", 0.2));
    roofGable(fc, x, top, w, P.roofADk, mix(P.roofADk, "#000", 0.2));
    // Spire, set back on the roof ridge, with a small cross on top.
    var sx = x + Math.floor(w / 2) - 4, sTop = top - Math.floor(w * 0.62) - 22;
    R(fc, sx, sTop, 8, 22, P.stoneDk); R(fc, sx - 1, sTop, 10, 3, mix(P.stoneDk, "#fff", 0.15));
    R(fc, sx + 3, sTop - 10, 2, 10, "#3a2a1a"); R(fc, sx + 1, sTop - 7, 6, 2, "#3a2a1a");
  }

  // The university: a wide stone hall with tall arched windows, a slate roof,
  // and a banner over the doors — unmistakably grander than any house.
  function university(fc, x, base, w) {
    var wh = 66, top = base - wh, i;
    R(fc, x, top, w, wh, P.stone); R(fc, x, top, w, 3, mix(P.stone, "#fff", 0.15));
    R(fc, x, base - 3, w, 3, mix(P.stoneDk, "#000", 0.1));
    var glow = P.glow ? P.pane : P.paneOff;
    // Three tall arched windows across the upper floor.
    for (i = 0; i < 3; i++) {
      var wx = x + 9 + i * Math.floor((w - 18) / 2.6);
      R(fc, wx - 1, top + 9, 10, 20, P.stoneDk); R(fc, wx, top + 12, 8, 16, glow);
      R(fc, wx, top + 9, 8, 3, P.stoneDk); R(fc, wx + 3, top + 12, 2, 16, P.stoneDk);
    }
    // Double doors under a lintel, with a banner hanging above them.
    var dw = 18, dx = x + Math.floor(w / 2) - 9;
    R(fc, dx - 2, base - 24, dw + 4, 24, P.stoneDk); R(fc, dx, base - 22, dw, 22, P.door);
    R(fc, dx + dw / 2 - 1, base - 22, 2, 22, mix(P.door, "#000", 0.2));
    R(fc, dx + 2, base - 30, dw - 4, 8, "#3a5a8c"); R(fc, dx + 2, base - 30, dw - 4, 2, "#587cb0");
    R(fc, dx + dw / 2 - 2, base - 28, 4, 4, "#d8b24a"); // the scholars' device
    roofEave(fc, x, top, w, P.slate, P.slateDk);
    // A small bell cote on the ridge.
    R(fc, x + Math.floor(w / 2) - 3, top - 26, 8, 10, P.stone); R(fc, x + Math.floor(w / 2) - 1, top - 23, 4, 5, "#20130c");
    R(fc, x + Math.floor(w / 2) - 4, top - 28, 10, 2, P.stoneDk);
  }

  // The pleasure house: a narrow, shuttered house with a red lantern by the
  // door — quiet by day, glowing warm at night. Kept tasteful, like the rules.
  function brothel(fc, x, base, w) {
    var wh = 58, top = base - wh;
    R(fc, x, top, w, wh, P.wallB); R(fc, x, top, w, 3, P.beam);
    R(fc, x, top, 3, wh, P.beam); R(fc, x + w - 3, top, 3, wh, P.beam);
    R(fc, x, top + Math.floor(wh * 0.5), w, 3, P.beam);
    // Shuttered upper window (closed — discretion is the trade).
    var wx = x + Math.floor(w / 2) - 5;
    R(fc, wx - 1, top + 9, 12, 12, P.beam); R(fc, wx, top + 10, 5, 10, P.wood); R(fc, wx + 5, top + 10, 5, 10, P.wood);
    R(fc, wx + 2, top + 12, 1, 6, P.woodLt); R(fc, wx + 7, top + 12, 1, 6, P.woodLt);
    var dw = 12, dx = x + Math.floor(w / 2) - 6;
    R(fc, dx - 1, base - 20, dw + 2, 20, P.beam); R(fc, dx, base - 18, dw, 18, P.door);
    R(fc, dx + 1, base - 17, 2, 17, mix(P.door, "#fff", 0.15));
    // The red lantern on a bracket beside the door.
    R(fc, dx + dw + 3, base - 26, 6, 2, P.beam); R(fc, dx + dw + 7, base - 25, 1, 4, P.beamDk);
    R(fc, dx + dw + 5, base - 21, 5, 7, P.glow ? "#e0483a" : "#8c3a30");
    if (P.glow) R(fc, dx + dw + 6, base - 20, 3, 4, "#ff8a70");
    roofGable(fc, x, top, w, P.slate, P.slateDk);
  }

  // The player's home lot. Unowned: a bare fenced plot, waiting. Owned: a
  // proper house goes up — "if we buy a house we can see it built up for us".
  function homeLot(fc, x, base, w, built) {
    if (!built) {
      R(fc, x + 4, base - 3, w - 8, 3, mix(P.dirt, "#000", 0.08));
      fence(fc, x + 4, base + 2);
      fence(fc, x + w / 2 + 2, base + 2);
      return;
    }
    house(fc, x, base, w, 56, { roof: "gable", rc: P.roofA, rd: P.roofADk, win: 2, chimney: true, cx: x + w - 12 });
    // A little flower box marks it as home, distinct from a rented house.
    planter(fc, x + 4, base - 4);
  }

  function well(fc, x, y) {
    var w = 40, yy, xx;
    R(fc, x - 2, y + 16, w + 4, 4, mix(P.cobble, "#000", 0.22));
    R(fc, x, y, w, 18, P.stone); R(fc, x, y, w, 3, mix(P.stone, "#fff", 0.2)); R(fc, x, y + 15, w, 3, P.stoneDk);
    var r = rng(12); for (yy = y + 3; yy < y + 15; yy += 5) for (xx = x + 1; xx < x + w; xx += 9) { R(fc, xx + ((yy / 5 | 0) % 2 ? 5 : 0), yy, 8, 4, r() > 0.5 ? mix(P.stone, "#fff", 0.08) : P.stoneDk); R(fc, xx, yy + 3, 9, 1, P.stoneDk); }
    R(fc, x + 5, y + 3, w - 10, 4, mix("#3a86c8", P.skyHz || "#c6e9f7", 0.2)); R(fc, x + 7, y + 3, 4, 2, "#bfe3f5");
    R(fc, x + 3, y - 20, 3, 20, P.wood); R(fc, x + w - 6, y - 20, 3, 20, P.wood); R(fc, x + 1, y - 20, w - 2, 3, P.woodLt);
    var rh = 12, ry; for (ry = 0; ry < rh; ry++) { var half = (w / 2 + 2) * (ry / rh); R(fc, x + w / 2 - half, y - 20 - rh + ry, half * 2, 1, ry < 3 ? mix(P.roofA, "#fff", 0.2) : P.roofA); }
    R(fc, x + w / 2 - 1, y - 20 - rh, 3, 3, mix(P.roofA, "#fff", 0.3)); R(fc, x - 2, y - 21, w + 4, 2, P.roofADk);
    R(fc, x + w / 2 - 1, y - 18, 2, 10, "#8a7654"); R(fc, x + w / 2 - 3, y - 8, 6, 6, P.woodLt); R(fc, x + w / 2 - 3, y - 8, 6, 2, P.wood); R(fc, x + w / 2 - 3, y - 3, 6, 1, P.wood);
  }

  function stall(fc, x, y, flip) {
    var w = 44, i, ry, cx;
    R(fc, x - 1, y + 20, w + 2, 3, mix(P.cobble, "#000", 0.2));
    R(fc, x + 2, y - 2, 3, 24, P.wood); R(fc, x + w - 5, y - 2, 3, 24, P.wood);
    R(fc, x, y + 10, w, 4, P.woodLt); R(fc, x, y + 14, w, 10, P.wood); R(fc, x + 2, y + 15, w - 4, 2, mix(P.wood, "#fff", 0.12));
    var goods = ["#c0392b", "#e07b1f", "#7ba428", "#d8b24a", "#b5651d", "#c0392b"];
    for (i = 0; i < 6; i++) { R(fc, x + 4 + i * 6, y + 7, 4, 4, goods[(i + (flip ? 3 : 0)) % goods.length]); R(fc, x + 5 + i * 6, y + 7, 1, 1, "#ffffff"); }
    var ah = 10; for (ry = 0; ry < ah; ry++) {
      var wid = w + 4 - ry * 0.6;
      for (cx = 0; cx < wid; cx += 4) { R(fc, (x - 2) + cx, y - 8 + ry, 4, 1, (Math.floor(cx / 4) + ry) % 2 ? P.awn1 : P.awn2); }
    }
    R(fc, x - 2, y + 2, w + 4, 2, P.awn1);
    for (cx = 0; cx < w + 4; cx += 4) R(fc, x - 2 + cx, y + 4, 2, 2, (cx / 4) % 2 ? P.awn1 : P.awn2);
  }

  // A short 2-rail fence segment, penning off a bit of the well yard.
  function fence(fc, x, y) {
    var w = 22, i;
    for (i = 0; i <= w; i += 10) { R(fc, x + i, y - 8, 2, 9, P.wood); }
    R(fc, x, y - 6, w + 2, 2, P.woodLt); R(fc, x, y - 1, w + 2, 2, P.woodLt);
    R(fc, x - 1, y + 1, w + 4, 2, mix(P.cobble, "#000", 0.18));
  }

  // A window-box of flowers, propped against a wall front.
  function planter(fc, x, y) {
    R(fc, x, y + 4, 14, 5, P.wood); R(fc, x, y + 4, 14, 1, P.woodLt);
    var petals = ["#c0392b", "#d8b24a", "#e07b1f", "#efe4c8"], i;
    for (i = 0; i < 5; i++) { R(fc, x + 1 + i * 2.5, y, 2, 3, "#5a7a3a"); R(fc, x + 1 + i * 2.5, y - 2, 2, 2, petals[i % petals.length]); }
  }

  // A wooden signpost with a hanging board — sits at the square's fork.
  function signpost(fc, x, y) {
    R(fc, x, y - 22, 2, 22, P.wood); R(fc, x - 1, y - 22, 4, 2, P.woodLt);
    R(fc, x - 7, y - 20, 9, 7, P.wood); R(fc, x - 6, y - 19, 7, 5, mix(P.wood, "#fff", 0.18));
    R(fc, x + 2, y - 14, 8, 6, P.wood); R(fc, x + 3, y - 13, 6, 4, mix(P.wood, "#fff", 0.18));
    R(fc, x - 1, y - 1, 4, 2, mix(P.cobble, "#000", 0.18));
  }

  // A post lamp — dark and unlit by day, glowing at dusk/night (P.glow).
  function lampPost(fc, x, y) {
    R(fc, x, y - 26, 2, 26, P.stone); R(fc, x - 1, y, 4, 2, P.stoneDk);
    var lit = P.glow, glass = lit ? P.pane : P.paneOff;
    R(fc, x - 3, y - 32, 8, 8, P.stoneDk); R(fc, x - 2, y - 31, 6, 6, glass);
    if (lit) { R(fc, x - 1, y - 30, 4, 4, mix(P.pane, "#fff", 0.5)); }
    R(fc, x - 4, y - 34, 10, 2, P.stoneDk);
  }

  // A low well-side bench for the loiterers.
  function bench(fc, x, y) {
    R(fc, x, y, 20, 3, P.woodLt); R(fc, x, y, 20, 1, mix(P.woodLt, "#fff", 0.2));
    R(fc, x + 2, y + 3, 2, 5, P.wood); R(fc, x + 16, y + 3, 2, 5, P.wood);
  }

  function barrel(fc, x, y) { R(fc, x, y, 10, 16, P.wood); R(fc, x + 1, y, 8, 16, P.woodLt); R(fc, x, y + 2, 10, 2, P.wood); R(fc, x, y + 7, 10, 2, P.wood); R(fc, x, y + 12, 10, 2, P.wood); R(fc, x + 2, y, 1, 16, mix(P.woodLt, "#fff", 0.2)); }
  function crate(fc, x, y) { R(fc, x, y + 4, 12, 12, P.woodLt); R(fc, x, y + 4, 12, 2, P.wood); R(fc, x, y + 14, 12, 2, P.wood); R(fc, x, y + 4, 2, 12, P.wood); R(fc, x + 10, y + 4, 2, 12, P.wood); R(fc, x + 1, y + 9, 10, 1, P.wood); }

  // --- clouds & smoke ------------------------------------------
  function initClouds() { var r = rng(21); clouds = []; for (var i = 0; i < 5; i++) clouds.push({ x: r() * LW, y: 14 + r() * 70, s: 0.8 + r() * 0.9, v: 0.12 + r() * 0.18, seed: (r() * 1000) | 0 }); }
  function drawCloud(ctx, x, y, s) {
    var c = P.cloud, cd = P.cloudDk;
    var w = Math.round(30 * s), h = Math.round(12 * s);
    var lumps = [[0, 4, w * 0.5, h * 0.6], [w * 0.28, 0, w * 0.5, h * 0.8], [w * 0.5, 3, w * 0.5, h * 0.7]];
    for (var i = 0; i < lumps.length; i++) { var l = lumps[i]; R(ctx, x + l[0], y + l[1], l[2], l[3], c); }
    R(ctx, x, y + h * 0.6, w, h * 0.4, c); R(ctx, x, y + h - 2, w, 2, cd); R(ctx, x + 2, y + 2, w * 0.4, 2, mix(c, "#fff", 0.4));
  }
  function drawClouds(ctx) { for (var i = 0; i < clouds.length; i++) { var c = clouds[i]; drawCloud(ctx, Math.round(c.x), Math.round(c.y), c.s); } }

  function spawnSmoke() { if (!CONFIG.chimneySmoke) return; for (var i = 0; i < emitters.length; i++) { var e = emitters[i]; puffs.push({ x: e.x + 2, y: e.y, vx: (Math.random() - 0.3) * 0.10, vy: -0.28 - Math.random() * 0.14, age: 0, life: 150 + Math.random() * 80, sz: 2 + Math.random() * 1 }); } }
  function drawSmoke(ctx) {
    var base = P.glow ? "#c9cdd6" : "#e8ecf2";
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i]; var t = p.age / p.life; var sz = Math.round(p.sz + t * 4); var col = mix(base, P.skyHz || "#c6e9f7", 0.15 + t * 0.5);
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.85); R(ctx, Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz, col);
      R(ctx, Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), Math.max(1, sz / 2), 1, mix(col, "#fff", 0.3));
    }
    ctx.globalAlpha = 1;
  }

  // --- background townsfolk --------------------------------------------------
  // Spawn points derive from the current layout's anchors (forge, tavern,
  // church, well, stalls) instead of hardcoded coordinates, so population
  // moves with the settlement. Headcount & pace scale with settlement tier.
  function npcRosterDefs() {
    var L = layout, tier = TIER_INFO[settlement.kind] || TIER_INFO.hamlet;
    var spots = [
      { seed: 501, gender: "male", a: { x: L.forgeX + 10, y: 196 }, b: { x: L.forgeX + 38, y: 196 } },
      { seed: 502, gender: "male", a: { x: L.tavernX + 18, y: 206 }, b: { x: L.tavernX + 42, y: 206 } },
      { seed: 503, gender: "female", a: { x: L.tavernX + 50, y: 208 }, b: { x: L.tavernX + 68, y: 208 } },
      { seed: 504, gender: "female", a: { x: L.wellX - 18, y: 252 }, b: { x: L.wellX + 12, y: 252 } },
      { seed: 505, gender: "male", a: { x: L.stall1X + 4, y: 230 }, b: { x: L.stall1X + 22, y: 230 } },
      { seed: 506, gender: "female", a: { x: L.stall2X + 4, y: 230 }, b: { x: L.stall2X + 22, y: 230 } },
      { seed: 507, gender: "female", a: { x: L.churchX + 6, y: 206 }, b: { x: L.churchX + 30, y: 206 } },
      { seed: 508, gender: "male", a: { x: L.wellX + 40, y: 246 }, b: { x: L.wellX + 70, y: 246 } },
      { seed: 509, gender: "female", a: { x: Math.max(20, L.forgeX - 20), y: 244 }, b: { x: L.forgeX + 4, y: 244 } },
      { seed: 510, gender: "male", a: { x: L.homeX - 20, y: 216 }, b: { x: L.homeX + 6, y: 216 } },
    ];
    return spots.slice(0, tier.npcCount);
  }
  function buildNpcRoster() {
    npcs = [];
    if (CONFIG.timeOfDay === "Night" || !layout) return;
    var tier = TIER_INFO[settlement.kind] || TIER_INFO.hamlet;
    var defs = npcRosterDefs();
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i], rr = rng(d.seed + hashString(settlement.id));
      npcs.push({
        look: villagerLook(d.seed, d.gender), wpA: d.a, wpB: d.b, atA: false,
        x: d.a.x, y: d.a.y, tx: d.b.x, ty: d.b.y,
        facing: 1, animT: 0, moving: false,
        waitT: tier.waitMin + rr() * (tier.waitMax - tier.waitMin), rand: rr, tier: tier,
      });
    }
  }

  // --- loop ----------------------------------------------------
  function stepScene(dt) {
    var cs = CONFIG.cloudSpeed;
    for (var i = 0; i < clouds.length; i++) { var c = clouds[i]; c.x += c.v * cs * dt * 0.06; if (c.x > LW + 40) c.x = -Math.round(40 * c.s); }
    for (var j = 0; j < puffs.length; j++) { var p = puffs[j]; p.age += dt * 0.06; p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; }
    puffs = puffs.filter(function (p) { return p.age < p.life; });
    spawnT += dt; if (spawnT > 620) { spawnT = 0; spawnSmoke(); }
    if (hero) stepWalker(hero, dt, 0.11); // ~110 px/s — a purposeful hamlet walk
    for (var ni = 0; ni < npcs.length; ni++) {
      var n = npcs[ni];
      stepWalker(n, dt, 0.045); // a stroll, not a trip
      if (!n.moving) {
        n.waitT -= dt;
        if (n.waitT <= 0) {
          n.atA = !n.atA;
          var wp = n.atA ? n.wpA : n.wpB;
          n.tx = wp.x; n.ty = wp.y;
          n.waitT = n.tier.waitMin + n.rand() * (n.tier.waitMax - n.tier.waitMin);
        }
      }
    }
  }
  function frame(ts) {
    if (stopped) return;
    var dt = Math.min(60, ts - lastT || 16); lastT = ts; stepScene(dt);
    var lc = log.getContext("2d"); lc.imageSmoothingEnabled = false;
    lc.drawImage(back, 0, 0); drawClouds(lc); lc.drawImage(front, 0, 0);
    for (var ni = 0; ni < npcs.length; ni++) {
      var n = npcs[ni];
      drawHero(lc, Math.round(n.x), Math.round(n.y), n.look, n.moving ? "walk" : "idle", (n.animT / 170) | 0, 1, n.facing);
    }
    // The hero draws last (of the people) so the player is never hidden
    // behind a townsperson standing at the same spot.
    if (hero) {
      drawHero(
        lc, Math.round(hero.x), Math.round(hero.y), hero.look,
        hero.moving ? "walk" : "idle", (hero.animT / 170) | 0, 1, hero.facing,
      );
    }
    if (CONFIG.chimneySmoke) drawSmoke(lc);
    vctx.imageSmoothingEnabled = false; vctx.drawImage(log, 0, 0, LW, LH, 0, 0, 960, 540);
    rafId = requestAnimationFrame(frame);
  }

  function rebuild() { P = pal(CONFIG.timeOfDay); buildBack(); buildFront(); buildNpcRoster(); }

  // --- boot ----------------------------------------------------
  back = mk(); front = mk(); log = mk();
  rebuild(); initClouds();
  for (var k = 0; k < 3; k++) spawnSmoke();
  lastT = performance.now(); rafId = requestAnimationFrame(frame);

  return {
    setTimeOfDay: function (mode) {
      if (mode !== CONFIG.timeOfDay) { CONFIG.timeOfDay = mode; rebuild(); }
    },
    setHero: function (look) {
      if (!look) { hero = null; return; }
      if (!hero) {
        var s = heroSpots.idle || { x: 240, y: 250 };
        hero = { look: look, x: s.x, y: s.y, tx: s.x, ty: s.y, facing: 1, animT: 0, moving: false };
      } else {
        hero.look = look;
      }
    },
    heroGoTo: function (spotId) {
      if (!hero) return;
      var s = heroSpots[spotId] || heroSpots.idle;
      if (!s) return;
      hero.tx = s.x; hero.ty = s.y;
    },
    setSettlement: function (nextSettlement, nextOwnedHomes) {
      var next = nextOwnedHomes || [];
      var changed = !settlement || settlement.id !== nextSettlement.id ||
        ownedHomes.join("|") !== next.join("|");
      settlement = {
        id: nextSettlement.id,
        kind: nextSettlement.kind,
        structures: nextSettlement.structures || [],
      };
      ownedHomes = next.slice();
      if (changed) rebuild();
    },
    destroy: function () { stopped = true; cancelAnimationFrame(rafId); },
  };
}
