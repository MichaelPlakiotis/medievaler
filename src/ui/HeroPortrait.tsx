// ---------------------------------------------------------------------------
// HeroPortrait.tsx — a small animated canvas that draws the character's
// paper-doll (src/scene/sprites.ts). It re-renders whenever the look changes,
// so equipping a weapon or armor visibly changes the person wearing it.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { drawHero, HERO_BOX, type HeroLook, type Pose } from "../scene/sprites";

/** Idle animation speed — a slow, homely 2-frame bob. */
const FRAME_MS = 320;

export function HeroPortrait({
  look,
  pose = "idle",
  scale = 5,
}: {
  look: HeroLook;
  pose?: Pose;
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Padding so raised weapons (drawn above the box) aren't clipped.
  const pad = 10;
  const w = (HERO_BOX.w + pad) * scale;
  const h = (HERO_BOX.h + pad) * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    function paint() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.imageSmoothingEnabled = false;
      drawHero(ctx!, canvas!.width / 2, canvas!.height - (pad / 2) * scale, look, pose, frame, scale);
    }
    paint();
    const timer = window.setInterval(() => {
      frame = frame + 1;
      paint();
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [look.gender, look.weaponId, look.armorId, look.seed, pose, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      className="hero-portrait"
      aria-label="your character"
    />
  );
}
