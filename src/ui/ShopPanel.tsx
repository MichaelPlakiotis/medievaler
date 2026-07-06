// ---------------------------------------------------------------------------
// ShopPanel.tsx — the market and your gear (GDD §3.3 / §5.1). Shown while
// state.shopOpen. Buying and selling are free; leaving is what costs the turn.
// Pure display + click-forwarding; all the rules live in src/game/shop.ts.
// ---------------------------------------------------------------------------

import { ARMORS, ITEMS, WEAPONS, meetsRequirements, requirementText } from "../game/equipment";
import {
  SHOP_STOCK,
  buyPrice,
  owns,
  sellPrice,
  stockInfo,
  type StockRef,
} from "../game/shop";
import { FACTION_LABELS, standingLabel } from "../game/reputation";
import type { GameState } from "../game/types";

/** A short stats line for a weapon or armor id. */
function gearStats(kind: "weapon" | "armor", id: string): string {
  if (kind === "weapon") {
    const w = WEAPONS[id];
    return `dmg ${w.baseDamage} · skill ${w.skill} · ${w.attackAttr}`;
  }
  const a = ARMORS[id];
  return `armor ${a.armorValue}${a.weightPenalty ? ` · −${a.weightPenalty} dodge` : ""}`;
}

export function ShopPanel({
  state,
  onBuy,
  onSell,
  onEquipWeapon,
  onEquipArmor,
  onRemoveArmor,
  onLeave,
}: {
  state: GameState;
  onBuy: (ref: StockRef) => void;
  onSell: (ref: StockRef) => void;
  onEquipWeapon: (id: string) => void;
  onEquipArmor: (id: string) => void;
  onRemoveArmor: () => void;
  onLeave: () => void;
}) {
  const c = state.character;

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", margin: 0, paddingBottom: 0 }}>The Shop</h2>
        <span className="muted">
          Purse: <strong style={{ color: "var(--gold)" }}>{c.gold}g</strong> ·{" "}
          {FACTION_LABELS.merchants}: {standingLabel(c.reputation.merchants)}
        </span>
      </div>

      {/* ---- Buy ---- */}
      <h3 className="shop-heading">For sale</h3>
      <div className="shop-list">
        {SHOP_STOCK.map((ref) => {
          const { name, basePrice } = stockInfo(ref);
          const price = buyPrice(c, basePrice);
          const alreadyOwned = ref.kind !== "consumable" && owns(c, ref);
          const req =
            ref.kind === "weapon"
              ? WEAPONS[ref.id].requirements
              : ref.kind === "armor"
                ? ARMORS[ref.id].requirements
                : undefined;
          const canWield = meetsRequirements(c.attributes, req);
          const detail =
            ref.kind === "consumable"
              ? ITEMS[ref.id].desc
              : `${gearStats(ref.kind, ref.id)}${req ? ` · needs ${requirementText(req)}` : ""}`;
          return (
            <div className="shop-row" key={`${ref.kind}-${ref.id}`}>
              <div>
                <div className="shop-name">
                  {name}
                  {alreadyOwned && <span className="muted"> · owned</span>}
                  {!canWield && ref.kind !== "consumable" && (
                    <span className="req-warn"> · can't wield yet</span>
                  )}
                </div>
                <div className="shop-detail">{detail}</div>
              </div>
              <button
                onClick={() => onBuy(ref)}
                disabled={c.gold < price || alreadyOwned}
                title={c.gold < price ? "Not enough gold" : undefined}
              >
                Buy {price}g
              </button>
            </div>
          );
        })}
      </div>

      {/* ---- Your gear ---- */}
      <h3 className="shop-heading">Your gear</h3>
      <div className="shop-list">
        {/* Weapons */}
        {c.ownedWeapons.map((id) => {
          const w = WEAPONS[id];
          const equipped = c.weapon.id === id;
          const canWield = meetsRequirements(c.attributes, w.requirements);
          return (
            <div className="shop-row" key={`w-${id}`}>
              <div>
                <div className="shop-name">
                  ⚔ {w.name}
                  {equipped && <span className="equipped-tag"> · equipped</span>}
                  {!canWield && <span className="req-warn"> · needs {requirementText(w.requirements)}</span>}
                </div>
                <div className="shop-detail">{gearStats("weapon", id)}</div>
              </div>
              <div className="shop-actions">
                {!equipped && (
                  <button className="ghost" onClick={() => onEquipWeapon(id)} disabled={!canWield}>
                    Equip
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={() => onSell({ kind: "weapon", id })}
                  disabled={equipped}
                  title={equipped ? "Can't sell your equipped weapon" : undefined}
                >
                  Sell {sellPrice(c, w.price)}g
                </button>
              </div>
            </div>
          );
        })}

        {/* Armor */}
        {c.ownedArmor.map((id) => {
          const a = ARMORS[id];
          const worn = c.armor?.id === id;
          const canWear = meetsRequirements(c.attributes, a.requirements);
          return (
            <div className="shop-row" key={`a-${id}`}>
              <div>
                <div className="shop-name">
                  🛡 {a.name}
                  {worn && <span className="equipped-tag"> · worn</span>}
                  {!canWear && <span className="req-warn"> · needs {requirementText(a.requirements)}</span>}
                </div>
                <div className="shop-detail">{gearStats("armor", id)}</div>
              </div>
              <div className="shop-actions">
                {worn ? (
                  <button className="ghost" onClick={onRemoveArmor}>
                    Take off
                  </button>
                ) : (
                  <button className="ghost" onClick={() => onEquipArmor(id)} disabled={!canWear}>
                    Wear
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={() => onSell({ kind: "armor", id })}
                  disabled={worn}
                  title={worn ? "Can't sell armor you're wearing" : undefined}
                >
                  Sell {sellPrice(c, a.price)}g
                </button>
              </div>
            </div>
          );
        })}

        {/* Consumables */}
        {Object.keys(c.inventory)
          .filter((id) => (c.inventory[id] ?? 0) > 0 && ITEMS[id])
          .map((id) => (
            <div className="shop-row" key={`i-${id}`}>
              <div>
                <div className="shop-name">
                  {ITEMS[id].name} ×{c.inventory[id]}
                </div>
                <div className="shop-detail">{ITEMS[id].desc}</div>
              </div>
              <button className="ghost" onClick={() => onSell({ kind: "consumable", id })}>
                Sell {sellPrice(c, ITEMS[id].price)}g
              </button>
            </div>
          ))}
      </div>

      <button style={{ width: "100%", marginTop: 16, padding: 14 }} onClick={onLeave}>
        Leave the shop → (ends the turn)
      </button>
    </div>
  );
}
