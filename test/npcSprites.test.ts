// Every named NPC must have a dialogue portrait: the conversation panel draws
// by npc id, so a missing entry would render an empty canvas. Same contract as
// the gear/enemy sprite registries in sprites.test.ts.

import { describe, expect, it } from "vitest";
import { NPCS } from "../src/game/npcs";
import { NPC_PORTRAITS } from "../src/scene/npcSprites";

describe("npc portrait registry", () => {
  it("has a portrait for every named NPC", () => {
    for (const id of Object.keys(NPCS)) {
      expect(NPC_PORTRAITS[id], `missing NPC portrait: ${id}`).toBeDefined();
    }
  });

  it("has no orphan portraits for NPCs that don't exist", () => {
    for (const id of Object.keys(NPC_PORTRAITS)) {
      expect(NPCS[id], `portrait without an NPC: ${id}`).toBeDefined();
    }
  });

  it("gives every NPC a distinct look (no two share an outfit and headgear)", () => {
    const seen = new Set<string>();
    for (const [id, p] of Object.entries(NPC_PORTRAITS)) {
      const signature = `${p.outfit}/${p.headgear}/${p.hairstyle}/${p.beard}`;
      expect(seen.has(signature), `duplicate look: ${id}`).toBe(false);
      seen.add(signature);
    }
  });
});
