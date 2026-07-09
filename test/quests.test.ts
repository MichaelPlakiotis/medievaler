// The Ashveil questline: registry integrity (every giver, reward, and target
// must exist), the accept → progress → turn-in flow, requirement gating, and
// the generation clock that opens later chapters to heirs.

import { describe, expect, it } from "vitest";
import { newGame } from "../src/game/engine";
import { NPCS, npcSettlementId, npcsAt } from "../src/game/npcs";
import {
  QUESTS,
  acceptQuest,
  npcQuestView,
  questNeeded,
  recordQuestArrival,
  recordQuestKill,
  recordQuestRuinCleared,
  turnInQuest,
} from "../src/game/quests";
import { ARMORS, ITEMS, QUEST_GEAR, WEAPONS } from "../src/game/equipment";
import { SPELLS } from "../src/game/spells";
import { ENEMIES } from "../src/game/enemies";
import { shopStockFor } from "../src/game/shop";
import { makeAttributes } from "../src/game/character";
import type { GameState } from "../src/game/types";

function freshGame(attrs = { STR: 3, AGI: 3, SMT: 3, CHA: 3 }): GameState {
  return newGame("Aldric", { ...makeAttributes(0), ...attrs }, 42);
}

describe("quest registry integrity", () => {
  it("every quest's giver exists and lists the quest in their chain", () => {
    for (const q of Object.values(QUESTS)) {
      const npc = NPCS[q.giver];
      expect(npc, `missing giver: ${q.giver} (${q.id})`).toBeDefined();
      expect(npc.quests, `${q.giver} doesn't list ${q.id}`).toContain(q.id);
    }
  });

  it("every NPC chain entry is a real quest", () => {
    for (const npc of Object.values(NPCS)) {
      for (const qid of npc.quests) {
        expect(QUESTS[qid], `unknown quest in ${npc.id}'s chain: ${qid}`).toBeDefined();
      }
    }
  });

  it("every reward id resolves to real content", () => {
    for (const q of Object.values(QUESTS)) {
      const r = q.reward;
      if (r.weaponId) expect(WEAPONS[r.weaponId], `${q.id} weapon`).toBeDefined();
      if (r.armorId) expect(ARMORS[r.armorId], `${q.id} armor`).toBeDefined();
      if (r.spellId) expect(SPELLS[r.spellId], `${q.id} spell`).toBeDefined();
      if (r.items)
        for (const id of Object.keys(r.items)) expect(ITEMS[id], `${q.id} item ${id}`).toBeDefined();
    }
  });

  it("every kill objective targets a real enemy", () => {
    for (const q of Object.values(QUESTS)) {
      if (q.objective.kind === "kill") {
        expect(ENEMIES[q.objective.enemyId], `${q.id} enemy`).toBeDefined();
      }
    }
  });

  it("quest gear exists and never appears in any shop's stock", () => {
    for (const id of QUEST_GEAR) {
      expect(WEAPONS[id] ?? ARMORS[id], `unknown quest gear: ${id}`).toBeDefined();
    }
    const state = freshGame();
    for (const s of state.map.settlements) {
      const ids = shopStockFor(s).map((ref) => ref.id);
      for (const id of QUEST_GEAR) expect(ids, `${s.id} stocks ${id}`).not.toContain(id);
    }
  });
});

describe("npc availability", () => {
  it("Mira and Gael hold the starting hamlet; Rook waits for a reputation", () => {
    const state = freshGame();
    const ids = npcsAt(state).map((n) => n.id);
    expect(ids).toContain("mira");
    expect(ids).toContain("gael");
    expect(ids).not.toContain("valdis"); // towns only
    expect(ids).not.toContain("rook"); // needs 2 quests done first
  });

  it("no NPCs at night or out on the road", () => {
    const state = freshGame();
    expect(npcsAt({ ...state, phase: "night" })).toHaveLength(0);
    expect(
      npcsAt({ ...state, location: { hex: { q: 1, r: 1 }, settlementId: null } }),
    ).toHaveLength(0);
  });

  it("every NPC is in exactly one settlement on any given day", () => {
    const state = freshGame();
    for (const day of [1, 2, 3, 10]) {
      const dayState = { ...state, day };
      for (const npc of Object.values(NPCS)) {
        const home = npcSettlementId(dayState, npc);
        const found = state.map.settlements.filter(
          (s) =>
            npcSettlementId(
              { ...dayState, location: { hex: s.hex, settlementId: s.id } },
              npc,
            ) === s.id,
        );
        // At most one settlement matches, and it's the declared home.
        expect(found.length, `${npc.id} day ${day}`).toBeLessThanOrEqual(1);
        if (found.length === 1) expect(found[0].id).toBe(home);
      }
    }
  });

  it("Valdis holds the first town; Lady Voss the first city — and no other", () => {
    const state = freshGame();
    const firstTown = state.map.settlements.find((s) => s.kind === "town")!;
    const otherTown = state.map.settlements.filter((s) => s.kind === "town")[1];
    expect(npcSettlementId(state, NPCS.valdis)).toBe(firstTown.id);
    const atOther = npcsAt({
      ...state,
      location: { hex: otherTown.hex, settlementId: otherTown.id },
    });
    expect(atOther.map((n) => n.id)).not.toContain("valdis");
    expect(npcSettlementId(state, NPCS.voss)).toBe(
      state.map.settlements.find((s) => s.kind === "city")!.id,
    );
  });

  it("wanderers move on: Eddan's stop changes with the day", () => {
    const state = freshGame();
    const stops = new Set<string | null>();
    for (let day = 1; day <= 8; day++) stops.add(npcSettlementId({ ...state, day }, NPCS.eddan));
    // With more than one church in the world he must visit more than one stop.
    const churches = state.map.settlements.filter((s) => s.structures.includes("church"));
    if (churches.length > 1) expect(stops.size).toBeGreaterThan(1);
    for (const stop of stops) {
      expect(churches.map((c) => c.id)).toContain(stop);
    }
  });
});

