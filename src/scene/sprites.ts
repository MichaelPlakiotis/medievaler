// ---------------------------------------------------------------------------
// sprites.ts — the procedural pixel-art paper-doll and creature sprites.
//
// The hero is drawn in layers: body (skin/hair from a name-derived seed) →
// armor layer keyed by the equipped armor id → weapon layer keyed by the
// equipped weapon id. Equip different gear and the same character visibly
// changes — in the character sheet, in the town, and in combat.
//
// Every weapon, armor, and enemy id MUST have an entry in its registry below;
// test/sprites.test.ts enforces this, so adding gear without a sprite fails
// the build. Unlike townScene.ts this file is fully typed: registries are data
// the rest of the game depends on.
// ---------------------------------------------------------------------------

import type { Character, Gender } from "../game/types";

/** Animation poses shared by the hero and enemies. */
export type Pose = "idle" | "walk" | "attack" | "hurt";

/** Everything needed to draw a character: gender, gear, and a look seed. */
export interface HeroLook {
  gender: Gender;
  weaponId: string;
  armorId: string | null;
  /** Hashed from the name — picks skin/hair/tunic so each person looks distinct. */
  seed: number;
}

/** The hero's logical sprite box (pixels at scale 1, anchored bottom-center). */
export const HERO_BOX = { w: 16, h: 24 };
/** The enemy sprite box (same anchor). */
export const ENEMY_BOX = { w: 20, h: 24 };

/** Derive a character's drawable look from their current state. */
export function heroLookOf(c: Character): HeroLook {
  return {
    gender: c.gender,
    weaponId: c.weapon.id,
    armorId: c.armor?.id ?? null,
    seed: hashString(c.name),
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// --- The painter -------------------------------------------------------------
// Layer functions draw through this tiny helper so they never worry about
// position, scale, or which way the sprite faces (mirroring is dx math here).

export interface SpritePainter {
  /** Fill a rect at (dx, dy) inside the sprite box; dy measured from the top. */
  px(dx: number, dy: number, w: number, h: number, color: string): void;
  pose: Pose;
  /** Alternating animation frame (0/1). */
  frame: number;
  /** Where the leading hand is right now — weapon layers draw from here. */
  handX: number;
  handY: number;
}

export type LayerFn = (s: SpritePainter) => void;

function makePainter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  pose: Pose,
  frame: number,
  scale: number,
  facing: number,
): SpritePainter {
  // A subtle whole-body offset sells the pose: lean into a swing, recoil when hurt.
  const lean = pose === "attack" ? 1 : pose === "hurt" ? -1 : 0;
  return {
    pose,
    frame: frame & 1,
    // The weapon rides just outside the body silhouette so it stays readable.
    handX: pose === "attack" ? 15 : 14,
    handY: pose === "attack" ? 7 : 13,
    px(dx, dy, w, h, color) {
      const mx = facing >= 0 ? dx + lean : boxW - dx - w - lean;
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round(x + (mx - boxW / 2) * scale),
        Math.round(y + (dy - boxH) * scale),
        Math.max(1, Math.round(w * scale)),
        Math.max(1, Math.round(h * scale)),
      );
    },
  };
}

// --- Hero palette ------------------------------------------------------------

const SKINS = ["#e8b58a", "#d9a06e", "#c98a55", "#9a6a42"];
const HAIRS = ["#3a2a1a", "#6a4a22", "#1e1a16", "#8a6a3a", "#a84a2a", "#d8b24a"];
const TUNICS = ["#7a6a4a", "#5a6a7a", "#6a4a5a", "#4a6a4a", "#8a5a3a"];

interface HeroPalette {
  skin: string;
  hair: string;
  tunic: string;
}

function paletteOf(look: HeroLook): HeroPalette {
  return {
    skin: SKINS[look.seed % SKINS.length],
    hair: HAIRS[(look.seed >> 2) % HAIRS.length],
    tunic: TUNICS[(look.seed >> 4) % TUNICS.length],
  };
}

// --- The body (base layer) ---------------------------------------------------
// Box 16×24, feet on the bottom edge, drawn facing right (the painter mirrors).

