// ---------------------------------------------------------------------------
// npcSprites.ts — the big animated dialogue portraits for the named NPCs.
//
// A second, larger paper-doll, separate from sprites.ts's 16×24 world sprite:
// a 48×56 front-facing townsfolk chassis (ported from the "Townsfolk Sprite"
// reference) animated continuously from a time value — sine bobs, gesturing
// arms, animated brows and mouth. Each named NPC (npcs.ts) gets a palette,
// feature flags, and a signature prop on the shared chassis.
//
// Stances (the conversation UI moves between them as the dialogue advances):
//   idle  — breathing, blinking, hands down
//   talk  — head bob, working mouth, both hands gesturing
//   point — leaning in, raised brows, one arm out: making you an offer
//
// Every id in NPCS must have an entry in NPC_PORTRAITS; test/npcSprites.test.ts
// enforces this, same contract as the gear registries.
// ---------------------------------------------------------------------------

export type NpcStance = "idle" | "talk" | "point";

/** The logical sprite box (pixels at scale 1). */
export const NPC_BOX = { w: 48, h: 56 };

const OUT = "#241209";
const EYE_WHITE = "#f4ecd8";
const MOUTH = "#4a1f18";
const TONGUE = "#c56a55";
const TEETH = "#f4ecd8";
const SHADOW = "rgba(20,12,6,0.28)";

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;

/** Everything that makes one NPC's portrait theirs. */
export interface NpcPortrait {
  skin: string;
  skinS: string;
  /** Outfit body (tunic, dress, robe, coat). */
  outfit: string;
  outfitS: string;
  outfitH: string;
  sleeve: string;
  sleeveS: string;
  legs: string;
  legsS: string;
  boot: string;
  bootS: string;
  belt: string;
  buckle: string;
  hair: string;
  hairstyle: "short" | "long" | "bald" | "bun";
  beard: "none" | "trim" | "full";
  beardColor?: string;
  headgear: "none" | "cap" | "scarf" | "helmet" | "hood" | "circlet";
  headgearColor: string;
  headgearS: string;
  /** A long garment: skirt to the boots instead of trousered legs. */
  robe?: boolean;
  /** Bare forearms below a short sleeve (a working innkeeper's arms). */
  rolledSleeves?: boolean;
  /** The face is lost in a hood's shadow — only pale eyes show (Rook). */
  eyesOnly?: boolean;
  /** Signature prop, drawn last: (R, torsoX, torsoY, bob) => void. */
  prop?: (R: Rect, tx: number, ty: number, oy: number) => void;
}

