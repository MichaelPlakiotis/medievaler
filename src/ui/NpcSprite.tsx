// ---------------------------------------------------------------------------
// NpcSprite.tsx — a live canvas running one NPC's animated dialogue portrait
// (scene/npcSprites.ts). Continuously animated via requestAnimationFrame; the
// stance prop can change mid-conversation and the chassis flows into the new
// pose on the next frame.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { NPC_BOX, drawNpcPortrait, type NpcStance } from "../scene/npcSprites";

export function NpcSprite({
  npcId,
  stance,
  scale = 2,
}: {
  npcId: string;
  stance: NpcStance;
  scale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The stance lives in a ref so changing it doesn't restart the animation
  // clock — the sprite keeps breathing and simply shifts pose.
  const stanceRef = useRef(stance);
  stanceRef.current = stance;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawNpcPortrait(ctx, (performance.now() - start) / 1000, npcId, stanceRef.current, scale);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [npcId, scale]);

  return (
    <canvas
      ref={canvasRef}
      width={NPC_BOX.w * scale}
      height={NPC_BOX.h * scale}
      style={{
        width: NPC_BOX.w * scale,
        height: NPC_BOX.h * scale,
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}
