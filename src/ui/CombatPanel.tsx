// ---------------------------------------------------------------------------
// CombatPanel.tsx — the battle screen (GDD §4). Shown whenever state.combat is
// set. The fight is staged visually: your armed paper-doll faces the enemy's
// sprite on a small canvas, swings when you act, and both flinch when hurt.
// Below it, the three actions: Weapon Attack, Spell Attack, Use Item. When the
// fight is over a single "Continue" hands control back to the day loop.
//
// Combat *logic* stays pure in src/game/combat.ts — this component only adds a
// short animation beat before committing each action, and reads HP changes
// afterwards to decide who flinches.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { SPELL_COST } from "../game/config";
import { enemyHitChance, fleeChance, playerHitChance, spellDamage } from "../game/combat";
import { ITEMS } from "../game/equipment";
import type { GameState } from "../game/types";
import {
  drawEnemy,
  drawHero,
  heroLookOf,
  type HeroLook,
  type Pose,
} from "../scene/sprites";

/** How long the hero's swing lingers before the blow lands (ms). */
const SWING_MS = 320;
/** How long a flinch shows (ms). */
const HURT_MS = 360;
/** Sprite animation frame length (ms). */
const FRAME_MS = 200;
/** How long the red damage flash lingers on a bar that just dropped (ms). */
const FLASH_MS = 400;