function drawBody(s: SpritePainter, pal: HeroPalette, gender: Gender) {
  const bob = s.pose === "idle" && s.frame === 1 ? 1 : 0;

  // Legs & boots. Walking alternates a spread stride with feet together.
  const stride = s.pose === "walk" && s.frame === 0 ? 1 : 0;
  const pants = "#4a3a2c";
  s.px(5 - stride, 15, 3, 6, pants); // back leg
  s.px(9 + stride, 15, 3, 6, pants); // front leg
  s.px(5 - stride, 21, 3, 3, "#2e2318"); // back boot
  s.px(9 + stride, 21, 3, 3, "#2e2318"); // front boot

  // Long hair falls behind the torso (drawn first so the body overlaps it).
  if (gender === "female") s.px(3, 2 + bob, 3, 11, pal.hair);

  // Torso — the plain tunic; armor layers paint over this region.
  s.px(4, 7 + bob, 8, 8, pal.tunic);
  s.px(4, 14 + bob, 8, 1, "#33291d"); // belt

  // Arms: the back arm hangs; the front arm follows the pose.
  s.px(2, 8 + bob, 2, 5, pal.tunic);
  s.px(2, 13 + bob, 2, 1, pal.skin); // back hand
  if (s.pose === "attack") {
    s.px(12, 7, 2, 3, pal.tunic); // arm raised to swing
    s.px(13, 6, 2, 2, pal.skin); // hand up by the weapon
  } else {
    s.px(12, 8 + bob, 2, 5, pal.tunic);
    s.px(12, 13 + bob, 2, 1, pal.skin);
  }

  // Head, face, hair.
  s.px(5, 2 + bob, 6, 5, pal.skin);
  s.px(9, 3 + bob, 1, 1, "#20160e"); // eye on the leading side
  s.px(4, 0 + bob, 8, 2, pal.hair); // cap of hair
  s.px(4, 2 + bob, 1, 2, pal.hair); // back of the head
}

// --- Armor layers (keyed by armor id; "none" shows the bare tunic) ------------

export const ARMOR_SPRITES: Record<string, LayerFn> = {
  none: () => {}, // the seed-colored tunic from the body layer shows through
  padded_tunic: (s) => {
    s.px(4, 7, 8, 8, "#d8c9a0");
    s.px(4, 9, 8, 1, "#b8a880"); // quilting stitches
    s.px(4, 11, 8, 1, "#b8a880");
    s.px(4, 13, 8, 1, "#b8a880");
    s.px(4, 14, 8, 1, "#8a7a5a");
  },
  leather_jerkin: (s) => {
    s.px(4, 7, 8, 8, "#7a5230");
    s.px(6, 7, 1, 8, "#9a7242"); // lacing
    s.px(9, 7, 1, 8, "#9a7242");
    s.px(3, 7, 3, 2, "#5c3e24"); // shoulder pads
    s.px(10, 7, 3, 2, "#5c3e24");
    s.px(4, 14, 8, 1, "#4a3018");
  },
  iron_cuirass: (s) => {
    s.px(4, 7, 8, 8, "#9aa2ac");
    s.px(5, 8, 2, 5, "#c8d0d8"); // polished highlight
    s.px(4, 13, 8, 2, "#6a727c"); // faulds
    s.px(3, 7, 3, 2, "#7a828c"); // pauldrons
    s.px(10, 7, 3, 2, "#7a828c");
  },
  chainmail: (s) => {
    s.px(4, 7, 8, 9, "#8a92a2");
    // Dotted ring texture.
    for (let ry = 8; ry < 15; ry += 2)
      for (let rx = 5 + (ry % 4 === 0 ? 1 : 0); rx < 12; rx += 2) s.px(rx, ry, 1, 1, "#6a7282");
    // Coif over the crown and around the face.
    s.px(4, 0, 8, 2, "#8a92a2");
    s.px(4, 2, 1, 4, "#8a92a2");
    s.px(5, 6, 6, 1, "#8a92a2");
  },
};

// --- Weapon layers (keyed by weapon id) ---------------------------------------
// Drawn from the leading hand (s.handX/handY); the attack pose raises the hand,
// so the same vertical weapon reads as a swing.

