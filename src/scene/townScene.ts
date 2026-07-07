// @ts-nocheck
// ---------------------------------------------------------------------------
// townScene.ts — the animated pixel-art hamlet that sits behind the whole game.
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

export interface TownSceneHandle {
  /** Switch the scene between Day, Sunset (dusk), and Night. */
  setTimeOfDay(mode: TimeOfDay): void;
  /** Put the player's paper-doll in the town (or remove it with null). */
  setHero(look: HeroLook | null): void;
  /** Send the hero walking to a named spot (action ids; "idle" = loiter). */
  heroGoTo(spotId: string): void;
  /** Stop the animation loop and release the frame. */
  destroy(): void;
}

/**
 * Where the hero stands for each activity, in scene coordinates (480×270).
 * These sit on real geometry — doors, the well, the road — unlike the hotspot
 * buttons, which are viewport percentages over the cover-cropped canvas.
 */
var HERO_SPOTS = {
  idle: { x: 262, y: 250 }, // loitering by the well
  tavern: { x: 155, y: 204 }, // the tavern door
  shop: { x: 42, y: 212 }, // the forge front
  work: { x: 200, y: 248 }, // the square by the well
  roam: { x: 452, y: 252 }, // off down the road
  delve: { x: 444, y: 194 }, // the barrow arch on the hillside
  alleys: { x: 96, y: 244 }, // the dark side-streets
  hunt: { x: 466, y: 238 }, // out past the walls
  pickpocket: { x: 356, y: 242 }, // the crowd at the stall
  burgle: { x: 322, y: 204 }, // a shuttered house
  court: { x: 180, y: 240 }, // about the square
  seeknew: { x: 92, y: 248 },
  propose: { x: 180, y: 240 },
  family: { x: 436, y: 204 }, // the family home's door
};

/**
 * Background townsfolk (Day/Sunset only — see buildNpcRoster). Each wanders
 * between two spots (`a` / `b`) planted right at their point of interest, so
 * they visibly belong to the forge, the tavern door, the well, the stalls.
 */
var NPC_DEFS = [
  { gender: "male", seed: 501, a: { x: 14, y: 196 }, b: { x: 42, y: 196 } }, // the smith, by the forge
  { gender: "male", seed: 502, a: { x: 136, y: 206 }, b: { x: 160, y: 206 } }, // a tavern regular
  { gender: "female", seed: 503, a: { x: 168, y: 208 }, b: { x: 188, y: 208 } }, // a second patron
  { gender: "female", seed: 504, a: { x: 196, y: 252 }, b: { x: 226, y: 252 } }, // drawing water at the well
  { gender: "male", seed: 505, a: { x: 100, y: 230 }, b: { x: 118, y: 230 } }, // minding the first stall
  { gender: "female", seed: 506, a: { x: 348, y: 230 }, b: { x: 366, y: 230 } }, // minding the second stall
];

