// ---------------------------------------------------------------------------
// DungeonPanel.tsx — the delve screen (M9). Shown while state.dungeon is set
// and no fight is active. Shows depth-so-far as pips, the last room's outcome
// (already narrated to the chronicle by dungeon.ts), and the choice: press
// deeper, or leave with whatever's been found. Pure display + click-forwarding;
// the rules live in src/game/dungeon.ts.
// ---------------------------------------------------------------------------

import type { GameState, RoomKind } from "../game/types";

const ROOM_ICON: Record<RoomKind, string> = {
  fight: "⚔",
  treasure: "💰",
  event: "❔",
  boss: "💀",
};

export function DungeonPanel({
  state,
  onPressOn,
  onLeave,
}: {
  state: GameState;
  onPressOn: () => void;
  onLeave: () => void;
}) {
  const dungeon = state.dungeon!;
  const atBoss = dungeon.rooms[dungeon.depth - 1] === "boss";
  const canPressOn = dungeon.roomResolved && !dungeon.mustLeave && !atBoss;
  const lastLine = state.log[state.log.length - 1];

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", margin: 0, paddingBottom: 0 }}>The Barrow</h2>
        <span className="phase-badge night">
          Room {dungeon.depth} / {dungeon.rooms.length}
        </span>
      </div>

      <div className="dungeon-pips" style={{ marginTop: 10 }}>
        {dungeon.rooms.map((kind, i) => (
          <span
            key={i}
            className={`dungeon-pip${i < dungeon.depth ? " done" : ""}${i === dungeon.depth - 1 ? " current" : ""}`}
            title={kind}
          >
            {ROOM_ICON[kind]}
          </span>
        ))}
      </div>

      {lastLine && (
        <p style={{ marginTop: 14, fontSize: "1.02rem" }} className={lastLine.tone}>
          {lastLine.text}
        </p>
      )}

      {dungeon.lootGold > 0 && (
        <p className="muted" style={{ marginTop: 4 }}>
          Carrying {dungeon.lootGold} gold in plunder so far.
        </p>
      )}

      {dungeon.mustLeave && (
        <p className="muted" style={{ marginTop: 4 }}>
          The way ahead is lost to you now — you can only leave.
        </p>
      )}

      <div className="row-between" style={{ marginTop: 16 }}>
        <button className="danger" onClick={onLeave}>
          {dungeon.roomResolved ? "Leave with your loot" : "Retreat"}
        </button>
        {canPressOn && (
          <button style={{ flex: 1, marginLeft: 10, padding: 14 }} onClick={onPressOn}>
            Press deeper →
          </button>
        )}
      </div>
    </div>
  );
}
