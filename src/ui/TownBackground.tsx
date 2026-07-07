// ---------------------------------------------------------------------------
// TownBackground.tsx — mounts the animated settlement (src/scene/townScene.ts)
// onto a full-screen canvas behind the game, switches its time-of-day with the
// game's day/dusk/night state, regenerates the scene whenever the active
// settlement (or home ownership) changes, and keeps the player's paper-doll
// living in the scene (walking to whichever spot the current action happens at).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import {
  mountTownScene,
  type SceneSettlement,
  type TimeOfDay,
  type TownSceneHandle,
} from "../scene/townScene";
import type { HeroLook } from "../scene/sprites";

export function TownBackground({
  timeOfDay,
  heroLook = null,
  heroSpot = "idle",
  settlement = null,
  homeSettlementId = null,
}: {
  timeOfDay: TimeOfDay;
  /** The player's current look, or null before a life begins. */
  heroLook?: HeroLook | null;
  /** Where the hero should be: an action id while one plays, else "idle". */
  heroSpot?: string;
  /** The settlement currently on screen — drives which layout/population renders. */
  settlement?: SceneSettlement | null;
  /** Which settlement (if any) the character's home is built in. */
  homeSettlementId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<TownSceneHandle | null>(null);

  // Mount once; tear down on unmount.
  useEffect(() => {
    if (!canvasRef.current) return;
    handleRef.current = mountTownScene(canvasRef.current);
    return () => handleRef.current?.destroy();
  }, []);

  // Drive time-of-day from the game state.
  useEffect(() => {
    handleRef.current?.setTimeOfDay(timeOfDay);
  }, [timeOfDay]);

  // Regenerate the scene for the active settlement (and re-check the home lot
  // whenever homeSettlementId changes, i.e. right after buying a home).
  useEffect(() => {
    if (!settlement) return;
    handleRef.current?.setSettlement(settlement, homeSettlementId);
  }, [settlement?.id, settlement?.kind, homeSettlementId]);

  // Keep the hero's look in sync (depend on its fields — the object is rebuilt
  // each render, but the sprite only changes when gear/gender/name do).
  useEffect(() => {
    handleRef.current?.setHero(heroLook);
  }, [heroLook?.gender, heroLook?.weaponId, heroLook?.armorId, heroLook?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send the hero walking whenever the active spot changes.
  useEffect(() => {
    handleRef.current?.heroGoTo(heroSpot);
  }, [heroSpot]);

  return (
    <div className="town-bg">
      <canvas ref={canvasRef} className="town-canvas" />
      {/* A soft scrim so overlaid text stays readable over the bright scene. */}
      <div className="town-scrim" />
    </div>
  );
}