/** Mount the animated town onto a canvas element. */
export function mountTownScene(canvas: HTMLCanvasElement): TownSceneHandle {
  "use strict";
  var cv = canvas;
  cv.width = 960;
  cv.height = 540;
  var vctx = cv.getContext("2d");
  vctx.imageSmoothingEnabled = false;

  var LW = 480, LH = 270; // logical art resolution
  var clouds = [], puffs = [], emitters = [];
  var hero = null; // { look, x, y, tx, ty, facing, animT, moving }
  var npcs = []; // background townsfolk — see NPC_DEFS / buildNpcRoster()
  var lastT = 0, spawnT = 0;
  var P; // active palette
  var back, front, log; // offscreen layers
  var rafId = 0, stopped = false;

  var CONFIG = { timeOfDay: "Day", cloudSpeed: 1, chimneySmoke: true };

  // --- helpers -------------------------------------------------
  function mk() { var c = document.createElement("canvas"); c.width = LW; c.height = LH; return c; }
  function R(ctx, x, y, w, h, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
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
  // (Re)populate the background townsfolk. Empty at Night — the streets are
  // meant to feel abandoned once crime becomes the player's option.
  function buildNpcRoster() {
    npcs = [];
    if (CONFIG.timeOfDay === "Night") return;
    for (var i = 0; i < NPC_DEFS.length; i++) {
      var d = NPC_DEFS[i], rr = rng(d.seed);
      npcs.push({
        look: villagerLook(d.seed, d.gender), wpA: d.a, wpB: d.b, atA: false,
        x: d.a.x, y: d.a.y, tx: d.b.x, ty: d.b.y,
        facing: 1, animT: 0, moving: false, waitT: 400 + rr() * 1200, rand: rr,
      });
    }
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
    var base = 196;
    blacksmith(fc, 4, base, 66);
    house(fc, 72, base, 46, 60, { roof: "gable", rc: P.slate, rd: P.slateDk, win: 1, chimney: true, cx: 98 });
    tavern(fc, 118, base, 74);
    house(fc, 296, base, 50, 62, { roof: "gable", rc: P.slate, rd: P.slateDk, win: 2, chimney: true, cx: 322 });
    house(fc, 348, base, 60, 54, { roof: "eave", rc: P.roofA, rd: P.roofADk, win: 2, chimney: false });
    house(fc, 410, base, 52, 70, { roof: "gable", rc: P.roofA, rd: P.roofADk, win: 2, chimney: true, cx: 436 });
    ground(fc, base);
    stall(fc, 96, 214, false);
    stall(fc, 344, 214, true);
    barrel(fc, 78, 190); crate(fc, 66, 190);
    barrel(fc, 402, 192);
    well(fc, 214, 236);
    signpost(fc, 200, 208);
    lampPost(fc, 172, 224); lampPost(fc, 278, 224);
    fence(fc, 182, 254); fence(fc, 258, 254);
    bench(fc, 288, 250);
    planter(fc, 305, 190);
    emitters = [{ x: 58, y: 134 }, { x: 99, y: 132 }, { x: 150, y: 126 }, { x: 323, y: 130 }, { x: 437, y: 120 }];
  }

  function ground(fc, base) {
    var W = LW, H = LH; R(fc, 0, base, W, H - base, P.cobble);
    var y, x;
    for (y = base; y < H; y++) { var t = (y - base) / (H - base); var cw = 18 + t * 46, cx = 200 - t * 8; R(fc, cx, y, cw, 1, P.dirt); }
    var r = rng(99);
    for (y = base + 2; y < H; y += 4) {
      var off = ((y / 4) | 0) % 2 ? 2 : 0;
      for (x = -2; x < W; x += 6) {
        var px = x + off, py = y + Math.floor((r() * 2));
        var inRoad = (px > 200 - ((py - base) / (H - base)) * 8 - 2 && px < 200 - ((py - base) / (H - base)) * 8 + 18 + ((py - base) / (H - base)) * 46);
        var stc = inRoad ? (r() > 0.6 ? mix(P.dirt, "#000", 0.12) : P.dirt) : (r() > 0.5 ? P.cobbleLt : (r() > 0.5 ? P.cobbleDk : P.cobble));
        R(fc, px, py, 4, 3, stc); R(fc, px, py + 2, 4, 1, P.joint);
      }
    }
    // Worn dirt tracks where feet actually go most — the forge, the tavern
    // door, the well — fading out a few steps from the threshold.
    wornPath(fc, 22, base, 22);
    wornPath(fc, 155, base, 26);
    wornPath(fc, 234, base, 30);
    // A couple of grimy puddles catching the sky's color.
    puddle(fc, 168, base + 34, 10, 4);
    puddle(fc, 300, base + 46, 12, 5);
    var g = rng(31);
    for (x = 0; x < W; x += 7) { if (g() > 0.55) { var yy = base - 1; R(fc, x, yy - 2, 1, 3, P.hill); R(fc, x + 1, yy - 1, 1, 2, P.hillDark); } }
    // Sparser weed tufts scattered further into the square, past the wall seam.
    var w = rng(52);
    for (x = 0; x < W; x += 11) { if (w() > 0.82) { var wy = base + 6 + Math.floor(w() * 40); R(fc, x, wy, 1, 2, P.hillDark); R(fc, x + 1, wy + 1, 1, 1, P.hill); } }
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
          n.waitT = 1800 + n.rand() * 2600; // pause a while before the next stroll
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
        var s = HERO_SPOTS.idle;
        hero = { look: look, x: s.x, y: s.y, tx: s.x, ty: s.y, facing: 1, animT: 0, moving: false };
      } else {
        hero.look = look;
      }
    },
    heroGoTo: function (spotId) {
      if (!hero) return;
      var s = HERO_SPOTS[spotId] || HERO_SPOTS.idle;
      hero.tx = s.x; hero.ty = s.y;
    },
    destroy: function () { stopped = true; cancelAnimationFrame(rafId); },
  };
}