describe("the quest flow", () => {
  it("accept → kill → ready → turn in, with rewards applied", () => {
    let state = freshGame();
    const view = npcQuestView(state, "gael");
    expect(view.kind).toBe("offer");

    state = acceptQuest(state, "wolf_at_the_gate");
    expect(state.quests.wolf_at_the_gate.status).toBe("active");

    // Killing the wrong thing doesn't count; the right thing does.
    state = recordQuestKill(state, "boar");
    expect(state.quests.wolf_at_the_gate.progress).toBe(0);
    state = recordQuestKill(state, "wolf");
    expect(state.quests.wolf_at_the_gate.progress).toBe(1);

    const goldBefore = state.character.gold;
    state = turnInQuest(state, "wolf_at_the_gate");
    expect(state.quests.wolf_at_the_gate.status).toBe("done");
    expect(state.character.gold).toBe(goldBefore + 20);
    expect(state.character.reputation.guard).toBeGreaterThan(0);
  });

  it("cannot turn in an unfinished quest, or accept one twice", () => {
    let state = freshGame();
    state = acceptQuest(state, "wolf_at_the_gate");
    const unchanged = turnInQuest(state, "wolf_at_the_gate");
    expect(unchanged.quests.wolf_at_the_gate.status).toBe("active");
    expect(acceptQuest(state, "wolf_at_the_gate")).toBe(state);
  });

  it("gear and spell rewards land in the character's kit", () => {
    let state = freshGame();
    state = acceptQuest(state, "proof_of_blade");
    for (let i = 0; i < 3; i++) state = recordQuestKill(state, "wolf");
    state = turnInQuest(state, "proof_of_blade");
    expect(state.character.ownedWeapons).toContain("wardens_shortblade");
  });

  it("visit objectives complete on arrival at the right settlement tier", () => {
    let state = freshGame();
    state = acceptQuest(state, "unpaid_tab");
    expect(state.quests.unpaid_tab.progress).toBe(0); // the hamlet doesn't count

    const town = state.map.settlements.find((s) => s.kind === "town")!;
    state = recordQuestArrival({
      ...state,
      location: { hex: town.hex, settlementId: town.id },
    });
    expect(state.quests.unpaid_tab.progress).toBe(1);
    state = turnInQuest(state, "unpaid_tab");
    expect(state.quests.unpaid_tab.status).toBe("done");
    expect(state.character.inventory.ration).toBeGreaterThanOrEqual(2);
  });

  it("ruin-clear objectives credit on the clearRuin hook", () => {
    let state = freshGame();
    // Rook only offers once two quests are done — fake the books.
    state = {
      ...state,
      quests: {
        unpaid_tab: { status: "done", progress: 1 },
        wolf_at_the_gate: { status: "done", progress: 1 },
      },
    };
    state = acceptQuest(state, "unusual_commission");
    state = recordQuestRuinCleared(state);
    state = turnInQuest(state, "unusual_commission");
    expect(state.character.ownedWeapons).toContain("pale_brand");
  });

  it("talk quests are ready the moment they're accepted", () => {
    let state = freshGame({ STR: 1, AGI: 4, SMT: 1, CHA: 1 });
    state = acceptQuest(state, "couriers_copy");
    expect(questNeeded(QUESTS.couriers_copy)).toBe(0);
    const goldBefore = state.character.gold;
    state = turnInQuest(state, "couriers_copy");
    expect(state.character.gold).toBe(goldBefore + 40);
  });

  it("attribute rewards raise the stat and its derived pools", () => {
    let state = freshGame();
    // Voss's chain is ordered: the ledger only opens once the courier job is done.
    state = { ...state, quests: { couriers_copy: { status: "done", progress: 0 } } };
    state = acceptQuest(state, "names_in_the_ledger");
    state = recordQuestKill(state, "tomb_bandit");
    state = recordQuestKill(state, "tomb_bandit");
    const chaBefore = state.character.attributes.CHA;
    state = turnInQuest(state, "names_in_the_ledger");
    expect(state.character.attributes.CHA).toBe(chaBefore + 2);
  });
});

describe("gating", () => {
  it("attribute-gated quests lock until a floor is met", () => {
    const weak = freshGame({ STR: 1, AGI: 1, SMT: 1, CHA: 1 });
    const view = npcQuestView(weak, "valdis");
    expect(view.kind).toBe("locked");
    expect(acceptQuest(weak, "proof_of_blade")).toBe(weak); // locked = refused

    const strong = freshGame({ STR: 3, AGI: 1, SMT: 1, CHA: 1 });
    expect(npcQuestView(strong, "valdis").kind).toBe("offer");
  });

  it("generation-gated quests only open to heirs", () => {
    let state = freshGame();
    state = { ...state, quests: { unpaid_tab: { status: "done", progress: 1 } } };
    expect(npcQuestView(state, "mira").kind).toBe("locked");
    expect(npcQuestView({ ...state, generation: 2 }, "mira").kind).toBe("offer");
  });

  it("a new game starts at generation 1 with clean books", () => {
    const state = freshGame();
    expect(state.generation).toBe(1);
    expect(state.quests).toEqual({});
    expect(state.npcOpen).toBeNull();
  });
});
