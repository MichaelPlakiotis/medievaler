// @ts-nocheck
// ---------------------------------------------------------------------------
// mapScene.ts — the regional hex map's canvas art (the "bigger world" arc).
//
// Unlike townScene.ts this has no animation loop to run — the map is static
// between moves, so it's just a draw function plus the pixel<->hex math the
// UI needs for click handling. Kept @ts-nocheck like townScene.ts: it's a
// renderer, not game logic (the actual hex math used by rules lives in the
// typed, tested src/game/worldmap.ts — this file only converts to/from pixels).
// ---------------------------------------------------------------------------

export var MAP_LW = 480, MAP_LH = 270; // logical art resolution, matches townScene.ts
var HEX_SIZE = 7; // center-to-corner, logical px (sized so a radius-12 map fits 270px tall)

var TERRAIN_COLORS = {
  plains: { fill: "#7fa83f", stroke: "#5f8530" },
  forest: { fill: "#3f7a3a", stroke: "#2c5a29" },
  hills: { fill: "#a89060", stroke: "#7c6a44" },
  mountains: { fill: "#8a8a92", stroke: "#63636a" },
  water: { fill: "#3a6ea5", stroke: "#2a5280" },
};
var ROAD_COLOR = "#c6ac74";
var FOG_COLOR = "#0c0e14";

function hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function mix(a, b, t) { var A = hx(a), B = hx(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")"; }

/** Axial (pointy-top) hex center, in logical px, relative to the map's origin. */
export function hexToPixel(hex) {
  var x = HEX_SIZE * Math.sqrt(3) * (hex.q + hex.r / 2);
  var y = HEX_SIZE * 1.5 * hex.r;
  return { x: x + MAP_LW / 2, y: y + MAP_LH / 2 };
}

/** Inverse of hexToPixel, with cube rounding to the nearest hex. */
export function pixelToHex(px, py) {
  var x = px - MAP_LW / 2, y = py - MAP_LH / 2;
  var qf = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
  var rf = (2 / 3 * y) / HEX_SIZE;
  var sf = -qf - rf;
  var q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  var qd = Math.abs(q - qf), rd = Math.abs(r - rf), sd = Math.abs(s - sf);
  if (qd > rd && qd > sd) q = -r - s; else if (rd > sd) r = -q - s;
  return { q: q, r: r };
}

function hexCorners(cx, cy) {
  var pts = [];
  for (var i = 0; i < 6; i++) {
    var deg = 60 * i - 30, rad = (Math.PI / 180) * deg;
    pts.push([cx + HEX_SIZE * Math.cos(rad), cy + HEX_SIZE * Math.sin(rad)]);
  }
  return pts;
}

function fillHex(ctx, cx, cy, size, color) {
  var pts = [];
  for (var i = 0; i < 6; i++) {
    var deg = 60 * i - 30, rad = (Math.PI / 180) * deg;
    pts.push([cx + size * Math.cos(rad), cy + size * Math.sin(rad)]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeHex(ctx, cx, cy, size, color, width) {
  var pts = hexCorners(cx, cy);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 1;
  ctx.stroke();
}

/**
 * Draw the whole map onto a canvas at its native (already-scaled) size.
 * `map`/`discovered`/`location` mirror the GameState fields directly.
 * `reachable` is the set of hexKeys the player could move to right now.
 */
export function drawWorldMap(canvas, map, discoveredKeys, location, reachableKeys) {
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  var scale = canvas.width / MAP_LW;
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(0, 0, MAP_LW, MAP_LH);

  var discovered = new Set(discoveredKeys);
  var reachable = new Set(reachableKeys);

  Object.keys(map.terrain).forEach(function (key) {
    if (!discovered.has(key)) return;
    var parts = key.split(",");
    var hex = { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
    var p = hexToPixel(hex);
    if (p.x < -HEX_SIZE || p.x > MAP_LW + HEX_SIZE || p.y < -HEX_SIZE || p.y > MAP_LH + HEX_SIZE) return;
    var terrain = TERRAIN_COLORS[map.terrain[key]] || TERRAIN_COLORS.plains;
    var isHere = hex.q === location.hex.q && hex.r === location.hex.r;
    var isReachable = reachable.has(key) && !isHere;
    fillHex(ctx, p.x, p.y, HEX_SIZE - 0.5, terrain.fill);
    strokeHex(ctx, p.x, p.y, HEX_SIZE - 0.5, terrain.stroke, 0.75);
    if (isReachable) strokeHex(ctx, p.x, p.y, HEX_SIZE - 2, "#ffe9c2", 1.5);
  });

  // Roads: tan segments joining the centers of adjacent discovered road hexes.
  // Settlement hexes are part of the road network (paths terminate on them).
  var roads = new Set(map.roads || []);
  var ROAD_DIRS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }]; // half the 6, so each pair draws once
  roads.forEach(function (key) {
    if (!discovered.has(key)) return;
    var parts = key.split(",");
    var hex = { q: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
    var p = hexToPixel(hex);
    ROAD_DIRS.forEach(function (d) {
      var nKey = (hex.q + d.q) + "," + (hex.r + d.r);
      if (!roads.has(nKey) || !discovered.has(nKey)) return;
      var np = hexToPixel({ q: hex.q + d.q, r: hex.r + d.r });
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(np.x, np.y);
      ctx.strokeStyle = ROAD_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  // Settlements: a small keep/roof icon over their hex.
  map.settlements.forEach(function (s) {
    var key = s.hex.q + "," + s.hex.r;
    if (!discovered.has(key)) return;
    var p = hexToPixel(s.hex);
    var isCity = s.kind === "city";
    var w = isCity ? 9 : 6, h = isCity ? 7 : 5;
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(p.x - w / 2 - 1, p.y - h / 2, w + 2, h + 1);
    ctx.fillStyle = isCity ? "#d8b24a" : "#c89a58";
    ctx.fillRect(p.x - w / 2, p.y - h / 2 + 1, w, h - 1);
    ctx.fillStyle = "#9c4026";
    ctx.fillRect(p.x - w / 2 - 1, p.y - h / 2 - 2, w + 2, 3);
  });

  // The player's token: a warm dot with a dark outline, on their current hex.
  var here = hexToPixel(location.hex);
  ctx.beginPath();
  ctx.arc(here.x, here.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#e9b96a";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#241a10";
  ctx.stroke();

  ctx.restore();
}

/** Convert a canvas-space click (any DPR/CSS scale) to a hex coordinate. */
export function hexAtCanvasPoint(canvas, clientX, clientY) {
  var rect = canvas.getBoundingClientRect();
  var px = ((clientX - rect.left) / rect.width) * MAP_LW;
  var py = ((clientY - rect.top) / rect.height) * MAP_LH;
  return pixelToHex(px, py);
}
