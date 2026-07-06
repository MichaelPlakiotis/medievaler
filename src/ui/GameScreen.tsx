// ---------------------------------------------------------------------------
// GameScreen.tsx — the main play view. It owns the live GameState and wires the
// panels to the engine. The pattern throughout: a click calls an engine
// function, we get a NEW state back, we store it (which re-renders) and save it.
// ---------------------------------------------------------------------------

import { closeShop, finishCombat, sleep, stayUp, takeAction } from "../game/engine";
import { combatAttack, combatSpell, combatUseItem } from "../game/combat";
import { buy, equipArmor, equipWeapon, removeArmor, sell } from "../game/shop";
import { saveGame } from "../game/save";
import type { GameState } from "../game/types";
import { StatPanel } from "./StatPanel";
import { ActionMenu } from "./ActionMenu";
import { EventLog } from "./EventLog";
import { RestDecision } from "./RestDecision";
import { CombatPanel } from "./CombatPanel";
import { GameOver } from "./GameOver";
import { ReputationPanel } from "./ReputationPanel";
import { ShopPanel } from "./ShopPanel";

export function GameScreen({
  state,
  setState,
  onNewLife,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  onNewLife: () => void;
}) {
  // Every state change goes through here so we save on the same beat we render.
  function commit(next: GameState) {
    setState(next);
    saveGame(next);
  }

  // The run has ended in death — nothing to do but start again.
  if (state.dead) {
    return (
      <>
        <StatPanel state={state} />
        <GameOver state={state} onNewLife={onNewLife} />
        <EventLog log={state.log} />
      </>
    );
  }

  return (
    <>
      <StatPanel state={state} />

      {state.combat ? (
        <CombatPanel
          state={state}
          onAttack={() => commit(combatAttack(state))}
          onSpell={() => commit(combatSpell(state))}
          onItem={(id) => commit(combatUseItem(state, id))}
          onContinue={() => commit(finishCombat(state))}
        />
      ) : state.shopOpen ? (
        <ShopPanel
          state={state}
          onBuy={(ref) => commit(buy(state, ref))}
          onSell={(ref) => commit(sell(state, ref))}
          onEquipWeapon={(id) => commit(equipWeapon(state, id))}
          onEquipArmor={(id) => commit(equipArmor(state, id))}
          onRemoveArmor={() => commit(removeArmor(state))}
          onLeave={() => commit(closeShop(state))}
        />
      ) : state.awaitingRest ? (
        <RestDecision
          onSleep={() => commit(sleep(state))}
          onStayUp={() => commit(stayUp(state))}
        />
      ) : (
        <ActionMenu
          state={state}
          disabled={false}
          onAct={(id) => commit(takeAction(state, id))}
        />
      )}

      {!state.combat && !state.shopOpen && <ReputationPanel state={state} />}

      <EventLog log={state.log} />

      <div className="row-between">
        <span className="muted">Progress saves automatically on this device.</span>
        <button
          className="danger"
          onClick={() => {
            if (confirm("Abandon this life and start over? This can't be undone.")) {
              onNewLife();
            }
          }}
        >
          New life
        </button>
      </div>
    </>
  );
}
