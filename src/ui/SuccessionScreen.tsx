// ---------------------------------------------------------------------------
// SuccessionScreen.tsx — the moment a life ends and the next begins (GDD §2.4).
// Shown when the character dies leaving eligible heirs. The eldest is offered
// first, but the player may pick any, comparing their inherited attribute
// spreads. Choosing one continues the run as that heir.
// ---------------------------------------------------------------------------

import { ageOf } from "../game/character";
import type { AttributeKey, GameState } from "../game/types";

const ATTRS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

export function SuccessionScreen({
  state,
  onChoose,
}: {
  state: GameState;
  onChoose: (heirIndex: number) => void;
}) {
  const heirs = state.pendingSuccession ?? [];
  const parent = state.character;

  return (
    <div className="panel">
      <h2>A death in the family</h2>
      <p className="muted">
        {parent.name} is gone — {state.deathCause}. But the name endures. Choose the heir who
        will carry it on (the eldest stands first in line).
      </p>

      <div className="shop-list" style={{ marginTop: 12 }}>
        {heirs.map((heir, i) => (
          <div className="shop-row" key={i}>
            <div>
              <div className="shop-name">
                {heir.name}, {ageOf(heir.birthDay, state.day)}
                {i === 0 && <span className="muted"> · eldest</span>}
              </div>
              <div className="shop-detail">
                {ATTRS.map((k) => `${k} ${heir.attributes[k]}`).join("  ")}
              </div>
            </div>
            <button onClick={() => onChoose(i)}>Live as {heir.name} →</button>
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        Your heir inherits the family's gold, gear, and a share of its standing — but must make
        their own name.
      </p>
    </div>
  );
}
