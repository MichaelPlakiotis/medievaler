// ---------------------------------------------------------------------------
// FamilyPanel.tsx — your household at a glance (GDD §7.3). Shows a sweetheart
// you're courting, your spouse, and your children with their ages — flagging
// which are old enough to one day inherit. Pure display.
// ---------------------------------------------------------------------------

import {
  FAMILY_FOOD_COST,
  HEIR_MIN_AGE,
  MARRY_AGE,
  MARRY_RELATIONSHIP,
  SUITOR_REVEAL,
} from "../game/config";
import { ageOf } from "../game/character";
import { settlementOf } from "../game/worldmap";
import type { AttributeKey, Child, GameState } from "../game/types";

const ATTRS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

function spread(a: Record<AttributeKey, number>): string {
  return ATTRS.map((k) => `${k} ${a[k]}`).join("  ");
}

export function FamilyPanel({
  state,
  onDeposit,
}: {
  state: GameState;
  /** Send gold home for the pantry fund (family.ts depositFamilyFund). */
  onDeposit?: (amount: number) => void;
}) {
  const c = state.character;
  const { suitor, spouse, children } = c;

  // Nothing to show until there's a sweetheart, spouse, or child.
  if (!suitor && !spouse && children.length === 0) return null;

  // The mouths the pantry fund must feed each day (engine.sleep).
  const mouths = (spouse ? 1 : 0) + children.filter((k) => k.alive).length;
  const upkeep = mouths * FAMILY_FOOD_COST;
  const daysOfFood = upkeep > 0 ? Math.floor(c.familyFund / upkeep) : 0;

  return (
    <div className="panel">
      <h2>Hearth &amp; kin</h2>

      {suitor && !spouse && (
        <>
          <div className="family-line">
            <span>
              Courting <strong>{suitor.name}</strong>
              <span className="muted"> · {ageOf(suitor.birthDay, state.day)}</span>
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
          <div className="family-line">
            {/* Their gifts only become clear as you get to know them — so you
                can choose a match for stronger children (GDD §7.3). */}
            <span className="muted">
              {suitor.relationship >= SUITOR_REVEAL
                ? spread(suitor.attributes)
                : "You don't yet know their strengths — court them more to learn."}
            </span>
          </div>
        </>
      )}

      {spouse && (
        <div className="family-line">
          <span>
            Married to <strong>{spouse.name}</strong>
            <span className="muted"> · {ageOf(spouse.birthDay, state.day)}</span>
            {c.familySettlementId && (
              <span className="muted">
                {" "}
                · living in {settlementOf(state.map, c.familySettlementId)?.name ?? "parts unknown"}
              </span>
            )}
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
                  {child.gender === "male" ? "♂" : "♀"} <strong>{child.name}</strong>, {age}
                  {heir && <span className="equipped-tag"> · heir</span>}
                </span>
                <span className="muted">{spread(child.attributes)}</span>
              </div>
            );
          })}
        </div>
      )}

      {c.familySettlementId && mouths > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="row-between">
            <span>
              Pantry fund: <strong>{c.familyFund} gold</strong>
              <span className="muted">
                {" "}
                · {upkeep} gold/day for {mouths} mouth{mouths === 1 ? "" : "s"} ·{" "}
                {daysOfFood} day{daysOfFood === 1 ? "" : "s"} of food
              </span>
            </span>
            {onDeposit && (
              <span style={{ display: "flex", gap: 6 }}>
                <button disabled={c.gold < 10} onClick={() => onDeposit(10)}>
                  Send 10g
                </button>
                <button disabled={c.gold < 50} onClick={() => onDeposit(50)}>
                  Send 50g
                </button>
              </span>
            )}
          </div>
          {c.familyNeglect > 0 && (
            <p className="muted" style={{ marginTop: 6, color: "#d47a6a" }}>
              Your family has gone {c.familyNeglect} day{c.familyNeglect === 1 ? "" : "s"} without
              bread. Fill the pantry before hunger takes someone.
            </p>
          )}
        </div>
      )}

      {c.ownedHomes.length === 0 &&
        (spouse || (suitor && suitor.relationship >= MARRY_RELATIONSHIP)) && (
        <p className="muted" style={{ marginTop: 8 }}>
          You'll need a home of your own (buy one at the shop) before you can raise children.
        </p>
      )}
    </div>
  );
}
