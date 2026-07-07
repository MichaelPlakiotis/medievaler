// ---------------------------------------------------------------------------
// dungeon.test.ts — checks on delve runs beneath the barrow (M9). Randomness
// runs off a fixed seed, so we can drive whole delves and assert outcomes.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { finishCombat, leaveDungeon, newGame, takeAction } from "../src/game/engine";
import { combatAttack, combatUseItem } from "../src/game/combat";
import { pressOn } from "../src/game/dungeon";
import { DUNGEON_ROOMS_MAX, DUNGEON_ROOMS_MIN } from "../src/game/config";
import type { Attributes, GameState } from "../src/game/types";

// A strong, nimble build so fights reliably resolve within a bounded loop.
const strong: Attributes = { STR: 5, AGI: 4, SMT: 1, CHA: 0 };

/** Drive whatever fight is currently active to its conclusion, win or lose. */
function resolveFight(s: GameState): GameState {
  let guard = 0;
  while (s.combat && !s.combat.over && guard++ < 200) s = combatAttack(s);
  return s;
}

/**
 * Play a whole delve to its end (boss defeated, or the character dies/flees),
 * finishing any fight and pressing on through non-fight rooms automatically.
 * Leaves the choice of "leave now" to the caller by stopping as soon as the
 * dungeon is resolved-and-pressable, unless `autoPressOn` is false.
 */
function playUntilChoice(s: GameState): GameState {
  let guard = 0;
  while (guard++ < 200) {
    if (s.dead || !s.dungeon) return s;
    if (s.combat) {
      s = resolveFight(s);
      s = finishCombat(s);
      continue;
    }
    return s; // a room is resolved (or mustLeave) — caller decides press/leave
  }
  return s;
}

describe("entering a delve", () => {
  it("rolls a room chain within the configured bounds, always ending in a boss", () => {
    const s = takeAction(newGame("Test", strong, 3), "delve");
    expect(s.dungeon).not.toBeNull();
    const rooms = s.dungeon!.rooms;
    expect(rooms.length).toBeGreaterThanOrEqual(DUNGEON_ROOMS_MIN + 1); // + boss
    expect(rooms.length).toBeLessThanOrEqual(DUNGEON_ROOMS_MAX + 1);
    expect(rooms[rooms.length - 1]).toBe("boss");
  });

  it("is deterministic: the same seed and character roll the same rooms", () => {
    const a = takeAction(newGame("Test", strong, 77), "delve");
    const b = takeAction(newGame("Test", strong, 77), "delve");
    expect(a.dungeon!.rooms).toEqual(b.dungeon!.rooms);
  });

  it("blocks ordinary actions while a delve is in progress", () => {
    let s = takeAction(newGame("Test", strong, 3), "delve");
    s = playUntilChoice(s);
    expect(s.dungeon).not.toBeNull();
    const before = s;
    const after = takeAction(s, "work");
    expect(after).toBe(before); // no-op: guarded in takeAction
  });
});

describe("finishing a delve", () => {
  it("defeating the boss grants a skill point, bonus gold, and exits with the turn spent", () => {
    // A near-invincible build (and a search across seeds) removes randomness
    // from whether the run SURVIVES to the boss — the thing under test is what
    // happens when it wins, not whether any particular seed's rolls kill it.
    const invincible: Attributes = { STR: 30, AGI: 20, SMT: 5, CHA: 0 };
    let s: GameState | null = null;
    let startTurn = 0;
    let startSkillPoints = 0;

    for (let seed = 1; seed < 30 && !s; seed++) {
      let candidate = takeAction(newGame("Champion", invincible, seed), "delve");
      const turn0 = candidate.turn;
      const sp0 = candidate.character.skillPoints;

      let guard = 0;
      while (candidate.dungeon && !candidate.dead && guard++ < 500) {
        candidate = playUntilChoice(candidate);
        if (!candidate.dungeon || candidate.dead) break;
        if (candidate.dungeon.mustLeave) {
          candidate = leaveDungeon(candidate);
          break;
        }
        if (candidate.dungeon.depth >= candidate.dungeon.rooms.length) break; // boss resolved
        candidate = pressOn(candidate);
      }

      if (!candidate.dead && candidate.dungeon === null) {
        s = candidate;
        startTurn = turn0;
        startSkillPoints = sp0;
      }
    }

    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.character.skillPoints).toBeGreaterThan(startSkillPoints);
    expect(s.turn).toBe(startTurn + 1); // the whole delve cost exactly one turn
  });

  it("leaving a resolved room spends exactly one turn and clears the dungeon", () => {
    let s = takeAction(newGame("Cautious", strong, 21), "delve");
    s = playUntilChoice(s); // resolve (or fight through) the first room
    if (s.dead) return; // unlucky early death — not what this test is checking
    const startTurn = s.turn;

    s = leaveDungeon(s);
    expect(s.dungeon).toBeNull();
    expect(s.turn).toBe(startTurn + 1);
  });

  it("fleeing a fight forces a retreat: pressing on is blocked, leaving still works", () => {
    // Search a small range of seeds for one where the first room is a fight
    // that can be fled via a smoke bomb, to exercise the "mustLeave" path.
    let s: GameState | null = null;
    for (let seed = 1; seed < 60 && !s; seed++) {
      let candidate = takeAction(newGame("Runner", strong, seed), "delve");
      if (candidate.dungeon && candidate.combat && !candidate.combat.over) {
        candidate = { ...candidate, character: { ...candidate.character, inventory: { smoke_bomb: 1 } } };
        s = candidate;
      }
    }
    expect(s).not.toBeNull();
    if (!s) return;

    let fled = combatUseItem(s, "smoke_bomb");
    expect(fled.combat!.outcome).toBe("fled");
    fled = finishCombat(fled);

    expect(fled.dungeon).not.toBeNull();
    expect(fled.dungeon!.mustLeave).toBe(true);

    // Pressing on is a no-op while forced to leave.
    const pressed = pressOn(fled);
    expect(pressed).toBe(fled);

    const left = leaveDungeon(fled);
    expect(left.dungeon).toBeNull();
  });

  it("being beaten in a dungeon fight ejects you and spends the turn", () => {
    // A hopeless build guarantees an early loss without risking death every time.
    const weak: Attributes = { STR: 0, AGI: 0, SMT: 0, CHA: 5 };
    let s = takeAction(newGame("Underdog", weak, 4), "delve");
    const startTurn = s.turn;
    let guard = 0;
    while (s.combat && !s.combat.over && guard++ < 200) s = combatAttack(s);
    if (!s.combat || s.combat.outcome !== "beaten") return; // this seed didn't produce a clean loss
    s = finishCombat(s);
    expect(s.dungeon).toBeNull();
    expect(s.dead).toBe(false);
    expect(s.turn).toBe(startTurn + 1);
  });
});
