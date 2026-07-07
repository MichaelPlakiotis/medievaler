// Every piece of gear and every foe must have a sprite: the paper-doll and the
// combat stage draw by id, so a missing registry entry would render nothing.
// This test makes "add gear/enemy without a sprite" a build failure.

import { describe, expect, it } from "vitest";
import { ARMORS, WEAPONS } from "../src/game/equipment";
import { ENEMIES } from "../src/game/enemies";
import { ARMOR_SPRITES, ENEMY_SPRITES, WEAPON_SPRITES, heroLookOf } from "../src/scene/sprites";
import { createCharacter, makeAttributes } from "../src/game/character";

describe("sprite registries", () => {
  it("has a sprite layer for every weapon", () => {
    for (const id of Object.keys(WEAPONS)) {
      expect(WEAPON_SPRITES[id], `missing weapon sprite: ${id}`).toBeTypeOf("function");
    }
  });

  it("has a sprite layer for every armor, plus the unarmored fallback", () => {
    expect(ARMOR_SPRITES.none).toBeTypeOf("function");
    for (const id of Object.keys(ARMORS)) {
      expect(ARMOR_SPRITES[id], `missing armor sprite: ${id}`).toBeTypeOf("function");
    }
  });

  it("has a sprite for every enemy", () => {
    for (const id of Object.keys(ENEMIES)) {
      expect(ENEMY_SPRITES[id], `missing enemy sprite: ${id}`).toBeTypeOf("function");
    }
  });
});

describe("heroLookOf", () => {
  it("reflects the equipped gear and is stable for the same name", () => {
    const c = createCharacter("Aldric", { ...makeAttributes(1), STR: 6 });
    const look = heroLookOf(c);
    expect(look.weaponId).toBe(c.weapon.id);
    expect(look.armorId).toBeNull();
    expect(look.gender).toBe("male");
    expect(heroLookOf(c).seed).toBe(look.seed);
  });
});
