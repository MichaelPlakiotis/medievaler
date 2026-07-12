// ---------------------------------------------------------------------------
// GameScreen.tsx — the play view, now staged over the animated town. Focused
// moments (combat, shop, the rest decision, succession, death) appear as modal
// cards over a dimmed scene; ordinary hamlet life happens as buttons placed on
// the town itself, each taking a beat to play out before it resolves.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  closeNpc,
  closeShop,
  enterTown,
  exploreSite,
  fastTravel,
  finishCombat,
  leaveDungeon,
  resolveRoadEncounter,
  sail,
  sleep,
  stayOutside,
  stayUp,
  takeAction,
  travelTo,
  useConsumable,
} from "../game/engine";
import { acceptQuest, turnInQuest } from "../game/quests";
import { depositFamilyFund } from "../game/family";
import { settlementOf } from "../game/worldmap";
import {
  combatAttack,
  combatFlee,
  combatSetTarget,
  combatSpell,
  combatUseItem,
} from "../game/combat";
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
import { NpcPanel } from "./NpcPanel";
import { QuestJournal } from "./QuestJournal";

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
      // a fight, the shop, a dungeon, or a conversation — those narrate their
      // own rewards).
      if (!next.combat && !next.shopOpen && !next.dungeon && !next.npcOpen) {
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

  // The saga's end — shown once, then the world (blight lifting) plays on.
  if (state.victory === "won") {
    return (
      <Modal>
        <div className="panel">
          <h2>The Ashveil Lifts</h2>
          <p>
            Varek Ashveil is no more. Across Aethenmoor the pale fog thins, the ground softens,
            and — for the first time in a hundred years — the north smells of rain instead of
            cold.
          </p>
          <p>
            It took your family {state.generation}{" "}
            {state.generation === 1 ? "generation" : "generations"} to reach the Spire's height.
            The settlements will sing the name for as long as there are hearths to sing at.
          </p>
          <p className="muted">
            “We are not a story about a hero who defeated a Lich. We are a family that refused to
            stop trying.”
          </p>
          <button
            style={{ width: "100%", padding: 14 }}
            onClick={() => commit({ ...state, victory: "acknowledged" })}
          >
            Live on →
          </button>
        </div>
      </Modal>
    );
  }

  // A pacing veil: on every change of "where the game's attention is", the
  // screen settles in from dark for a beat instead of snapping.
  const modeKey = state.combat
    ? "combat"
    : state.dungeon
      ? "dungeon"
      : state.shopOpen
        ? "shop"
        : state.npcOpen
          ? `npc:${state.npcOpen}`
          : state.mapOpen
            ? "map"
            : state.awaitingRest
              ? "rest"
              : `town:${state.location.settlementId ?? "road"}:${state.phase}`;
  const veil = <div key={modeKey} className="scene-veil" aria-hidden="true" />;

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
        {veil}
        <HudBar state={state} onLedger={() => setLedgerOpen(true)} />
        <MapScreen
          state={state}
          onMove={(hex) => commit(travelTo(state, hex))}
          onLeaveMap={() => commit(closeMap(state))}
          onExploreSite={() => commit(exploreSite(state))}
          onFastTravel={(id) => commit(fastTravel(state, id))}
          onSail={(id) => commit(sail(state, id))}
          onUseItem={(id) => commit(useConsumable(state, id))}
        />
        {/* The character sheet stays reachable on the road — gear swaps and a
            bite to eat shouldn't require walking back into town. */}
        {!sheetOpen && !state.combat && !state.roadEncounter && !state.dungeon && (
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
            onUseItem={(id) => commit(useConsumable(state, id))}
          />
        )}
        {state.combat && (
          <Modal>
            <CombatPanel
              state={state}
              onAttack={() => commit(combatAttack(state))}
              onSpell={(spellId) => commit(combatSpell(state, spellId))}
              onFlee={() => commit(combatFlee(state))}
              onItem={(id) => commit(combatUseItem(state, id))}
              onTarget={(i) => commit(combatSetTarget(state, i))}
              onContinue={() => commit(finishCombat(state))}
            />
          </Modal>
        )}
        {!state.combat && !state.dungeon && !state.roadEncounter && state.townPrompt && (
          <Modal>
            <TownGatePrompt
              state={state}
              onEnter={() => commit(enterTown(state))}
              onStay={() => commit(stayOutside(state))}
            />
          </Modal>
        )}
        {!state.combat && state.dungeon && (
          <Modal>
            <DungeonPanel
              state={state}
              onPressOn={() => commit(pressOn(state))}
              onLeave={() => commit(leaveDungeon(state))}
            />
          </Modal>
        )}
        {!state.combat && !state.dungeon && state.roadEncounter && (
          <Modal>
            <RoadEncounterPanel
              state={state}
              onFight={() => commit(resolveRoadEncounter(state, "fight"))}
              onFlee={() => commit(resolveRoadEncounter(state, "flee"))}
              onBribe={() => commit(resolveRoadEncounter(state, "bribe"))}
            />
          </Modal>
        )}
        {!state.combat && !state.roadEncounter && !state.townPrompt && state.awaitingRest && (
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
            onDeposit={(amt) => commit(depositFamilyFund(state, amt))}
          />
        )}
      </>
    );
  }

  if (state.combat) {
    return (
      <>
        {veil}
        <Modal>
          <CombatPanel
            state={state}
            onAttack={() => commit(combatAttack(state))}
            onSpell={(spellId) => commit(combatSpell(state, spellId))}
            onFlee={() => commit(combatFlee(state))}
            onItem={(id) => commit(combatUseItem(state, id))}
            onTarget={(i) => commit(combatSetTarget(state, i))}
            onContinue={() => commit(finishCombat(state))}
          />
        </Modal>
      </>
    );
  }

  if (state.dungeon) {
    return (
      <>
        {veil}
        <Modal>
          <DungeonPanel
            state={state}
            onPressOn={() => commit(pressOn(state))}
            onLeave={() => commit(leaveDungeon(state))}
          />
        </Modal>
      </>
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

  if (state.npcOpen) {
    return (
      <Modal>
        <NpcPanel
          state={state}
          onAccept={(qid) => commit(acceptQuest(state, qid))}
          onTurnIn={(qid) => commit(turnInQuest(state, qid))}
          onLeave={() => commit(closeNpc(state))}
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
      {veil}
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
          onUseItem={(id) => commit(useConsumable(state, id))}
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
          onDeposit={(amt) => commit(depositFamilyFund(state, amt))}
        />
      )}
    </>
  );
}

