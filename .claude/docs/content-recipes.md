# Content recipes

Step-by-step guides for adding game content. These are complete — you should not need to read `equipment.ts` or `sprites.ts` in full. After any recipe, run `npx vitest run test/sprites.test.ts` (or the full suite).

## Recipe: new weapon

Two edits, always both (the sprite test enforces it):

**1. Data — `src/game/equipment.ts`, inside `export const WEAPONS`** (starts ~line 11; magic weapons section at the end, marked `--- Magic weapons`):

```ts
falchion: {
  id: "falchion",            // key and id must match
  name: "Falchion",
  baseDamage: 8,             // existing range: 4 (starter) → 13 (best magic)
  skill: 11,                 // to-hit skill; existing range 8–15
  attackAttr: "STR",         // "STR" or "AGI"
  requirements: { STR: 4 },  // optional attribute gate
  price: 65,                 // gold; also its sale value
},
```

Balance ladder for price (drives which shops stock it via `STOCK_TIERS` in `shop.ts`): ≤60 hamlet+, ≤160 town+, above that city-only. Never-sold dungeon loot: add the id to `MAGIC_WEAPONS` (same file, ~line 138) — dungeons award unowned magic weapons automatically (`dungeon.ts`).

**2. Sprite — `src/scene/sprites.ts`, inside `export const WEAPON_SPRITES`** (starts ~line 209, add before the closing `};` ~line 277):

```ts
falchion: (s) => {
  s.px(s.handX, s.handY - 6, 1, 6, "#c8ccd4");     // straight back edge
  s.px(s.handX + 1, s.handY - 5, 1, 4, "#d8dce4"); // broad curved edge
  s.px(s.handX - 1, s.handY, 3, 1, "#5a4a2a");     // guard
},
```

That's it — placement on the character is automatic (see painter API below). The weapon then renders in the character sheet, town, and combat with idle/walk/attack/hurt poses for free.

## The sprite painter API (`SpritePainter`)

Layer functions receive `s` and draw 1×1-logical-pixel rects:

- `s.px(dx, dy, w, h, color)` — rect inside the sprite box. `dx` from the left, `dy` from the **top** of the box. Hero box is 16 wide × 24 tall, feet at the bottom edge, drawn **facing right** (mirroring is automatic).
- `s.handX`, `s.handY` — the leading hand position; **always draw weapons relative to these**. Idle/walk hand is at (14, 13); the attack pose moves it to (15, 7), so a weapon drawn "up" from the hand (negative dy offsets) reads as a raised swing with zero extra work.
- `s.pose` — `"idle" | "walk" | "attack" | "hurt"`; `s.frame` — 0/1 animation frame. Weapon layers rarely need these; body/enemy layers use them for stride/bob.

Conventions from existing sprites: blades `#c8ccd4`/`#d8dce4`, wood hafts `#6a4a22`–`#9a7442`, gilt `#c8a232`, magic glow accents (`#7ae8ff` runes, `#ff7a1e` ember). Weapons are 1–2 px wide and extend 4–12 px above the hand (knife 4, greatsword 9+tip, spear 12). Bows: draw limbs curving away at `handX+1/+2` with a `#e8e4d8` string at `handX`.

## Recipe: new armor

Same two-step pattern:

1. `equipment.ts` → `ARMORS` (~line 141): `{ id, name, armorValue (1–6), weightPenalty (0–4, hurts dodge), requirements?, price }`.
2. `sprites.ts` → `ARMOR_SPRITES` (~line 169). Armor paints **over the torso region**: body is at x 4–11, torso y 7–14 (belt at 14). Shoulder pads at `(3,7,3,2)` and `(10,7,3,2)`. Chainmail shows how to add a coif over the head (y 0–6).

## Recipe: new enemy

