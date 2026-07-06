// ---------------------------------------------------------------------------
// TownBackground.tsx — mounts the animated town (src/scene/townScene.ts) onto a
// full-screen canvas behind the game, and switches its time-of-day whenever the
// game's day/dusk/night state changes.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { mountTownScene, type TimeOfDay, type TownSceneHandle } from "../scene/townScene";

export function TownBackground({ timeOfDay }: { timeOfDay: TimeOfDay }) {
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

  return (
    <div className="town-bg">
      <canvas ref={canvasRef} className="town-canvas" />
      {/* A soft scrim so overlaid text stays readable over the bright scene. */}
      <div className="town-scrim" />
    </div>
  );
}
