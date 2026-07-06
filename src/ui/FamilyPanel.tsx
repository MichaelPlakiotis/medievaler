// ---------------------------------------------------------------------------
// FamilyPanel.tsx — your household at a glance (GDD §7.3). Shows a sweetheart
// you're courting, your spouse, and your children with their ages — flagging
// which are old enough to one day inherit. Pure display.
// ---------------------------------------------------------------------------

import { HEIR_MIN_AGE, MARRY_AGE, MARRY_RELATIONSHIP } from "../game/config";
import { ageOf } from "../game/character";
import type { AttributeKey, Child, GameState } from "../game/types";

const ATTRS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

function spread(a: Record<AttributeKey, number>): string {
  return ATTRS.map((k) => `${k} ${a[k]}`).join("  ");
}

export function FamilyPanel({ state }: { state: GameState }) {
  const c = state.character;
  const { suitor, spouse, children } = c;

  // Nothing to show until there's a sweetheart, spouse, or child.
  if (!suitor && !spouse && children.length === 0) return null;

  return (
    <div className="panel">
      <h2>Hearth & kin</h2>

      {suitor && !spouse && (
        <div className="family-line">
          <span>
            Courting <strong>{suitor.name}</strong>
          </span>
          <div className="bar" style={{ maxWidth: 160, flex: 1 }}>
            <span style={{ width: `${Math.round(suitor.relationship)}%` }} />
          </div>
          <span className="muted">
            {c.ageYears < MARRY_AGE
              ? `Too young to wed until ${MARRY_AGE}`
              : suitor.relationship >= MARRY_RELATIONSHIP
                ? "Ready to propose"
                : "Grow closer to propose"}
          </span>
        </div>
      )}

      {spouse && (
        <div className="family-line">
          <span>
            Married to <strong>{spouse.name}</strong>
          </span>
          <span className="muted">{spread(spouse.attributes)}</span>
        </div>
      )}

      {children.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ marginBottom: 4 }}>
            Children:
          </div>
          {children.map((child: Child, i) => {
            const age = ageOf(child.birthDay, state.day);
            const heir = child.alive && age >= HEIR_MIN_AGE;
            return (
              <div className="family-line" key={i}>
                <span>
                  <strong>{child.name}</strong>, {age}
                  {heir && <span className="equipped-tag"> · heir</span>}
                </span>
                <span className="muted">{spread(child.attributes)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
