// ---------------------------------------------------------------------------
// MapScreen.tsx — the regional hex map (the "bigger world" arc). Shown full-
// viewport while state.mapOpen, covering the town scene visually (same idea
// as TownBackground, but for the road). Click a highlighted hex to travel
// there (one step afoot, farther on horseback); when standing at a waypoint
// settlement, a carter can be paid to fast-travel to any other unlocked one.
// Combat/road-encounter/rest modals layer on top of this from GameScreen,
// exactly like they layer over the hamlet's hotspots.
// ---------------------------------------------------------------------------

import { useEffect, useRef, type MouseEvent } from "react";
import { drawWorldMap, hexAtCanvasPoint, MAP_LH, MAP_LW } from "../scene/mapScene";
import { hexKey, isLichIsland, isRoad, nearestSettlementDistance, portAt, siteAt } from "../game/worldmap";
import { fastTravelCost, fastTravelOrigin, reachableHexes, sailCost, sailOrigin } from "../game/travel";
import { HORSES, ITEMS } from "../game/equipment";
import type { GameState, HexCoord } from "../game/types";

const TERRAIN_LABELS: Record<string, string> = {
  plains: "open plains",
  forest: "deep forest",
  hills: "rolling hills",
  mountains: "rugged mountains",
  water: "open water",
};

/** Foods worth offering a quick bite of while on the road. */
const TRAIL_FOOD = ["ration", "hearty_meal", "waterskin"];

export function MapScreen({
  state,
  onMove,
  onLeaveMap,
  onExploreSite,
  onFastTravel,
  onSail,
  onUseItem,
}: {
  state: GameState;
  onMove: (hex: HexCoord) => void;
  onLeaveMap: () => void;
  onExploreSite: () => void;
  onFastTravel: (settlementId: string) => void;
  onSail: (portId: string) => void;
  onUseItem: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reachable = reachableHexes(state);
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
  const port = portAt(state.map, here);
  const onIsland = isLichIsland(state.map, here);
  const horse = state.character.horse ? HORSES[state.character.horse] : null;

  // Sailing: possible when standing on a port hex; boats reach every port.
  const harborId = sailOrigin(state);
  const sailings = harborId ? state.map.ports.filter((p) => p.id !== harborId) : [];

  // Waypoint fast travel: possible when standing on an unlocked settlement.
  const originId = fastTravelOrigin(state);
  const destinations = originId
    ? state.map.settlements.filter(
        (s) => s.id !== originId && state.waypoints.includes(s.id),
      )
    : [];

  const foods = TRAIL_FOOD.filter((id) => (state.character.inventory[id] ?? 0) > 0);

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
          <strong>
            {settlement ? settlement.name : site ? site.name : port ? port.name : onIsland ? "The lich's island" : "The open road"}
          </strong>
          <span className="muted">
            {" "}
            · {onIsland ? "dead, silent ground" : TERRAIN_LABELS[terrainKind] ?? "unknown ground"}
            {dist > 0 && !onIsland ? ` · ${dist} hex${dist === 1 ? "" : "es"} from the nearest settlement` : ""}
            {site?.cleared ? " · emptied" : ""}
          </span>
        </div>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Click a highlighted hex to travel there
          {horse ? ` — your ${horse.name.toLowerCase()} covers ${horse.speed} hexes a turn` : ""}.
          Roads are safe going; the wilds grow more dangerous the farther you stray from a
          settlement, and water can't be crossed.
          {isRoad(state.map, here) && !settlement ? " You are on the road." : ""}
        </p>
        {foods.length > 0 && (
          <div className="map-food" style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {foods.map((id) => (
              <button key={id} className="ghost" onClick={() => onUseItem(id)}>
                {id === "waterskin" ? "🥤 Drink" : "🍞 Eat"} {ITEMS[id].name} ×
                {state.character.inventory[id]}
              </button>
            ))}
          </div>
        )}
        {sailings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Set sail</strong>{" "}
            <span className="muted">— a boat from {state.map.ports.find((p) => p.id === harborId)?.name}; the sea rolls no dice.</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {sailings.map((p) => {
                const cost = sailCost(state, harborId!, p.id);
                const canPay = state.character.gold >= cost;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSail(p.id)}
                    disabled={!canPay}
                    title={canPay ? undefined : `You can't afford the ${cost} gold fare`}
                  >
                    ⛵ {p.name}
                    {p.id === "port_island" ? " — the lich's island" : ""} — {cost}g
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {destinations.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Fast travel</strong>{" "}
            <span className="muted">
              — a carter's convoy, safe roads, one turn{horse ? " (half fare, mounted)" : ""}.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {destinations.map((s) => {
                const cost = fastTravelCost(state, originId!, s.id);
                const canPay = state.character.gold >= cost;
                return (
                  <button
                    key={s.id}
                    onClick={() => onFastTravel(s.id)}
                    disabled={!canPay}
                    title={canPay ? undefined : `You can't afford the ${cost} gold fare`}
                  >
                    🐎 {s.name} — {cost}g
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
