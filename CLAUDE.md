# Medievaler — architecture map

Vite + React + TypeScript life-sim/RPG. Pure game logic in `src/game/` (plain data registries + reducer-style functions), canvas rendering in `src/scene/`, React panels in `src/ui/`. Tests: `npx vitest run` (files in `test/`).

## Where things live (don't re-explore — trust this map)

| Concern | File |
|---|---|
| Weapon/armor/consumable data | `src/game/equipment.ts` (`WEAPONS`, `ARMORS`, `ITEMS`, `MAGIC_WEAPONS`) |
| All sprites: hero paper-doll, weapon/armor layers, enemies | `src/scene/sprites.ts` (`WEAPON_SPRITES`, `ARMOR_SPRITES`, `ENEMY_SPRITES`) |
| Animated NPC dialogue portraits (48×56, stances idle/talk/point) | `src/scene/npcSprites.ts` (`NPC_PORTRAITS`) + `src/ui/NpcSprite.tsx` |
| Enemy stats + encounter tables | `src/game/enemies.ts` (`ENEMIES`, `DUNGEON_ENCOUNTER_TABLE`, `TOUGH_ENEMIES`) |
| Spells | `src/game/spells.ts` (`SPELLS`; `QUEST_SPELLS` excluded from ruin tomes) |
| NPC quest-givers (Ashveil saga) | `src/game/npcs.ts` (`NPCS`, `npcsAt`) |
| Quests: defs, accept/turn-in, progress hooks | `src/game/quests.ts` (`QUESTS`; hooks called from `engine.ts`/`dungeon.ts`) |
| Shop stock per settlement tier | `src/game/shop.ts` (`STOCK_TIERS` price ceilings: hamlet 60, town 160, city ∞) |
| Core types (`Weapon`, `Armor`, `Character`…) | `src/game/types.ts` |
| Global tuning constants | `src/game/config.ts` |
| Town canvas scene (buildings, NPCs) | `src/scene/townScene.ts` |
| World map / regions / travel | `src/game/worldmap.ts`, `src/game/travel.ts` |
| Combat engine | `src/game/combat.ts` |

## Adding content (weapons, armor, enemies, items)

**Read `.claude/docs/content-recipes.md` first** — it has step-by-step recipes and the full sprite-painter API. You should NOT need to read `equipment.ts` or `sprites.ts` beyond the exact insertion points; the recipes include representative examples.

Key invariant: every id in `WEAPONS`/`ARMORS`/`ENEMIES` **must** have a matching entry in the sprite registries in `src/scene/sprites.ts` — `test/sprites.test.ts` fails the build otherwise. Weapon placement on the character is automatic: weapon layers draw relative to `s.handX`/`s.handY` (the leading hand), so no per-weapon anchor tuning is needed.

Shops auto-stock new gear (no shop edits needed) unless the id is listed in `MAGIC_WEAPONS` (ruin loot only) or `QUEST_GEAR` (quest rewards only). Saves store gear by id, so renaming/removing ids breaks old saves — check `src/game/save.ts` migrations if you do. Any new `GameState` field needs a migration there plus a `SAVE_VERSION` bump in config.ts.

The narrative source of truth is `C:\Users\micha\Downloads\Hearthbound_NarrativeBible.docx` (the Ashveil saga: Varek the Lich, generational quests). NPCs/quests implement a scaled-down slice of it; keep new story content consistent with it.

## Agents (use these to keep the main context small)

- `content-scout` — cheap read-only locator; ask it "where is X / how does Y work" instead of grepping/reading files yourself when the map above doesn't already answer it.
- `content-smith` — adds a new weapon/armor/enemy/item end-to-end (data entry + sprite + test run) from a short spec. Delegate the whole task; review its diff.
- `portrait-artist` — creates/edits the animated NPC dialogue portraits (`npcSprites.ts` chassis: palette, flags, props, stances). Delegate any NPC-appearance task here.
