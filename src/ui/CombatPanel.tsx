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
import { enemyHitChance, fleeChance, playerHitChance, spellDamage, spellHealAmount } from "../game/combat";
import { ITEMS } from "../game/equipment";
import { SPELLS } from "../game/spells";
import type { GameState } from "../game/types";
import {
  drawEnemy,
  drawHero,
  heroLookOf,
  type HeroLook,
  type Pose,
} from "../scene/sprites";

/** How long the hero's swing lingers before the blow lands (ms). */
const SWING_MS = 450;
/** After the blow lands, how long the enemy's answer plays before the buttons
 *  unlock again — the anti-spam beat. A round takes ~SWING_MS + ENEMY_MS. */
const ENEMY_MS = 750;
/** How long a flinch shows (ms). */
const HURT_MS = 360;
/** How long a splash / "Miss!" effect lives (ms). */
const EFFECT_MS = 750;
/** Stagger between consecutive effects of one round (player's, then enemy's). */
const EFFECT_GAP_MS = 380;
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

/** Where each pack member stands on the stage (logical x, up to 3 foes). */
const ENEMY_SLOTS = [158, 128, 190];

/** The little theatre: hero at left, the pack at right, on a dim ground. */
function CombatStage({
  look,
  enemies,
  heroPose,
  enemyPose,
  heroDown,
  targetIndex,
}: {
  look: HeroLook;
  enemies: { id: string; down: boolean }[];
  heroPose: Pose;
  enemyPose: Pose;
  heroDown: boolean;
  /** Which foe the pose/target marker applies to. */
  targetIndex: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 220;
  const H = 64;
  const SCALE = 2;

  const enemyKey = enemies.map((e) => `${e.id}:${e.down}`).join("|");
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
      enemies.forEach((e, i) => {
        if (e.down) return;
        const x = ENEMY_SLOTS[i % ENEMY_SLOTS.length] * SCALE;
        const pose = i === targetIndex ? enemyPose : "idle";
        drawEnemy(ctx!, x, (H - 8) * SCALE, e.id, pose, frame + i, SCALE, -1);
        // A small marker floats over the current target.
        if (i === targetIndex && enemies.filter((en) => !en.down).length > 1) {
          ctx!.fillStyle = "#e8c95a";
          ctx!.fillRect(x - 2 * SCALE, 6 * SCALE, 4 * SCALE, 2 * SCALE);
          ctx!.fillRect(x - 1 * SCALE, 8 * SCALE, 2 * SCALE, 2 * SCALE);
        }
      });
    }
    paint();
    const timer = window.setInterval(() => {
      frame++;
      paint();
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [look.gender, look.weaponId, look.armorId, look.seed, enemyKey, heroPose, enemyPose, heroDown, targetIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
  onTarget,
  onContinue,
}: {
  state: GameState;
  onAttack: () => void;
  onSpell: (spellId: string) => void;
  onFlee: () => void;
  onItem: (itemId: string) => void;
  onTarget: (index: number) => void;
  onContinue: () => void;
}) {
  const combat = state.combat!;
  const c = state.character;
  const enemies = combat.enemies;
  const living = enemies.filter((e) => e.hp > 0);
  // The foe the next blow lands on (self-heals if the stored target died).
  const targetIndex =
    enemies[combat.target]?.hp > 0
      ? combat.target
      : Math.max(0, enemies.findIndex((e) => e.hp > 0));
  const enemy = enemies[targetIndex];
  const over = combat.over;

  // --- Animation choreography (pure presentation) ---------------------------
  const [busy, setBusy] = useState(false);
  const [spellsOpen, setSpellsOpen] = useState(false);
  const [heroPose, setHeroPose] = useState<Pose>("idle");
  const [enemyPose, setEnemyPose] = useState<Pose>("idle");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  /** Play the hero's swing, commit the action, then hold the buttons locked
   *  while the enemy's answer plays out — one deliberate beat per round. */
  function withSwing(act: () => void, swings = true) {
    if (busy || over) return;
    setBusy(true);
    if (swings) setHeroPose("attack");
    later(swings ? SWING_MS : 120, () => {
      act();
      setHeroPose("idle");
      later(ENEMY_MS, () => setBusy(false));
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

  // Splash bursts and "Miss!" slips, driven by the fight's structured events.
  const [fx, setFx] = useState<Array<{ id: number; side: "hero" | "enemy"; kind: "splash" | "spell" | "miss" }>>([]);
  const fxKey = useRef(0);
  function popFx(side: "hero" | "enemy", kind: "splash" | "spell" | "miss") {
    fxKey.current += 1;
    const id = fxKey.current;
    setFx((prev) => [...prev, { id, side, kind }]);
    later(EFFECT_MS, () => setFx((prev) => prev.filter((f) => f.id !== id)));
  }

  // Replay only the events we haven't animated yet (a reloaded mid-fight save
  // starts from its latest id, so history isn't replayed on mount).
  const events = combat.events ?? [];
  const latestEventId = events.length > 0 ? events[events.length - 1].id : 0;
  const seenEventId = useRef(latestEventId);
  useEffect(() => {
    const fresh = events.filter((e) => e.id > seenEventId.current);
    if (fresh.length === 0) return;
    seenEventId.current = latestEventId;
    let delay = 0;
    for (const e of fresh) {
      const struck: "hero" | "enemy" = e.actor === "enemy" ? "hero" : "enemy";
      const ev = e;
      later(delay, () => {
        if (ev.kind === "hit") popFx(struck, "splash");
        else if (ev.kind === "spell") popFx(struck, "spell");
        else if (ev.kind === "miss") {
          popFx(struck, "miss");
          // A miss never moves an HP bar, so animate the swing here: the
          // enemy lunges (hits already animate through the HP effects).
          if (ev.actor === "enemy") {
            setEnemyPose("attack");
            later(HURT_MS, () => setEnemyPose("idle"));
          }
        }
      });
      delay += EFFECT_GAP_MS;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestEventId]);

  // Whoever lost HP since the last render flinches (the pack's total tracks
  // any member being struck).
  const enemyHpTotal = enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
  const prevEnemyHp = useRef(enemyHpTotal);
  useEffect(() => {
    if (enemyHpTotal < prevEnemyHp.current) {
      setEnemyPose("hurt");
      popDamage("enemy", prevEnemyHp.current - enemyHpTotal);
      later(HURT_MS, () => setEnemyPose("idle"));
    }
    prevEnemyHp.current = enemyHpTotal;
  }, [enemyHpTotal]); // eslint-disable-line react-hooks/exhaustive-deps
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
          Battle — {enemies.length > 1 ? `${enemies.length} foes` : enemy.name}
        </h2>
        <span className="phase-badge night">Round {combat.round}</span>
      </div>

      <div className="combat-stage-wrap">
        <CombatStage
          look={heroLookOf(c)}
          enemies={enemies.map((e) => ({ id: e.id, down: e.hp <= 0 }))}
          heroPose={heroPose}
          enemyPose={enemyPose}
          heroDown={over && combat.outcome === "killed"}
          targetIndex={targetIndex}
        />
        {dmgNums.map((d) => (
          <span key={d.id} className={`dmg-number ${d.side}`}>
            {d.text}
          </span>
        ))}
        {fx.map((f) =>
          f.kind === "miss" ? (
            <span key={f.id} className={`miss-float ${f.side}`}>
              Miss!
            </span>
          ) : (
            <span
              key={f.id}
              className={`hit-splash ${f.side}${f.kind === "spell" ? " spell" : ""}`}
            />
          ),
        )}
      </div>

      {/* The pack: one chip per foe. With several alive, click to target. */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {enemies.map((e, i) => (
          <button
            key={i}
            className={`enemy-chip${i === targetIndex && e.hp > 0 ? " targeted" : ""}${e.hp <= 0 ? " down" : ""}`}
            onClick={() => !over && !busy && e.hp > 0 && onTarget(i)}
            disabled={over || busy || e.hp <= 0}
            title={e.hp <= 0 ? "Down" : living.length > 1 ? "Target this foe" : undefined}
          >
            <span className="enemy-chip-name">
              {i === targetIndex && e.hp > 0 && living.length > 1 ? "◎ " : ""}
              {e.name}
            </span>
            <span className="enemy-chip-hp">{e.hp <= 0 ? "down" : `${e.hp}/${e.maxHp}`}</span>
            <div className="bar hp" style={{ marginTop: 3 }}>
              <span style={{ width: `${Math.max(0, Math.round((e.hp / e.maxHp) * 100))}%` }} />
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <Meter label="Your health" value={c.hp} max={c.maxHp} kind="hp" />
        <Meter label="Mana" value={c.mana} max={c.maxMana} kind="mp" />
      </div>
      {!over && (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
          {living.length > 1
            ? `${living.length} foes press in — your blows land on the ${enemy.name}.`
            : `The ${enemy.name} looks ~${enemyHitChance(c, enemy)}% likely to land its next blow.`}
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
              onClick={() => setSpellsOpen((v) => !v)}
              disabled={busy || c.knownSpells.length === 0}
            >
              <span>Cast a Spell {spellsOpen ? "▴" : "▾"}</span>
              <span className="hint">
                {c.knownSpells.length} known · {c.mana} mana in reserve
              </span>
            </button>
            <button className="action ghost" onClick={() => withSwing(onFlee, false)} disabled={busy}>
              <span>Flee</span>
              <span className="hint">~{Math.round(fleeChance(c, enemy))}% chance to escape (Agility)</span>
            </button>
          </div>

          {spellsOpen && (
            <>
              <p className="muted" style={{ margin: "14px 0 6px" }}>
                Choose a spell:
              </p>
              <div className="actions">
                {c.knownSpells.map((spellId) => {
                  const spell = SPELLS[spellId];
                  if (!spell) return null;
                  const preview =
                    spell.kind === "heal"
                      ? `heals ${spellHealAmount(c, spell)}`
                      : `${spellDamage(c, enemy, spell)} dmg`;
                  return (
                    <button
                      key={spell.id}
                      className="action"
                      onClick={() => {
                        setSpellsOpen(false);
                        withSwing(() => onSpell(spell.id));
                      }}
                      disabled={busy || c.mana < spell.cost}
                      title={c.mana < spell.cost ? "Not enough mana" : spell.desc}
                    >
                      <span>{spell.name}</span>
                      <span className="hint">
                        {spell.cost} mana · {preview}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

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
