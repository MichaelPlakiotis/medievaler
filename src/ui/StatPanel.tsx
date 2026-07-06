// ---------------------------------------------------------------------------
// StatPanel.tsx — the always-visible readout of who you are and where you are in
// the day. Pure display: it takes the GameState and shows it, nothing more.
// ---------------------------------------------------------------------------

import { ATTR_LABELS, TURNS_PER_DAY, NIGHT_TURNS } from "../game/config";
import { attributeThreshold, xpForLevel } from "../game/character";
import { ageTier } from "../game/engine";
import type { AttributeKey, GameState } from "../game/types";

const KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

/** A small labeled tile. */
function Tile({
  k,
  v,
  sub,
  className,
}: {
  k: string;
  v: string | number;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`stat ${className ?? ""}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function StatPanel({ state }: { state: GameState }) {
  const c = state.character;
  const turnsThisPhase = state.phase === "day" ? TURNS_PER_DAY : NIGHT_TURNS;

  // XP progress toward the next level.
  const curLevelXp = xpForLevel(c.level);
  const nextLevelXp = xpForLevel(c.level + 1);
  const xpPct = Math.min(
    100,
    Math.round(((c.xp - curLevelXp) / Math.max(1, nextLevelXp - curLevelXp)) * 100),
  );
  const hpPct = Math.round((c.hp / c.maxHp) * 100);

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", margin: 0, paddingBottom: 0 }}>
          {c.name} — {c.ageYears}, {ageTier(c.ageYears)}
        </h2>
        <span className={`phase-badge ${state.phase}`}>
          {state.phase === "day" ? "Day" : "Night"} · Day {state.day} · Turn{" "}
          {Math.min(state.turn, turnsThisPhase)}/{turnsThisPhase}
        </span>
      </div>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="k">Health</div>
          <div className="v">
            {c.hp}/{c.maxHp}
          </div>
          <div className="bar hp">
            <span style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        <div className="stat">
          <div className="k">Level {c.level}</div>
          <div className="v">{c.xp} XP</div>
          <div className="bar xp">
            <span style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        {c.maxMana > 0 && (
          <div className="stat">
            <div className="k">Mana</div>
            <div className="v">
              {c.mana}/{c.maxMana}
            </div>
            <div className="bar xp">
              <span style={{ width: `${Math.round((c.mana / Math.max(1, c.maxMana)) * 100)}%` }} />
            </div>
          </div>
        )}

        <Tile k="Gold" v={c.gold} className="gold" />
        <Tile k="Weapon" v={c.weapon.name} sub={`${c.weapon.attackAttr}-based`} />

        {state.fatigue > 0 && <Tile k="Condition" v="Weary" sub="Outcomes reduced today" />}
      </div>

      <div className="stat-grid" style={{ marginTop: 10 }}>
        {KEYS.map((k) => {
          const val = c.attributes[k];
          const prog = c.attributeProgress[k];
          const pct = Math.min(100, Math.round((prog / attributeThreshold(val)) * 100));
          return (
            <div className="stat" key={k}>
              <div className="k">
                {ATTR_LABELS[k]} ({k})
              </div>
              <div className="v">{val}</div>
              <div className="bar" title="Practice toward the next point">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