/** Standing before a settlement's gates: enter, or keep to the road? */
function TownGatePrompt({
  state,
  onEnter,
  onStay,
}: {
  state: GameState;
  onEnter: () => void;
  onStay: () => void;
}) {
  const settlement = settlementOf(state.map, state.townPrompt);
  if (!settlement) return null;
  const kindWord =
    settlement.kind === "city" ? "city" : settlement.kind === "town" ? "town" : "hamlet";
  return (
    <div className="panel">
      <h2>The gates of {settlement.name}</h2>
      <p>
        The road ends at the walls of this {kindWord}. Smoke rises from its chimneys; the gate
        stands open for now.
      </p>
      <p className="muted">
        Enter, and the {kindWord}'s roofs and trades are yours until you take to the road again.
        Stay outside, and the night is yours to survive — the wilds do not care whose walls are
        near.
      </p>
      <div className="row-between">
        <button className="ghost" onClick={onStay}>
          Stay on the road
        </button>
        <button onClick={onEnter}>Enter {settlement.name} →</button>
      </div>
    </div>
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
  onDeposit,
}: {
  state: GameState;
  onClose: () => void;
  onLoad: (s: GameState) => void;
  onNewLife: () => void;
  onDeposit: (amount: number) => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <StatPanel state={state} />
        <QuestJournal state={state} />
        <FamilyPanel state={state} onDeposit={onDeposit} />
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
