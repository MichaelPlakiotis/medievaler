// ---------------------------------------------------------------------------
// MapScreen.tsx — the regional hex map (the "bigger world" arc). Shown full-
// viewport while state.mapOpen, covering the town scene visually (same idea
// as TownBackground, but for the road). Click a highlighted neighboring hex
// to travel there; combat/road-encounter/rest modals layer on top of this
// from GameScreen, exactly like they layer over the hamlet's hotspots.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type MouseEvent } from "react";
import { drawWorldMap, hexAtCanvasPoint, MAP_LH, MAP_LW } from "../scene/mapScene";
import { hexKey, hexNeighbors, isRoad, isWater, nearestSettlementDistance, siteAt } from "../game/worldmap";
import type { GameState, HexCoord } from "../game/types";

const TERRAIN_LABELS: Record<string, string> = {
  plains: "open plains",
  forest: "deep forest",
  hills: "rolling hills",
  mountains: "rugged mountains",
  water: "open water",
};

export function MapScreen({
  state,
  onMove,
  onLeaveMap,
  onExploreSite,
}: {
  state: GameState;
  onMove: (hex: HexCoord) => void;
  onLeaveMap: () => void;
  onExploreSite: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reachable = hexNeighbors(state.location.hex).filter(
    (n) => state.map.terrain[hexKey(n)] !== undefined && !isWater(state.map, n),
  );
  const reachableKeys = reachable.map(hexKey);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWorldMap(canvas, state.map, state.discovered, state.location, reachableKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.map, state.discovered, state.location, reachableKeys.join("|")]);

  function handleClick(e: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hex = hexAtCanvasPoint(canvas, e.clientX, e.clientY);
    if (reachableKeys.includes(hexKey(hex))) onMove(hex);
  }

  const here = state.location.hex;
  const terrainKind = state.map.terrain[hexKey(here)];
  const dist = nearestSettlementDistance(state.map, here);
  const settlement = state.map.settlements.find((s) => s.id === state.location.settlementId);
  const site = siteAt(state.map, here);

  return (
    <div className="map-screen">
      <canvas
        ref={canvasRef}
        width={MAP_LW * 2}
        height={MAP_LH * 2}
        className="map-canvas"
        onClick={handleClick}
      />
      <div className="map-info">
        <div>
          <strong>{settlement ? settlement.name : site ? site.name : "The open road"}</strong>
          <span className="muted">
            {" "}
            · {TERRAIN_LABELS[terrainKind] ?? "unknown ground"}
            {dist > 0 ? ` · ${dist} hex${dist === 1 ? "" : "es"} from the nearest settlement` : ""}
            {site?.cleared ? " · emptied" : ""}
          </span>
        </div>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Click a highlighted hex to travel there. Roads are safe going; the wilds grow more
          dangerous the farther you stray from a settlement, and water can't be crossed.
          {isRoad(state.map, here) && !settlement ? " You are on the road." : ""}
        </p>
        {site && (
          <button style={{ marginTop: 8, width: "100%", padding: 10 }} onClick={onExploreSite}>
            ⚔ Explore {site.name}
            {site.cleared ? " (its guardian is gone, but loot remains)" : ""}
          </button>
        )}
      </div>
      <button
        className="ghost map-leave"
        onClick={onLeaveMap}
        disabled={!settlement}
        title={settlement ? undefined : "You can only put the map away while standing in a settlement"}
      >
        {settlement ? "Leave the map →" : "Still traveling…"}
      </button>
    </div>
  );
}