/** A labeled HP/MP bar that briefly flashes when its value drops. */
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
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value < prev.current) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), FLASH_MS);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <div className="stat" style={{ flex: 1 }}>
      <div className="k">{label}</div>
      <div className="v">
        {Math.max(0, value)}/{max}
      </div>
      <div className={`bar ${kind === "hp" ? "hp" : "xp"}${flash ? " flash" : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The little theatre: hero at left, enemy at right, on a dim ground. */
function CombatStage({
  look,
  enemyId,
  heroPose,
  enemyPose,
  heroDown,
  enemyDown,
}: {
  look: HeroLook;
  enemyId: string;
  heroPose: Pose;
  enemyPose: Pose;
  heroDown: boolean;
  enemyDown: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 220;
  const H = 64;
  const SCALE = 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    function paint() {
      ctx!.imageSmoothingEnabled = false;
      // Backdrop: a dim clearing, whoever's ground this fight found you on.
      ctx!.fillStyle = "#242838";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "#3a3f4f";
      ctx!.fillRect(0, (H - 12) * SCALE, canvas!.width, 12 * SCALE);
      ctx!.fillStyle = "#4a4f61";
      ctx!.fillRect(0, (H - 12) * SCALE, canvas!.width, 1 * SCALE);

      if (!heroDown) drawHero(ctx!, 62 * SCALE, (H - 8) * SCALE, look, heroPose, frame, SCALE, 1);
      if (!enemyDown) drawEnemy(ctx!, 158 * SCALE, (H - 8) * SCALE, enemyId, enemyPose, frame, SCALE, -1);
    }
    paint();
    const timer = window.setInterval(() => {
      frame++;
      paint();
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [look.gender, look.weaponId, look.armorId, look.seed, enemyId, heroPose, enemyPose, heroDown, enemyDown]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas ref={canvasRef} width={W * SCALE} height={H * SCALE} className="combat-stage" />
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
  onFlee,
  onItem,
  onContinue,
}: {
  state: GameState;
  onAttack: () => void;
  onSpell: () => void;
  onFlee: () => void;
  onItem: (itemId: string) => void;
  onContinue: () => void;
}) {
  const combat = state.combat!;
  const c = state.character;
  const enemy = combat.enemy;
  const over = combat.over;

  // --- Animation choreography (pure presentation) ---------------------------
  const [busy, setBusy] = useState(false);
  const [heroPose, setHeroPose] = useState<Pose>("idle");
  const [enemyPose, setEnemyPose] = useState<Pose>("idle");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  /** Play the hero's swing, then commit the action. */
  function withSwing(act: () => void, swings = true) {
    if (busy || over) return;
    setBusy(true);
    if (swings) setHeroPose("attack");
    later(swings ? SWING_MS : 80, () => {
      act();
      setHeroPose("idle");
      setBusy(false);
    });
  }

  // Floating damage numbers over the stage — one per hit, self-expiring.
  const [dmgNums, setDmgNums] = useState<Array<{ id: number; text: string; side: "hero" | "enemy" }>>([]);
  const dmgKey = useRef(0);
  function popDamage(side: "hero" | "enemy", amount: number) {
    dmgKey.current += 1;
    const id = dmgKey.current;
    setDmgNums((prev) => [...prev, { id, text: `-${amount}`, side }]);
    later(700, () => setDmgNums((prev) => prev.filter((d) => d.id !== id)));
  }

  // Whoever lost HP since the last render flinches.
  const prevEnemyHp = useRef(enemy.hp);
  useEffect(() => {
    if (enemy.hp < prevEnemyHp.current) {
      setEnemyPose("hurt");
      popDamage("enemy", prevEnemyHp.current - enemy.hp);
      later(HURT_MS, () => setEnemyPose("idle"));
    }
    prevEnemyHp.current = enemy.hp;
  }, [enemy.hp]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevHeroHp = useRef(c.hp);
  useEffect(() => {
    if (c.hp < prevHeroHp.current) {
      setEnemyPose("attack");
      setHeroPose("hurt");
      popDamage("hero", prevHeroHp.current - c.hp);
      later(HURT_MS, () => {
        setHeroPose("idle");
        setEnemyPose("idle");
      });
    }
    prevHeroHp.current = c.hp;
  }, [c.hp]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="combat-stage-wrap">
        <CombatStage
          look={heroLookOf(c)}
          enemyId={enemy.id}
          heroPose={heroPose}
          enemyPose={enemyPose}
          heroDown={over && combat.outcome === "killed"}
          enemyDown={enemy.hp <= 0}
        />
        {dmgNums.map((d) => (
          <span key={d.id} className={`dmg-number ${d.side}`}>
            {d.text}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <Meter label={`${enemy.name}`} value={enemy.hp} max={enemy.maxHp} kind="hp" />
        <Meter label="Your health" value={c.hp} max={c.maxHp} kind="hp" />
        <Meter label="Mana" value={c.mana} max={c.maxMana} kind="mp" />
      </div>
      {!over && (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
          The {enemy.name} looks ~{enemyHitChance(c, enemy)}% likely to land its next blow.
        </p>
      )}

      {!over ? (
        <>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="action" onClick={() => withSwing(onAttack)} disabled={busy}>
              <span>Weapon Attack</span>
              <span className="hint">
                {c.weapon.name} · ~{playerHitChance(c, enemy)}% to hit
              </span>
            </button>
            <button
              className="action"
              onClick={() => withSwing(onSpell)}
              disabled={busy || c.mana < SPELL_COST}
              title={c.mana < SPELL_COST ? "Not enough mana" : undefined}
            >
              <span>Spell Attack</span>
              <span className="hint">
                Bolt of force · {SPELL_COST} mana · {spellDamage(c, enemy)} dmg
              </span>
            </button>
            <button className="action ghost" onClick={() => withSwing(onFlee, false)} disabled={busy}>
              <span>Flee</span>
              <span className="hint">~{Math.round(fleeChance(c, enemy))}% chance to escape (Agility)</span>
            </button>
          </div>

          {usableItems.length > 0 && (
            <>
              <p className="muted" style={{ margin: "14px 0 6px" }}>
                Use an item:
              </p>
              <div className="actions">
                {usableItems.map((id) => (
                  <button
                    key={id}
                    className="action"
                    onClick={() => withSwing(() => onItem(id), false)}
                    disabled={busy}
                  >
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
