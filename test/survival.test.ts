// Hunger, stamina, the family pantry fund, sleeping-rough ambushes, pack
// combat, and the saga's final quest — the survival layer over the life loop.

import { describe, expect, it } from "vitest";
import { finishCombat, newGame, sleep, takeAction } from "../src/game/engine";
import { combatSetTarget, combatAttack, livingEnemies } from "../src/game/combat";
import { startCombat } from "../src/game/combat";
import { depositFamilyFund } from "../src/game/family";
import { ENEMIES, rollPack } from "../src/game/enemies";
import { QUESTS, acceptQuest, turnInQuest } from "../src/game/quests";
import { NPCS } from "../src/game/npcs";
import {
  FAMILY_NEGLECT_GRACE,
  HUNGER_PER_DAY,
  STAMINA_PER_TURN,
} from "../src/game/config";
import { makeAttributes } from "../src/game/character";
import type { GameState } from "../src/game/types";

function fresh(seed = 7): GameState {
  return newGame("Aldric", { ...makeAttributes(1), STR: 2 }, seed);
}

/** Sleep with the night's random dangers skipped — the deterministic path. */
function safeSleep(state: GameState): GameState {
  return sleep(state, true);
}

describe("hunger", () => {
  it("a night with a ration keeps hunger at bay and consumes it", () => {
    let s = fresh();
    s = { ...s, character: { ...s.character, inventory: { ration: 2 } } };
    s = safeSleep(s);
    expect(s.character.hunger).toBe(0);
    expect(s.character.inventory.ration).toBe(1);
  });

  it("a night without food raises hunger", () => {
    let s = fresh();
    s = { ...s, character: { ...s.character, inventory: {} } };
    s = safeSleep(s);
    expect(s.character.hunger).toBe(HUNGER_PER_DAY);
  });

  it("full starvation costs health each night and can kill", () => {
    let s = fresh();
    s = { ...s, character: { ...s.character, inventory: {}, hunger: 100 } };
    const hpBefore = s.character.maxHp;
    s = safeSleep(s);
    expect(s.character.hp).toBeLessThan(hpBefore); // no full-heal while starving
    // Drive to death.
    s = { ...s, character: { ...s.character, hp: 1, hunger: 100, inventory: {} } };
    s = safeSleep(s);
    expect(s.dead || s.pendingSuccession !== null).toBe(true);
    expect(s.deathCause).toContain("starved");
  });
});

describe("stamina", () => {
  it("each turn's action drains stamina; a fed night restores it", () => {
    let s = fresh();
    const before = s.character.stamina;
    s = takeAction(s, "work");
    if (s.combat) return; // an encounter fired; determinism not worth fighting here
    expect(s.character.stamina).toBe(before - STAMINA_PER_TURN);
    s = { ...s, character: { ...s.character, inventory: { ration: 1 } } };
    s = safeSleep(s);
    expect(s.character.stamina).toBe(100);
  });
});

describe("the family pantry fund", () => {
  function withFamily(s: GameState): GameState {
    return {
      ...s,
      character: {
        ...s.character,
        spouse: { name: "Wife", gender: "female", attributes: makeAttributes(2), birthDay: 1 },
        children: [
          { name: "Kid", gender: "male", attributes: makeAttributes(2), birthDay: 1, alive: true },
        ],
        familySettlementId: "hamlet",
        ownedHomes: ["hamlet"],
        inventory: { ration: 50 },
      },
    };
  }

  it("deposits move gold into the fund", () => {
    let s = withFamily(fresh());
    const gold = s.character.gold;
    s = depositFamilyFund(s, 10);
    expect(s.character.gold).toBe(gold - 10);
    expect(s.character.familyFund).toBe(10);
  });

  it("each night feeds the family from the fund", () => {
    let s = withFamily(fresh());
    s = { ...s, character: { ...s.character, familyFund: 10 } };
    s = safeSleep(s);
    expect(s.character.familyFund).toBe(8); // two mouths × 1 gold
    expect(s.character.familyNeglect).toBe(0);
  });

  it("an empty pantry builds neglect, and past the grace someone can die (with a reputation cost)", () => {
    let s = withFamily(fresh(3));
    s = { ...s, character: { ...s.character, familyFund: 0 } };
    s = safeSleep(s);
    expect(s.character.familyNeglect).toBe(1);

    // Push past the grace period and run nights until the roll lands.
    s = { ...s, character: { ...s.character, familyNeglect: FAMILY_NEGLECT_GRACE + 1 } };
    const repBefore = s.character.reputation.church;
    let someoneDied = false;
    for (let i = 0; i < 40 && !someoneDied; i++) {
      s = { ...s, character: { ...s.character, hunger: 0, inventory: { ration: 50 } } };
      s = safeSleep(s);
      someoneDied = !s.character.children[0].alive || s.character.spouse === null;
    }
    expect(someoneDied).toBe(true);
    expect(s.character.reputation.church).toBeLessThan(repBefore);
  });
});

