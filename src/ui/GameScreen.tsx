// ---------------------------------------------------------------------------
// GameScreen.tsx — the play view, now staged over the animated town. Focused
// moments (combat, shop, the rest decision, succession, death) appear as modal
// cards over a dimmed scene; ordinary hamlet life happens as buttons placed on
// the town itself, each taking a beat to play out before it resolves.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  closeShop,
  finishCombat,
  leaveDungeon,
  resolveRoadEncounter,
  sleep,
  stayUp,
  takeAction,
  travelTo,
} from "../game/engine";
import { combatAttack, combatFlee, combatSpell, combatUseItem } from "../game/combat";
import { buy, equipArmor, equipWeapon, removeArmor, sell } from "../game/shop";
import { pressOn } from "../game/dungeon";
import { closeMap } from "../game/travel";
import { succeed } from "../game/succession";
import { spendSkillPoint } from "../game/character";
import { downloadSave, saveGame } from "../game/save";
import type { GameState } from "../game/types";
import { LoadSaveButton } from "./LoadSaveButton";
import { CharacterSheet } from "./CharacterSheet";
import { StatPanel } from "./StatPanel";
import { EventLog } from "./EventLog";
import { RestDecision } from "./RestDecision";
import { CombatPanel } from "./CombatPanel";
import { DungeonPanel } from "./DungeonPanel";
import { MapScreen } from "./MapScreen";
import { RoadEncounterPanel } from "./RoadEncounterPanel";
import { GameOver } from "./GameOver";
import { ReputationPanel } from "./ReputationPanel";
import { ShopPanel } from "./ShopPanel";
import { FamilyPanel } from "./FamilyPanel";
import { SuccessionScreen } from "./SuccessionScreen";
import { HudBar } from "./HudBar";
import { ActionHotspots } from "./ActionHotspots";

/** How long an ordinary hamlet action lingers before it resolves (ms) — long
 *  enough for the hero to visibly walk over to where it happens. */
const ACTION_MS = 1200;

/** A centered modal card over a dimmed scene. */
function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card">{children}</div>
    </div>
  );
}

