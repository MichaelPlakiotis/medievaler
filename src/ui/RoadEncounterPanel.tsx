// ---------------------------------------------------------------------------
// RoadEncounterPanel.tsx — a hostile encounter rolled mid-travel (the
// "bigger world" arc). Shown while state.roadEncounter is set, before combat
// starts: Fight it, attempt to Flee (Agility skill check, live % shown), or
// Bribe your way past (guaranteed if affordable). Pure display + click-
// forwarding; the rules live in src/game/travel.ts and combat.ts's fleeChance.
// ---------------------------------------------------------------------------

import { fleeChance } from "../game/combat";
import { bribeCost } from "../game/travel";
import type { GameState } from "../game/types";

export function RoadEncounterPanel({
  state,
  onFight,
  onFlee,
  onBribe,
}: {
  state: GameState;
  onFight: () => void;
  onFlee: () => void;
  onBribe: () => void;
}) {
  const encounter = state.roadEncounter!;
  const enemy = encounter.enemy;
  const c = state.character;
  const flee = Math.round(fleeChance(c, enemy));
  const cost = bribeCost(enemy.xp);
  const canAfford = c.gold >= cost;

  return (
    <div className="panel">
      <h2>The Road</h2>
      <p style={{ fontSize: "1.02rem" }}>{enemy.intro}</p>

      <div className="actions" style={{ marginTop: 14 }}>
        <button className="action danger" onClick={onFight}>
          <span>Fight</span>
          <span className="hint">Stand and face the {enemy.name}.</span>
        </button>
        <button className="action" onClick={onFlee}>
          <span>Attempt to flee</span>
          <span className="hint">~{flee}% chance to escape (Agility)</span>
        </button>
        {/* Only people can be paid off — a wolf has no use for your purse. */}
        {enemy.human && (
          <button className="action" onClick={onBribe} disabled={!canAfford}>
            <span>Pay them off</span>
            <span className="hint">
              {canAfford ? `${cost} gold guarantees safe passage` : `Needs ${cost} gold — you don't have enough`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