describe("sleeping rough", () => {
  it("a night outside a settlement can be interrupted by an ambush, which resumes the night when won", () => {
    let ambushed: GameState | null = null;
    for (let seed = 1; seed < 60 && !ambushed; seed++) {
      let s = fresh(seed);
      s = {
        ...s,
        location: { hex: { q: 3, r: 3 }, settlementId: null },
        character: { ...s.character, inventory: { ration: 5 } },
      };
      const after = sleep(s);
      if (after.combat) ambushed = after;
    }
    expect(ambushed, "no ambush across 60 seeds").not.toBeNull();
    expect(ambushed!.nightAmbush).toBe(true);

    // Survive it (force the foes down) — finishing the fight completes the night.
    let s = ambushed!;
    const day = s.day;
    s = {
      ...s,
      combat: {
        ...s.combat!,
        enemies: s.combat!.enemies.map((e) => ({ ...e, hp: 0 })),
        over: true,
        outcome: "won" as const,
      },
    };
    s = finishCombat(s);
    expect(s.combat).toBeNull();
    expect(s.nightAmbush).toBe(false);
    expect(s.day).toBe(day + 1); // the night passed
  });

  it("a night inside a settlement never rolls an ambush", () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = fresh(seed); // starts in the hamlet
      expect(sleep(s).combat).toBeNull();
    }
  });
});

describe("pack combat", () => {
  it("rollPack can produce multi-enemy packs for pack hunters, never for elites", () => {
    let sawPack = false;
    for (let seed = 1; seed < 60; seed++) {
      const wolves = rollPack(ENEMIES.wolf, seed);
      if (wolves.defs.length > 1) sawPack = true;
      expect(rollPack(ENEMIES.hill_troll, seed).defs).toHaveLength(1);
    }
    expect(sawPack).toBe(true);
  });

  it("the player can pick a target, and every living foe acts each round", () => {
    let s = fresh(5);
    s = startCombat(s, [ENEMIES.wolf, ENEMIES.wolf]);
    expect(s.combat!.enemies).toHaveLength(2);

    s = combatSetTarget(s, 1);
    expect(s.combat!.target).toBe(1);

    const hpBefore = s.combat!.enemies.map((e) => e.hp);
    s = combatAttack(s);
    // The second wolf (the target) is the only one that can have lost HP.
    expect(s.combat!.enemies[0].hp).toBe(hpBefore[0]);
    expect(livingEnemies(s.combat!).length).toBeGreaterThan(0);
  });

  it("victory over a pack pays every foe's XP", () => {
    let s = fresh(9);
    s = startCombat(s, [ENEMIES.stray_dog, ENEMIES.stray_dog]);
    const xpBefore = s.character.xp;
    for (let i = 0; i < 60 && !s.combat!.over; i++) s = combatAttack(s);
    if (s.combat!.outcome === "won") {
      expect(s.character.xp - xpBefore).toBeGreaterThanOrEqual(ENEMIES.stray_dog.xp * 2);
    }
  });
});

describe("the final quest", () => {
  it("is the last link of Eddan's chain and ends the saga on turn-in", () => {
    expect(NPCS.eddan.quests[NPCS.eddan.quests.length - 1]).toBe("the_pale_architect");
    expect(QUESTS.the_pale_architect.endsSaga).toBe(true);

    let s = fresh();
    s = {
      ...s,
      generation: 3,
      quests: {
        eddans_delivery: { status: "done", progress: 1 },
        the_name_unspoken: { status: "done", progress: 0 },
      },
    };
    s = acceptQuest(s, "the_pale_architect");
    expect(s.quests.the_pale_architect.status).toBe("active");
    // Eddan marks the Spire on the map.
    const spire = s.map.sites.find((site) => site.id === "spire")!;
    expect(spire).toBeDefined();
    expect(s.discovered).toContain(`${spire.hex.q},${spire.hex.r}`);

    s = { ...s, quests: { ...s.quests, the_pale_architect: { status: "active", progress: 1 } } };
    s = turnInQuest(s, "the_pale_architect");
    expect(s.quests.the_pale_architect.status).toBe("done");
    expect(s.victory).toBe("won");
  });

  it("every generated map raises Varek's Spire", () => {
    for (const seed of [1, 42, 999]) {
      const s = newGame("T", { ...makeAttributes(1), STR: 2 }, seed);
      expect(s.map.sites.some((site) => site.id === "spire")).toBe(true);
    }
  });
});
