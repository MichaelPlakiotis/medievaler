// ---------------------------------------------------------------------------
// ReputationPanel.tsx — how the four powers regard you (GDD §6.1). Pure display:
// a labeled bar per faction, centered on neutral, tinted good/bad by standing.
// ---------------------------------------------------------------------------

import { AGE_OF_CONSEQUENCE, REP_MAX } from "../game/config";
import { FACTION_LABELS, standingLabel } from "../game/reputation";
import type { Faction, GameState } from "../game/types";

const ORDER: Faction[] = ["guard", "merchants", "thieves", "church"];

export function ReputationPanel({ state }: { state: GameState }) {
  const rep = state.character.reputation;
  const young = state.character.ageYears < AGE_OF_CONSEQUENCE;

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", margin: 0, paddingBottom: 0 }}>Standing</h2>
        {young && (
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            Youth: your deeds barely stick until {AGE_OF_CONSEQUENCE}.
          </span>
        )}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {ORDER.map((f) => {
          const v = rep[f];
          // Map −MAX..+MAX onto 0..100%, with 50% = neutral.
          const pct = Math.round(((v + REP_MAX) / (REP_MAX * 2)) * 100);
          const tone = v <= -10 ? "bad" : v >= 10 ? "good" : "neutral";
          return (
            <div key={f} className="rep-row">
              <span className="rep-name">{FACTION_LABELS[f]}</span>
              <div className="rep-track">
                <span className="rep-mid" />
                <span className={`rep-fill ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`rep-standing ${tone}`}>{standingLabel(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