export const WEAPON_SPRITES: Record<string, LayerFn> = {
  travelers_knife: (s) => {
    s.px(s.handX, s.handY - 4, 1, 4, "#c8ccd4"); // blade
    s.px(s.handX - 1, s.handY, 3, 1, "#6a4a22"); // guard
  },
  oak_cudgel: (s) => {
    s.px(s.handX, s.handY - 5, 2, 6, "#9a7442");
    s.px(s.handX - 1, s.handY - 8, 3, 3, "#b08a50"); // knotted head
    s.px(s.handX - 1, s.handY - 5, 3, 1, "#5a3e20"); // shadow under the knot
  },
  leather_shortbow: (s) => {
    s.px(s.handX + 1, s.handY - 5, 1, 2, "#6a4a22"); // upper limb curving away
    s.px(s.handX + 2, s.handY - 3, 1, 6, "#7a5a30"); // belly of the bow
    s.px(s.handX + 1, s.handY + 3, 1, 2, "#6a4a22"); // lower limb
    s.px(s.handX, s.handY - 4, 1, 9, "#e8e4d8"); // string
  },
  steel_rapier: (s) => {
    s.px(s.handX, s.handY - 7, 1, 7, "#d8dce4"); // slim blade
    s.px(s.handX - 1, s.handY, 3, 1, "#c8a232"); // swept guard
  },
  war_axe: (s) => {
    s.px(s.handX, s.handY - 7, 1, 8, "#6a4a22"); // haft
    s.px(s.handX + 1, s.handY - 7, 3, 3, "#aab0ba"); // bearded head
    s.px(s.handX + 1, s.handY - 4, 2, 1, "#8a909a");
  },
  iron_greatsword: (s) => {
    s.px(s.handX, s.handY - 9, 2, 9, "#c0c6d0"); // broad blade
    s.px(s.handX, s.handY - 10, 1, 1, "#c0c6d0"); // tip
    s.px(s.handX - 2, s.handY, 6, 1, "#7a6a3a"); // crossguard
    s.px(s.handX, s.handY + 1, 1, 2, "#4a3a22"); // grip below the hand
  },
};

/** Draw the hero at (x, y) = feet center. `facing` 1 = right, -1 = left. */
export function drawHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: HeroLook,
  pose: Pose = "idle",
  frame = 0,
  scale = 1,
  facing = 1,
): void {
  const s = makePainter(ctx, x, y, HERO_BOX.w, HERO_BOX.h, pose, frame, scale, facing);
  const pal = paletteOf(look);
  drawBody(s, pal, look.gender);
  (ARMOR_SPRITES[look.armorId ?? "none"] ?? ARMOR_SPRITES.none)(s);
  (WEAPON_SPRITES[look.weaponId] ?? (() => {}))(s);
}

// --- Enemies -------------------------------------------------------------------

export type EnemyDrawFn = (s: SpritePainter) => void;

/** A hero-shaped body in different colors — the town's human troublemakers. */
function humanoid(
  s: SpritePainter,
  opts: { skin: string; hair: string; tunic: string; hood?: boolean },
) {
  drawBody(s, { skin: opts.skin, hair: opts.hair, tunic: opts.tunic }, "male");
  if (opts.hood) {
    s.px(4, 0, 8, 3, opts.tunic); // hood over the hair
    s.px(4, 3, 2, 4, opts.tunic);
    s.px(10, 3, 2, 3, opts.tunic);
  }
}

/**
 * Four legs, a body, and a raised head — the shared beast chassis. Returns the
 * body-top y so callers can place ears, eyes, and tails relative to it.
 */
function beast(s: SpritePainter, opts: { body: string; belly: string; bodyH: number }): number {
  const step = s.pose === "walk" || s.pose === "attack" ? s.frame : 0;
  const gy = ENEMY_BOX.h; // ground line
  const y0 = gy - 5 - opts.bodyH; // top of the torso block
  s.px(2, y0, 12, opts.bodyH, opts.body); // body
  s.px(3, y0 + opts.bodyH - 2, 10, 2, opts.belly); // belly shading
  // Four legs; walking alternates the pairs.
  s.px(3, gy - 5, 2, 5 - step, opts.body);
  s.px(6, gy - 5, 2, 5 - (1 - step), opts.body);
  s.px(9, gy - 5, 2, 5 - step, opts.body);
  s.px(12, gy - 5, 2, 5 - (1 - step), opts.body);
  // Head raised above the shoulders at the front.
  s.px(12, y0 - 4, 6, 6, opts.body);
  return y0;
}