export const NPC_PORTRAITS: Record<string, NpcPortrait> = {
  // Mira Thatch — warm colors, headscarf, working apron, sleeves rolled.
  mira: {
    skin: "#e6a877",
    skinS: "#c47f4f",
    outfit: "#7a4a30",
    outfitS: "#5c3620",
    outfitH: "#96603e",
    sleeve: "#6b3f28",
    sleeveS: "#52301e",
    legs: "#4a3a2c",
    legsS: "#38281c",
    boot: "#2e2013",
    bootS: "#1f150c",
    belt: "#3a2414",
    buckle: "#b08a50",
    hair: "#6b4626",
    hairstyle: "bun",
    beard: "none",
    headgear: "scarf",
    headgearColor: "#a5502e",
    headgearS: "#7e3a20",
    rolledSleeves: true,
    prop: (R, tx, ty) => {
      // The Hearthside's apron, tied at the waist.
      R(tx + 4, ty + 3, 8, 12, "#d8c9a0");
      R(tx + 4, ty + 3, 8, 1, "#b8a880");
      R(tx + 5, ty + 13, 6, 2, "#c4b58c");
    },
  },
  // Captain Gael — iron kettle helm, tan gambeson, and his spear at hand.
  gael: {
    skin: "#d9a06e",
    skinS: "#b57a48",
    outfit: "#9a8a62",
    outfitS: "#7a6c4a",
    outfitH: "#b4a478",
    sleeve: "#8a7a54",
    sleeveS: "#6a5c40",
    legs: "#5b4630",
    legsS: "#443320",
    boot: "#2e2013",
    bootS: "#1f150c",
    belt: "#3a2414",
    buckle: "#d9b24a",
    hair: "#3a2a1a",
    hairstyle: "short",
    beard: "trim",
    headgear: "helmet",
    headgearColor: "#8a92a2",
    headgearS: "#6a727c",
    prop: (R, tx, _ty, oy) => {
      // The watch spear, planted by his left boot.
      R(tx - 5, 6 + oy, 2, 45, "#8a6a3a");
      R(tx - 5, 3 + oy, 2, 3, "#c8ccd4");
      R(tx - 6, 5 + oy, 4, 1, "#aab0ba");
    },
  },
  // Brother Eddan — bald crown, white beard, a road-grey robe, his book.
  eddan: {
    skin: "#d9a06e",
    skinS: "#b57a48",
    outfit: "#6b6154",
    outfitS: "#524a40",
    outfitH: "#847a6a",
    sleeve: "#5e564a",
    sleeveS: "#484238",
    legs: "#4a4238",
    legsS: "#38322a",
    boot: "#2e2418",
    bootS: "#1f180e",
    belt: "#3a3020",
    buckle: "#8a7a5a",
    hair: "#d8d2c4",
    hairstyle: "bald",
    beard: "full",
    beardColor: "#d8d2c4",
    headgear: "none",
    headgearColor: "#6b6154",
    headgearS: "#524a40",
    robe: true,
    prop: (R, tx, ty) => {
      // The wrapped book that started everything, kept at his hip.
      R(tx + 12, ty + 11, 6, 5, "#5a3a2a");
      R(tx + 12, ty + 11, 6, 1, "#7a5a3a");
      R(tx + 14, ty + 11, 1, 5, "#c8b890");
    },
  },
  // Valdis Crane — dark Warden leathers, a scarred squint, knife at the belt.
  valdis: {
    skin: "#c98a55",
    skinS: "#a3683c",
    outfit: "#4a5244",
    outfitS: "#363e32",
    outfitH: "#5e6856",
    sleeve: "#414a3c",
    sleeveS: "#30382c",
    legs: "#3a3a34",
    legsS: "#2a2a26",
    boot: "#241f16",
    bootS: "#17130c",
    belt: "#2a2014",
    buckle: "#8a909a",
    hair: "#4a4440",
    hairstyle: "short",
    beard: "trim",
    beardColor: "#5a544e",
    headgear: "none",
    headgearColor: "#4a5244",
    headgearS: "#363e32",
    prop: (R, tx, ty) => {
      // A Warden's knife and a shoulder strap that's seen weather.
      R(tx + 1, ty, 3, 15, "#36302a");
      R(tx + 12, ty + 14, 2, 5, "#c8ccd4");
      R(tx + 11, ty + 13, 4, 1, "#3a2a1a");
    },
  },
  // Lady Serenthal Voss — plum and gold, long dark hair under a circlet.
  voss: {
    skin: "#eec39a",
    skinS: "#cf9c6c",
    outfit: "#5a3a5e",
    outfitS: "#432a48",
    outfitH: "#7a5280",
    sleeve: "#4e3252",
    sleeveS: "#3a243e",
    legs: "#3a2a3e",
    legsS: "#2a1e2e",
    boot: "#2a2028",
    bootS: "#1c141c",
    belt: "#3a2a3e",
    buckle: "#d9b24a",
    hair: "#2a2018",
    hairstyle: "long",
    beard: "none",
    headgear: "circlet",
    headgearColor: "#d9b24a",
    headgearS: "#b08a2a",
    robe: true,
    prop: (R, tx, ty) => {
      // Gold trim at the collar, and the Voss signet on a chain.
      R(tx + 3, ty - 1, 10, 1, "#d9b24a");
      R(tx + 7, ty + 2, 2, 2, "#d9b24a");
    },
  },
  // The Merchant Rook — a hood, a black coat, and nothing of his face but eyes.
  rook: {
    skin: "#b58a62",
    skinS: "#93683e",
    outfit: "#2a242c",
    outfitS: "#1d181f",
    outfitH: "#3a323e",
    sleeve: "#241f26",
    sleeveS: "#18141a",
    legs: "#231e24",
    legsS: "#171318",
    boot: "#17131a",
    bootS: "#0e0b10",
    belt: "#17131a",
    buckle: "#8a6a3a",
    hair: "#1d181f",
    hairstyle: "short",
    beard: "none",
    headgear: "hood",
    headgearColor: "#1f1a22",
    headgearS: "#141018",
    eyesOnly: true,
    prop: (R, tx, ty) => {
      // A single gold coin, always between his fingers somewhere.
      R(tx + 17, ty + 12, 2, 2, "#d9b24a");
    },
  },
};