1. `src/game/enemies.ts` → `ENEMIES` registry (~line 11) — copy an existing entry's stat shape.
2. Wire spawning: `DUNGEON_ENCOUNTER_TABLE` (~line 226), `TOUGH_ENEMIES` elites (~line 244), or road/region encounter logic in `maybeEncounter` (~line 266) / `worldmap.ts`.
3. `sprites.ts` → `ENEMY_SPRITES` (~line 334). Enemy box is 20×24, faces **left** by default. Two shared chassis helpers: `humanoid(s, {skin, hair, tunic, hood?})` (hero-shaped; weapon-in-hand via `s.handX/handY`) and `beast(s, {body, belly, bodyH})` (four-legged; returns body-top y for placing ears/muzzle/tail/eye). Recolors of these cover most needs — see `dire_wolf`/`brigand_captain` for the elite-recolor pattern; only fully custom bodies (`crypt_spider`, `hill_troll`) draw from scratch.

## Recipe: new consumable item

`equipment.ts` → `ITEMS` (~line 207): `{ id, name, desc, effect: "heal" | "flee", combatOnly, heal?, price }`. New effect kinds require extending `ItemEffect` and handling it in `combat.ts` / `actions.ts`. Consumables have **no sprite** — no sprite work needed. All shops stock all items.

## Recipe: new spell

`src/game/spells.ts` → `SPELLS` (~line 22). Starting spells: `STARTING_SPELLS`. Cast handling lives in `combat.ts`; mana derives from SMT (`maxManaFor` in equipment.ts).

## Recipe: new NPC quest

Two registries: `src/game/npcs.ts` (`NPCS` — who, where, greeting, ordered quest chain) and `src/game/quests.ts` (`QUESTS` — offer/completion dialogue, objective, reward, requirements).

- Objectives: `{ kind: "kill", enemyId, count }` | `{ kind: "visitKind", settlementKind }` | `{ kind: "clearRuin" }` | `{ kind: "talk" }` (ready on accept). Progress hooks are already wired (engine.finishCombat, engine.travelTo, dungeon.claimSiteReward) — a new quest of an existing objective kind needs **zero engine changes**. A new objective kind needs a hook + a `questNeeded` case.
- Rewards: `{ gold?, xp?, weaponId?, armorId?, spellId?, items?, attributes?, reputation? }` — all applied by `turnInQuest`, no extra code.
- Quest-only gear: add the weapon/armor to `equipment.ts` + its sprite, and list the id in `QUEST_GEAR` (keeps it out of shops and ruins). Quest-only spells go in `QUEST_SPELLS` in spells.ts.
- Requirements: `{ generation?, anyAttr?, reputation? }` — chain order within an NPC is enforced automatically.
- NPC placement rule (one per NPC, **exclusive** — an NPC is in exactly one settlement on any day): `settlementId` ("hamlet" = start) pins to one place; `kind` ("town"/"city") pins to the FIRST settlement of that tier; `roams` (a structure kind) makes a wanderer who visits one qualifying settlement per day in rotation. Optional `minQuestsDone`. `npcSettlementId`/`npcWhereabouts` resolve today's location.
- New NPC also needs UI dots in `src/ui/ActionHotspots.tsx`: `HOTSPOTS`, `CUES`, `ICONS` entries keyed `"npc:<id>"`.
- Add registry-integrity assertions? `test/quests.test.ts` already validates all givers/rewards/enemy ids generically — new entries are covered for free.

## Recipe: NPC dialogue portrait

Every NPC in `npcs.ts` needs an entry in `NPC_PORTRAITS` in `src/scene/npcSprites.ts` (test-enforced, including a distinctness check). It's a palette + flags on a shared animated 48×56 chassis — no drawing code needed for a standard look; add a `prop` callback for a signature item. Stances (`idle`/`talk`/`point`) come free; the dialogue panel (`src/ui/NpcPanel.tsx` `beatStance`) maps conversation beats to stances. **Delegate this to the `portrait-artist` agent** — its definition carries the full chassis contract.

## Gotchas

- Saves reference gear/enemies by id — never rename or delete an id without a migration in `src/game/save.ts`.
- `test/sprites.test.ts` fails if any `WEAPONS`/`ARMORS`/`ENEMIES` id lacks a sprite entry.
- The registry key and the `id` field must be identical strings.