export function GameScreen({
  state,
  setState,
  onNewLife,
  onLoad,
  onHeroSpot,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  onNewLife: () => void;
  onLoad: (s: GameState) => void;
  /** Tell the town scene where the hero should stand ("idle" or an action id). */
  onHeroSpot: (spot: string) => void;
}) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    key: number;
    actionId: string;
    gold: number;
    xp: number;
  } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const feedbackKey = useRef(0);

  function commit(next: GameState) {
    setState(next);
    saveGame(next);
  }

  // Clean up pending timers if the component unmounts mid-animation.
  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  // Play an ordinary hamlet action with a short "doing it" beat — the hero
  // walks over to where it happens — then resolve.
  function runAction(actionId: string) {
    if (busyAction) return;
    setBusyAction(actionId);
    onHeroSpot(actionId);
    timerRef.current = window.setTimeout(() => {
      const before = state.character;
      const next = takeAction(state, actionId);
      commit(next);
      setBusyAction(null);
      onHeroSpot("idle");

      // Only pop a chip when the action resolved outright (not when it opened
      // a fight, the shop, or a dungeon — those narrate their own rewards).
      if (!next.combat && !next.shopOpen && !next.dungeon) {
        const gold = next.character.gold - before.gold;
        const xp = next.character.xp - before.xp;
        if (gold !== 0 || xp !== 0) {
          feedbackKey.current += 1;
          setFeedback({ key: feedbackKey.current, actionId, gold, xp });
          window.clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 1300);
        }
      }
    }, ACTION_MS);
  }

  // --- Focused, modal moments ------------------------------------------------

  if (state.pendingSuccession) {
    return (
      <Modal>
        <SuccessionScreen state={state} onChoose={(i) => commit(succeed(state, i))} />
      </Modal>
    );
  }

  if (state.dead) {
    return (
      <Modal>
        <GameOver state={state} onNewLife={onNewLife} />
      </Modal>
    );
  }

  // --- Traveling the hex map (the "bigger world" arc) ------------------------
  // mapOpen stays true through a road-triggered fight (and even across a rest
  // taken mid-journey), so MapScreen is always the backdrop here — combat,
  // a road encounter, or the rest decision layer on top of it as modals,
  // exactly like the hamlet's own modals layer over its hotspots. (Getting
  // this wrong — early-returning a bare modal instead of layering it over
  // MapScreen — would leave the hamlet's town art visible behind a fight
  // that's supposed to be happening out on the road.)
  if (state.mapOpen) {
    return (
      <>
        <HudBar state={state} onLedger={() => setLedgerOpen(true)} />
        <MapScreen
          state={state}
          onMove={(hex) => commit(travelTo(state, hex))}
          onLeaveMap={() => commit(closeMap(state))}
        />
        {state.combat && (
          <Modal>
            <CombatPanel
              state={state}
              onAttack={() => commit(combatAttack(state))}
              onSpell={() => commit(combatSpell(state))}
              onFlee={() => commit(combatFlee(state))}
              onItem={(id) => commit(combatUseItem(state, id))}
              onContinue={() => commit(finishCombat(state))}
            />
          </Modal>
        )}
        {!state.combat && state.roadEncounter && (
          <Modal>
            <RoadEncounterPanel
              state={state}
              onFight={() => commit(resolveRoadEncounter(state, "fight"))}
              onFlee={() => commit(resolveRoadEncounter(state, "flee"))}
              onBribe={() => commit(resolveRoadEncounter(state, "bribe"))}
            />
          </Modal>
        )}
        {!state.combat && !state.roadEncounter && state.awaitingRest && (
          <Modal>
            <RestDecision
              onSleep={() => commit(sleep(state))}
              onStayUp={() => commit(stayUp(state))}
            />
          </Modal>
        )}
        {ledgerOpen && (
          <LedgerOverlay
            state={state}
            onClose={() => setLedgerOpen(false)}
            onLoad={onLoad}
            onNewLife={onNewLife}
          />
        )}
      </>
    );
  }

  if (state.combat) {
    return (
      <Modal>
        <CombatPanel
          state={state}
          onAttack={() => commit(combatAttack(state))}
          onSpell={() => commit(combatSpell(state))}
          onFlee={() => commit(combatFlee(state))}
          onItem={(id) => commit(combatUseItem(state, id))}
          onContinue={() => commit(finishCombat(state))}
        />
      </Modal>
    );
  }

  if (state.dungeon) {
    return (
      <Modal>
        <DungeonPanel
          state={state}
          onPressOn={() => commit(pressOn(state))}
          onLeave={() => commit(leaveDungeon(state))}
        />
      </Modal>
    );
  }

  if (state.shopOpen) {
    return (
      <Modal>
        <ShopPanel
          state={state}
          onBuy={(ref) => commit(buy(state, ref))}
          onSell={(ref) => commit(sell(state, ref))}
          onEquipWeapon={(id) => commit(equipWeapon(state, id))}
          onEquipArmor={(id) => commit(equipArmor(state, id))}
          onRemoveArmor={() => commit(removeArmor(state))}
          onLeave={() => commit(closeShop(state))}
        />
      </Modal>
    );
  }

  if (state.awaitingRest) {
    return (
      <Modal>
        <RestDecision
          onSleep={() => commit(sleep(state))}
          onStayUp={() => commit(stayUp(state))}
        />
      </Modal>
    );
  }

  // --- Ordinary hamlet life, staged on the town -----------------------------

  return (
    <>
      <HudBar state={state} onLedger={() => setLedgerOpen(true)} />

      {/* Right-edge toggle for the character sheet (DnD-style). */}
      {!sheetOpen && (
        <button className="sheet-toggle" onClick={() => setSheetOpen(true)}>
          🎒
          {state.character.skillPoints > 0 && (
            <span className="sheet-toggle-dot">{state.character.skillPoints}</span>
          )}
          <span className="sheet-toggle-label">Character</span>
        </button>
      )}
      {sheetOpen && (
        <CharacterSheet
          state={state}
          onClose={() => setSheetOpen(false)}
          onSpend={(k) => commit(spendSkillPoint(state, k))}
          onEquipWeapon={(id) => commit(equipWeapon(state, id))}
          onEquipArmor={(id) => commit(equipArmor(state, id))}
          onRemoveArmor={() => commit(removeArmor(state))}
        />
      )}

      <ActionHotspots
        state={state}
        onAct={runAction}
        busyAction={busyAction}
        durationMs={ACTION_MS}
        feedback={feedback}
      />

      {/* A slim chronicle of the last few happenings, along the bottom. */}
      <div className="chronicle-strip">
        {state.log.slice(-3).map((line) => (
          <p key={line.id} className={line.tone}>
            {line.text}
          </p>
        ))}
      </div>

      {ledgerOpen && (
        <LedgerOverlay
          state={state}
          onClose={() => setLedgerOpen(false)}
          onLoad={onLoad}
          onNewLife={onNewLife}
        />
      )}
    </>
  );
}

/** The 📜 Ledger: stats, family, reputation, the full chronicle, and save
 *  management. Shared between the hamlet screen and the map screen so it's
 *  reachable no matter where the character currently is. */
function LedgerOverlay({
  state,
  onClose,
  onLoad,
  onNewLife,
}: {
  state: GameState;
  onClose: () => void;
  onLoad: (s: GameState) => void;
  onNewLife: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <StatPanel state={state} />
        <FamilyPanel state={state} />
        <ReputationPanel state={state} />
        <EventLog log={state.log} />

        <div className="panel">
          <h2>Your save</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Progress auto-saves in this browser. To keep it safe from a cleared cache — or to
            move it to another device — download a save file you own.
          </p>
          <div className="row-between">
            <button onClick={() => downloadSave(state)}>⬇ Download save</button>
            <LoadSaveButton onLoad={onLoad} label="⬆ Load save file" />
          </div>
        </div>

        <div className="row-between">
          <button className="ghost" onClick={onClose}>
            Close ledger
          </button>
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
      </div>
    </div>
  );
}