/**
 * Draw one NPC's animated portrait. `t` is seconds — call every frame and the
 * chassis breathes, blinks, gestures, and works its mouth on its own.
 * (x, y) is the top-left of the 48×56 box at the given scale.
 */
export function drawNpcPortrait(
  ctx: CanvasRenderingContext2D,
  t: number,
  npcId: string,
  stance: NpcStance,
  scale = 2,
  x = 0,
  y = 0,
): void {
  const look = NPC_PORTRAITS[npcId];
  if (!look) return;

  const R: Rect = (rx, ry, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(
      Math.round(x + rx * scale),
      Math.round(y + ry * scale),
      Math.round(w * scale),
      Math.round(h * scale),
    );
  };
  const cyc = (spd: number) => t * spd;

  // --- Animation state (the reference's idle/talk/point curves) --------------
  let bob = 0;
  let lean = 0;
  let headBob = 0;
  let armL: "down" | "hip" | "gesture" = "down";
  let armR: "down" | "point" | "gesture2" = "down";
  let brow = 0;
  let mouth = 0;

  if (stance === "idle") {
    bob = Math.sin(cyc(2.2)) * 0.6;
    headBob = Math.sin(cyc(2.2) + 0.4) * 0.5;
  } else if (stance === "point") {
    const jitter = Math.round(Math.sin(cyc(26)) * 0.7);
    lean = 1.4 + jitter;
    brow = 1;
    mouth = Math.sin(cyc(9)) > 0.2 ? 0.7 : 0.15;
    armR = "point";
    armL = "hip";
    bob = Math.sin(cyc(3)) * 0.4;
  } else {
    // talk
    headBob = Math.sin(cyc(3)) * 0.6;
    bob = Math.sin(cyc(3)) * 0.4;
    brow = 0.25 + Math.max(0, Math.sin(cyc(1.3))) * 0.25;
    mouth = (Math.sin(cyc(10)) * 0.5 + 0.5) * (0.4 + 0.5 * Math.max(0, Math.sin(cyc(2.1))));
    armL = "gesture";
    armR = "gesture2";
  }

  const oy = bob;
  const cx = 24;

  // Ground shadow.
  ctx.fillStyle = SHADOW;
  const sw = stance === "point" ? 22 : 20;
  ctx.beginPath();
  ctx.ellipse(x + cx * scale, y + 52 * scale, (sw / 2) * scale, 2.4 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const tx = cx - 8 + lean;
  const ty = 24 + oy;

  // --- Legs, or the fall of a robe -------------------------------------------
  if (look.robe) {
    R(tx - 1, ty + 14, 18, 12, look.outfit);
    R(tx - 1, ty + 14, 3, 12, look.outfitS);
    R(tx + 14, ty + 14, 3, 12, look.outfitS);
    R(tx + 1, ty + 25, 16, 1, look.outfitS);
    R(tx + 2, 50 + oy, 5, 2, look.boot);
    R(tx + 10, 50 + oy, 5, 2, look.boot);
  } else {
    const drawLeg = (lx: number) => {
      R(lx, 39 + oy, 5, 8, look.legs);
      R(lx, 39 + oy, 2, 8, look.legsS);
      R(lx - 1, 48 + oy, 6, 4, look.boot);
      R(lx - 1, 50 + oy, 6, 2, look.bootS);
    };
    drawLeg(18);
    drawLeg(25);
  }

  // --- Torso ------------------------------------------------------------------
  R(tx + 1, ty - 2, 14, 2, look.outfit);
  R(tx, ty, 16, 15, look.outfit);
  R(tx, ty, 3, 15, look.outfitS);
  R(tx + 13, ty, 3, 15, look.outfitS);
  R(tx + 4, ty + 1, 3, 12, look.outfitH);
  R(tx, ty + 13, 16, 2, look.belt);
  R(tx + 7, ty + 13, 2, 2, look.buckle);

  // Signature prop under the arms (a spear plants behind, an apron ties over).
  look.prop?.(R, tx, ty, oy);

  // --- Arms ---------------------------------------------------------------------
  const shL = { x: tx - 1, y: ty };
  const shR = { x: tx + 15, y: ty };
  const armSeg = (ax: number, ay: number, w: number, h: number, lower = false) => {
    const main = lower && look.rolledSleeves ? look.skin : look.sleeve;
    const shade = lower && look.rolledSleeves ? look.skinS : look.sleeveS;
    R(ax, ay, w, h, main);
    R(ax, ay, Math.min(2, w), h, shade);
  };
  const hand = (hx: number, hy: number) => {
    R(hx, hy, 4, 3, look.skin);
    R(hx, hy + 2, 4, 1, look.skinS);
  };

  if (armL === "down") {
    armSeg(shL.x - 2, shL.y + 1, 4, 6);
    armSeg(shL.x - 2, shL.y + 6, 4, 5, true);
    hand(shL.x - 2, shL.y + 11);
  } else if (armL === "hip") {
    armSeg(shL.x - 3, shL.y + 1, 4, 5);
    armSeg(shL.x - 3, shL.y + 5, 3, 5, true);
    hand(shL.x, shL.y + 8);
  } else {
    const g = Math.sin(t * 6) * 2;
    armSeg(shL.x - 2, shL.y + 1, 4, 6);
    armSeg(shL.x - 3, shL.y + 5 - g, 4, 5, true);
    hand(shL.x - 3, shL.y + 8 - g);
  }

  if (armR === "down") {
    armSeg(shR.x - 2, shR.y + 1, 4, 6);
    armSeg(shR.x - 2, shR.y + 6, 4, 5, true);
    hand(shR.x - 2, shR.y + 11);
  } else if (armR === "point") {
    const py = shR.y + 1;
    armSeg(shR.x - 1, py, 6, 4);
    armSeg(shR.x + 4, py, 6, 4, true);
    R(shR.x + 9, py, 3, 4, look.skin);
    R(shR.x + 9, py + 2, 3, 1, look.skinS);
    R(shR.x + 11, py + 1, 4, 2, look.skin);
    R(shR.x + 14, py + 1, 1, 2, look.skinS);
  } else {
    const g = Math.cos(t * 6) * 2;
    armSeg(shR.x - 1, shR.y + 1, 4, 6);
    armSeg(shR.x + 1, shR.y + 5 - g, 4, 5, true);
    hand(shR.x + 1, shR.y + 8 - g);
  }

  // --- Head ---------------------------------------------------------------------
  const hx = cx - 6 + lean * 0.6;
  const hy = 9 + oy + headBob;
  R(cx - 2, ty - 3, 4, 3, look.skin); // neck
  R(cx - 2, ty - 3, 4, 1, look.skinS);
  R(hx, hy, 12, 12, look.skin);
  R(hx, hy + 2, 2, 9, look.skinS);
  R(hx + 10, hy + 2, 2, 9, look.skinS);
  R(hx - 1, hy + 5, 1, 3, look.skin); // ears
  R(hx + 12, hy + 5, 1, 3, look.skin);

  // --- Hair (drawn under the headgear) --------------------------------------------
  if (look.hairstyle === "short") {
    R(hx - 1, hy - 1, 14, 3, look.hair);
    R(hx, hy + 2, 1, 3, look.hair);
    R(hx + 11, hy + 2, 1, 3, look.hair);
  } else if (look.hairstyle === "long") {
    R(hx - 1, hy - 1, 14, 3, look.hair);
    R(hx - 2, hy + 1, 2, 14, look.hair); // falls past the shoulders
    R(hx + 12, hy + 1, 2, 14, look.hair);
  } else if (look.hairstyle === "bun") {
    R(hx - 1, hy - 1, 14, 2, look.hair);
    R(hx + 3, hy - 3, 6, 3, look.hair); // the bun above the scarf line
  } else {
    // bald: a fringe at the temples only
    R(hx - 1, hy + 3, 1, 4, look.hair);
    R(hx + 12, hy + 3, 1, 4, look.hair);
  }

  // --- Headgear ---------------------------------------------------------------------
  if (look.headgear === "cap") {
    R(hx - 1, hy - 1, 14, 4, look.headgearColor);
    R(hx - 1, hy + 2, 14, 1, look.headgearS);
    R(hx + 1, hy - 3, 10, 2, look.headgearColor);
  } else if (look.headgear === "scarf") {
    R(hx - 1, hy - 2, 14, 4, look.headgearColor);
    R(hx - 1, hy + 1, 14, 1, look.headgearS);
    R(hx + 12, hy + 2, 2, 4, look.headgearColor); // knot at the ear
  } else if (look.headgear === "helmet") {
    R(hx - 1, hy - 2, 14, 5, look.headgearColor);
    R(hx + 1, hy - 4, 10, 2, look.headgearColor);
    R(hx - 1, hy + 2, 14, 1, look.headgearS);
    R(hx + 5, hy + 3, 2, 3, look.headgearS); // nasal guard
  } else if (look.headgear === "hood") {
    R(hx - 2, hy - 3, 16, 6, look.headgearColor);
    R(hx - 2, hy + 2, 3, 10, look.headgearColor);
    R(hx + 11, hy + 2, 3, 10, look.headgearColor);
    R(hx - 2, hy - 3, 16, 1, look.headgearS);
    if (look.eyesOnly) R(hx, hy + 3, 12, 9, look.headgearS); // the face in shadow
  } else if (look.headgear === "circlet") {
    R(hx - 1, hy + 1, 14, 1, look.headgearColor);
    R(hx + 5, hy, 2, 1, look.headgearS); // a set stone
  }

  // --- Face -----------------------------------------------------------------------
  const blink = Math.sin(cyc(1.7)) > 0.97;
  const eY = hy + 5;

  if (look.eyesOnly) {
    // Two pale points in the hood's dark — they still blink.
    if (!blink) {
      R(hx + 3, eY, 2, 1, "#cfe8ff");
      R(hx + 8, eY, 2, 1, "#cfe8ff");
    }
  } else {
    // Brows.
    const bY = hy + 4;
    if (brow > 0.5) {
      R(hx + 2, bY + 1, 3, 1, OUT);
      R(hx + 3, bY, 2, 1, OUT);
      R(hx + 7, bY + 1, 3, 1, OUT);
      R(hx + 7, bY, 2, 1, OUT);
    } else {
      R(hx + 2, bY, 3, 1, OUT);
      R(hx + 7, bY, 3, 1, OUT);
    }

    // Eyes.
    if (blink) {
      R(hx + 3, eY + 1, 3, 1, look.skinS);
      R(hx + 7, eY + 1, 3, 1, look.skinS);
    } else if (brow > 0.5) {
      R(hx + 3, eY, 3, 2, EYE_WHITE);
      R(hx + 4, eY, 2, 2, OUT);
      R(hx + 7, eY, 3, 2, EYE_WHITE);
      R(hx + 7, eY, 2, 2, OUT);
    } else {
      R(hx + 3, eY, 2, 2, EYE_WHITE);
      R(hx + 4, eY, 1, 2, OUT);
      R(hx + 8, eY, 2, 2, EYE_WHITE);
      R(hx + 8, eY, 1, 2, OUT);
    }

    // Nose.
    R(hx + 5, hy + 6, 2, 2, look.skinS);

    // Mouth — animated while talking.
    const mY = hy + 9;
    const mo = Math.max(0, Math.min(1, mouth));
    if (mo < 0.12) {
      R(hx + 3, mY, 6, 1, brow > 0.5 ? OUT : MOUTH);
    } else {
      const mh = 1 + Math.round(mo * 4);
      R(hx + 3, mY, 6, mh, MOUTH);
      R(hx + 4, mY, 4, 1, TEETH);
      if (mh >= 3) R(hx + 4, mY + mh - 1, 4, 1, TONGUE);
    }

    // Beard.
    const bc = look.beardColor ?? look.hair;
    if (look.beard === "trim") {
      R(hx + 2, hy + 11, 8, 1, bc);
      R(hx + 4, hy + 12, 4, 1, bc);
    } else if (look.beard === "full") {
      R(hx + 1, hy + 8, 2, 4, bc);
      R(hx + 9, hy + 8, 2, 4, bc);
      R(hx + 2, hy + 11, 8, 2, bc);
      R(hx + 3, hy + 13, 6, 3, bc);
      R(hx + 4, hy + 16, 4, 2, bc);
    }
  }
}
