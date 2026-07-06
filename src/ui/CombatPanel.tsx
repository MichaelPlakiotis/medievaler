// ---------------------------------------------------------------------------
// CombatPanel.tsx — the battle screen (GDD §4). Shown whenever state.combat is
// set. It reads the fight from state and offers the three actions: Weapon
// Attack, Spell Attack, Use Item. When the fight is over it shows a single
// "Continue" that hands control back to the day loop.
// ---------------------------------------------------------------------------

import { SPELL_COST } from "../game/config";
import { ITEMS } from "../game/equipment";
import type { GameState } from "../game/types";

/** A labeled HP/MP bar. */
function Meter({
  label,
  value,
  max,
  kind,
}: {
  label: string;
  value: number;
  max: number;
  kind: "hp" | "mp";
}) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  return (
    <div className="stat" style={{ flex: 1 }}>
      <div className="k">{label}</div>
      <div className="v">
        {Math.max(0, value)}/{max}
      </div>
      <div className={`bar ${kind === "hp" ? "hp" : "xp"}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const OUTCOME_TEXT: Record<string, string> = {
  won: "Victory.",
  fled: "You got away.",
  beaten: "You were beaten.",
  killed: "You have fallen.",
};

export function CombatPanel({
  state,
  onAttack,
  onSpell,
  onItem,
  onContinue,
}: {
  state: GameState;
  onAttack: () => void;
  onSpell: () => void;
  onItem: (itemId: string) => void;
  onContinue: () => void;
}) {
  const combat = state.combat!;
  const c = state.character;
  const enemy = combat.enemy;
  const over = combat.over;

  // Which consumables can be used right now (in the bag, combat-usable).
  const usableItems = Object.keys(c.inventory).filter(
    (id) => (c.inventory[id] ?? 0) > 0 && ITEMS[id],
  );

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", margin: 0, paddingBottom: 0 }}>
          Battle — {enemy.name}
        </h2>
        <span className="phase-badge night">Round {combat.round}</span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Meter label={`${enemy.name}`} value={enemy.hp} max={enemy.maxHp} kind="hp" />
        <Meter label="Your health" value={c.hp} max={c.maxHp} kind="hp" />
        <Meter label="Mana" value={c.mana} max={c.maxMana} kind="mp" />
      </div>

      {!over ? (
        <>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="action" onClick={onAttack}>
              <span>Weapon Attack</span>
              <span className="hint">{c.weapon.name}</span>
            </button>
            <button
              className="action"
              onClick={onSpell}
              disabled={c.mana < SPELL_COST}
              title={c.mana < SPELL_COST ? "Not enough mana" : undefined}
            >
              <span>Spell Attack</span>
              <span className="hint">Bolt of force · {SPELL_COST} mana</span>
            </button>
          </div>

          {usableItems.length > 0 && (
            <>
              <p className="muted" style={{ margin: "14px 0 6px" }}>
                Use an item:
              </p>
              <div className="actions">
                {usableItems.map((id) => (
                  <button key={id} className="action" onClick={() => onItem(id)}>
                    <span>
                      {ITEMS[id].name} ×{c.inventory[id]}
                    </span>
                    <span className="hint">{ITEMS[id].desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {OUTCOME_TEXT[combat.outcome ?? "won"]}
          </p>
          <button style={{ width: "100%", padding: 14 }} onClick={onContinue}>
            {combat.outcome === "killed" ? "Face your end →" : "Continue →"}
          </button>
        </div>
      )}
    </div>
  );
}