export const ENEMY_SPRITES: Record<string, EnemyDrawFn> = {
  stray_dog: (s) => {
    const y0 = beast(s, { body: "#8a7a5a", belly: "#a99a78", bodyH: 6 });
    s.px(13, y0 - 6, 1, 2, "#6a5a40"); // ear
    s.px(17, y0 - 1, 2, 2, "#6a5a40"); // muzzle
    s.px(18, y0, 1, 1, "#1a1410"); // nose
    s.px(0, y0 - 1, 2, 3, "#8a7a5a"); // wagless tail
    s.px(16, y0 - 3, 1, 1, "#20160e"); // eye
  },
  boar: (s) => {
    const y0 = beast(s, { body: "#5a4230", belly: "#3e2c1e", bodyH: 7 });
    s.px(17, y0 - 1, 2, 3, "#7a5a42"); // snout
    s.px(18, y0 + 2, 1, 2, "#e8e4d8"); // tusk
    s.px(12, y0 - 6, 2, 2, "#3e2c1e"); // bristled ear
    s.px(3, y0 - 1, 10, 1, "#3e2c1e"); // ridge of bristles
    s.px(16, y0 - 3, 1, 1, "#20160e"); // eye
  },
  wolf: (s) => {
    const y0 = beast(s, { body: "#7a7e8a", belly: "#9a9eaa", bodyH: 6 });
    s.px(12, y0 - 6, 1, 2, "#5a5e6a"); // ears
    s.px(15, y0 - 6, 1, 2, "#5a5e6a");
    s.px(17, y0 - 1, 2, 2, "#5a5e6a"); // muzzle
    s.px(0, y0 - 3, 3, 3, "#9a9eaa"); // brush tail, held high
    s.px(16, y0 - 3, 1, 1, "#c02a2a"); // hungry eye
  },
  drunkard: (s) => {
    humanoid(s, { skin: "#d98a6a", hair: "#5a4a3a", tunic: "#6a4a2a" });
    s.px(s.handX, s.handY - 3, 1, 3, "#4a7a4a"); // the bottle
    s.px(s.handX, s.handY - 4, 1, 1, "#6a9a6a");
  },
  cutpurse: (s) => {
    humanoid(s, { skin: "#c98a55", hair: "#1e1a16", tunic: "#44404e", hood: true });
    s.px(s.handX, s.handY - 3, 1, 3, "#c8ccd4"); // drawn knife
  },
  // --- Beneath the barrow ---
  giant_rat: (s) => {
    const y0 = beast(s, { body: "#6a6252", belly: "#8a806a", bodyH: 5 });
    s.px(12, y0 - 5, 2, 2, "#9a8e78"); // large ear
    s.px(17, y0, 2, 2, "#4a4436"); // pointed muzzle
    s.px(18, y0 + 1, 1, 1, "#1a1410"); // nose
    s.px(0, y0, 3, 1, "#8a806a"); // long bald tail
    s.px(16, y0 - 2, 1, 1, "#c02a2a"); // beady red eye
  },
  barrow_skeleton: (s) => {
    humanoid(s, { skin: "#dcd6c4", hair: "#dcd6c4", tunic: "#5c5648" });
    // Ribs show through the tattered tunic.
    s.px(5, 9, 6, 1, "#3e3a30");
    s.px(5, 11, 6, 1, "#3e3a30");
    s.px(9, 3, 1, 1, "#1a1712"); // hollow eye
    s.px(s.handX, s.handY - 4, 1, 4, "#c8ccd4"); // ancient blade
  },
  tomb_bandit: (s) => {
    humanoid(s, { skin: "#b97a4a", hair: "#2a2018", tunic: "#5a4030", hood: true });
    s.px(s.handX, s.handY - 3, 1, 3, "#c8ccd4"); // blade
    s.px(s.handX - 1, s.handY, 3, 1, "#3a2a1a"); // grip
  },
  crypt_spider: (s) => {
    const body = "#3a3444", pale = "#7a7488";
    // Bulbous body sits low and wide; eight thin legs splay from it.
    s.px(5, 14, 10, 7, body);
    s.px(7, 15, 6, 4, pale);
    const step = s.pose === "walk" || s.pose === "attack" ? s.frame : 0;
    for (let i = 0; i < 4; i++) {
      const ly = 15 + i * 2 - step;
      s.px(0, ly, 5, 1, body); // legs to the back
      s.px(15, ly, 5, 1, body); // legs to the front
    }
    s.px(6, 12, 3, 3, body); // head
    s.px(7, 13, 1, 1, "#c02a2a");
    s.px(8, 13, 1, 1, "#c02a2a"); // paired red eyes
  },
  barrow_wight: (s) => {
    humanoid(s, { skin: "#a8b2b8", hair: "#e8ecf2", tunic: "#2a2c38" });
    // A tattered burial shroud hangs past the knees.
    s.px(3, 16, 10, 6, "#22242e");
    s.px(3, 21, 2, 3, "#22242e");
    s.px(11, 21, 2, 3, "#22242e");
    s.px(9, 3, 1, 1, "#8fe8ff"); // a single cold, glowing eye
    s.px(s.handX, s.handY - 5, 1, 5, "#7a8290"); // ancient bone weapon
  },
};

/** Draw an enemy at (x, y) = feet center. Enemies face left by default. */
export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  enemyId: string,
  pose: Pose = "idle",
  frame = 0,
  scale = 1,
  facing = -1,
): void {
  const fn = ENEMY_SPRITES[enemyId];
  if (!fn) return;
  const s = makePainter(ctx, x, y, ENEMY_BOX.w, ENEMY_BOX.h, pose, frame, scale, facing);
  fn(s);
}
