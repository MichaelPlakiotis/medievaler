// ---------------------------------------------------------------------------
// CharacterSheet.tsx — a DnD-style character sheet in a right-hand sidebar
// (toggled from the edge). Shows attributes with their practice toward the next
// point, lets you spend earned skill points to raise a stat, and manage your
// gear (equip/unequip anywhere, respecting requirements — GDD §3.3).
// ---------------------------------------------------------------------------

import { ATTR_LABELS } from "../game/config";
import { attributeThreshold, xpForLevel } from "../game/character";
import { ageTier } from "../game/engine";
import { ARMORS, WEAPONS, meetsRequirements, requirementText } from "../game/equipment";
import { heroLookOf } from "../scene/sprites";
import { AgeMod } from "./AgeMod";
import { HeroPortrait } from "./HeroPortrait";
import type { AttributeKey, GameState } from "../game/types";

const KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

export function CharacterSheet({
  state,
  onClose,
  onSpend,
  onEquipWeapon,
  onEquipArmor,
  onRemoveArmor,
}: {
  state: GameState;
  onClose: () => void;
  onSpend: (key: AttributeKey) => void;
  onEquipWeapon: (id: string) => void;
  onEquipArmor: (id: string) => void;
  onRemoveArmor: () => void;
}) {
  const c = state.character;
  const curXp = xpForLevel(c.level);
  const nextXp = xpForLevel(c.level + 1);
  const xpPct = Math.min(100, Math.round(((c.xp - curXp) / Math.max(1, nextXp - curXp)) * 100));

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <div className="sheet-name">
            {c.gender === "male" ? "♂" : "♀"} {c.name}
          </div>
          <div className="muted">
            {c.ageYears} · {ageTier(c.ageYears)} · Level {c.level}
          </div>
        </div>
        <button className="ghost" onClick={onClose} aria-label="close sheet">
          ✕
        </button>
      </div>

      {/* The paper-doll: redraws as gear is equipped below. */}
      <div className="sheet-portrait">
        <HeroPortrait look={heroLookOf(c)} scale={4} />
      </div>

      {/* XP toward next level */}
      <div className="sheet-block">
        <div className="sheet-row">
          <span>Experience</span>
          <span className="muted">
            {c.xp} / {nextXp}
          </span>
        </div>
        <div className="bar xp">
          <span style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      {/* Attributes = skills. Spend points to raise them. */}
      <h3 className="sheet-heading">
        Attributes
        {c.skillPoints > 0 && <span className="sp-badge">{c.skillPoints} skill pts</span>}
      </h3>
      {KEYS.map((k) => {
        const val = c.attributes[k];
        const prog = c.attributeProgress[k];
        const pct = Math.min(100, Math.round((prog / attributeThreshold(val)) * 100));
        return (
          <div className="sheet-attr" key={k}>
            <div className="sheet-attr-top">
              <span>
                <strong>{ATTR_LABELS[k]}</strong> <span className="muted">({k})</span>
              </span>
              <span className="sheet-attr-val">
                {val}
                <AgeMod character={c} attr={k} />
              </span>
              {c.skillPoints > 0 && (
                <button className="sp-plus" onClick={() => onSpend(k)} title={`Raise ${k}`}>
                  +
                </button>
              )}
            </div>
            <div className="bar" title="Practice toward the next point">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {/* Vital stats */}
      <h3 className="sheet-heading">Condition</h3>
      <div className="sheet-vitals">
        <span>HP {c.hp}/{c.maxHp}</span>
        {c.maxMana > 0 && <span>MP {c.mana}/{c.maxMana}</span>}
        <span>Armor {c.armor?.armorValue ?? 0}</span>
        <span className="gold-text">{c.gold}g</span>
        <span>
          {c.ownedHomes.length === 0
            ? "no home"
            : c.ownedHomes.length === 1
              ? "🏠 Home"
              : `🏠 ×${c.ownedHomes.length}`}
        </span>
      </div>

      {/* Equipment */}
      <h3 className="sheet-heading">Equipment</h3>
      <div className="sheet-equip">
        <div className="sheet-slot">
          <span className="muted">Weapon</span>
          <strong>{c.weapon.name}</strong>
          <span className="muted">
            dmg {c.weapon.baseDamage} · {c.weapon.attackAttr}
          </span>
        </div>
        <div className="sheet-slot">
          <span className="muted">Armor</span>
          <strong>{c.armor ? c.armor.name : "None"}</strong>
          {c.armor && (
            <button className="ghost sheet-mini" onClick={onRemoveArmor}>
              Take off
            </button>
          )}
        </div>
      </div>

      {/* Owned gear you can switch to */}
      <div className="sheet-owned">
        {c.ownedWeapons
          .filter((id) => id !== c.weapon.id)
          .map((id) => {
            const w = WEAPONS[id];
            const can = meetsRequirements(c.attributes, w.requirements);
            return (
              <div className="sheet-owned-row" key={`w-${id}`}>
                <span>⚔ {w.name}</span>
                <button className="ghost sheet-mini" onClick={() => onEquipWeapon(id)} disabled={!can}>
                  {can ? "Wield" : `needs ${requirementText(w.requirements)}`}
                </button>
              </div>
            );
          })}
        {c.ownedArmor
          .filter((id) => id !== c.armor?.id)
          .map((id) => {
            const a = ARMORS[id];
            const can = meetsRequirements(c.attributes, a.requirements);
            return (
              <div className="sheet-owned-row" key={`a-${id}`}>
                <span>🛡 {a.name}</span>
                <button className="ghost sheet-mini" onClick={() => onEquipArmor(id)} disabled={!can}>
                  {can ? "Wear" : `needs ${requirementText(a.requirements)}`}
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
