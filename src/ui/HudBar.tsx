// ---------------------------------------------------------------------------
// HudBar.tsx — the slim, translucent status strip pinned to the top of the
// scene. The full detail (attributes, reputation, family, chronicle) lives in
// the Ledger, opened from here.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { TURNS_PER_DAY, NIGHT_TURNS } from "../game/config";
import { ageTier } from "../game/engine";
import type { GameState } from "../game/types";

/** How long the red damage flash lingers on a bar that just dropped (ms). */
const FLASH_MS = 400;

function Bar({ value, max, kind }: { value: number; max: number; kind: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value < prev.current) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), FLASH_MS);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <div className="hud-bar-meter">
      <div className={`bar ${kind}${flash ? " flash" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HudBar({ state, onLedger }: { state: GameState; onLedger: () => void }) {
  const c = state.character;
  const turns = state.phase === "day" ? TURNS_PER_DAY : NIGHT_TURNS;
  const phaseWord = state.phase === "day" ? "Day" : "Night";
  const settlement = state.map.settlements.find((s) => s.id === state.location.settlementId);
  const placeLabel = settlement ? settlement.name : "the open road";

  return (
    <div className="hud-bar">
      <div className="hud-id">
        <strong>{c.name}</strong>
        <span className="hud-sub">
          {c.ageYears} · {ageTier(c.ageYears)} · {placeLabel}
        </span>
      </div>

      <span className={`phase-badge ${state.phase}`}>
        Day {state.day} · {phaseWord} {Math.min(state.turn, turns)}/{turns}
      </span>

      <div className="turn-pips" aria-hidden="true">
        {Array.from({ length: turns }, (_, i) => (
          <span key={i} className={i < state.turn ? "turn-pip done" : "turn-pip"} />
        ))}
      </div>

      <div className="hud-stat">
        <span className="hud-k">HP</span>
        <span className="hud-v">
          {c.hp}/{c.maxHp}
        </span>
        <Bar value={c.hp} max={c.maxHp} kind="hp" />
      </div>

      {c.maxMana > 0 && (
        <div className="hud-stat">
          <span className="hud-k">MP</span>
          <span className="hud-v">
            {c.mana}/{c.maxMana}
          </span>
          <Bar value={c.mana} max={c.maxMana} kind="xp" />
        </div>
      )}

      <div className="hud-stat">
        <span className="hud-k">Lv</span>
        <span className="hud-v">{c.level}</span>
      </div>

      <div className="hud-gold">{c.gold}g</div>

      {state.fatigue > 0 && <span className="hud-weary">Weary</span>}

      <button className="ghost hud-ledger" onClick={onLedger}>
        📜 Ledger
      </button>
    </div>
  );
}
