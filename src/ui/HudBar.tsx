// ---------------------------------------------------------------------------
// HudBar.tsx — the slim, translucent status strip pinned to the top of the
// scene. The full detail (attributes, reputation, family, chronicle) lives in
// the Ledger, opened from here.
// ---------------------------------------------------------------------------

import { TURNS_PER_DAY, NIGHT_TURNS } from "../game/config";
import { ageTier } from "../game/engine";
import type { GameState } from "../game/types";

function Bar({ value, max, kind }: { value: number; max: number; kind: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <div className="hud-bar-meter">
      <div className={`bar ${kind}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HudBar({ state, onLedger }: { state: GameState; onLedger: () => void }) {
  const c = state.character;
  const turns = state.phase === "day" ? TURNS_PER_DAY : NIGHT_TURNS;
  const phaseWord = state.phase === "day" ? "Day" : "Night";

  return (
    <div className="hud-bar">
      <div className="hud-id">
        <strong>{c.name}</strong>
        <span className="hud-sub">
          {c.ageYears} · {ageTier(c.ageYears)}
        </span>
      </div>

      <span className={`phase-badge ${state.phase}`}>
        Day {state.day} · {phaseWord} {Math.min(state.turn, turns)}/{turns}
      </span>

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
