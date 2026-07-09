// ---------------------------------------------------------------------------
// quests.ts — the Ashveil questline (Narrative Bible §5), scaled to the game's
// current mechanics. Quest-givers are the NPCs in npcs.ts; rewards are gold,
// XP, quest-only gear (equipment.ts QUEST_GEAR), spells, consumables, and the
// odd permanent attribute (the bible's rings and sigils, abstracted).
//
// Objectives map onto things the game already tracks:
//   kill      — win fights against a given enemy id (hook: engine.finishCombat)
//   visitKind — arrive at a settlement of a given tier (hook: engine.travelTo)
//   clearRuin — first-clear any world ruin (hook: dungeon.claimSiteReward)
//   talk      — resolved in the conversation itself (accept, then conclude)
//
// Everything here is pure: helpers take a GameState and return a new one.
// Quest progress lives in state.quests and survives succession — the saga is
// written for a bloodline, not a hero, so heirs pick up where parents fell.
// ---------------------------------------------------------------------------

import { grantXp, maxHpFor } from "./character";
import { ARMORS, ITEMS, WEAPONS, maxManaFor } from "./equipment";
import { SPELLS } from "./spells";
import { applyReputation } from "./reputation";
import { pushLog } from "./log";
import { settlementOf } from "./worldmap";
import { NPCS } from "./npcs";
import type { Attributes, Faction, GameState, Settlement } from "./types";

// --- Shapes ------------------------------------------------------------------

export type QuestObjective =
  | { kind: "kill"; enemyId: string; count: number }
  | { kind: "visitKind"; settlementKind: Settlement["kind"] }
  | { kind: "clearRuin" }
  | { kind: "talk" };

export interface QuestReward {
  gold?: number;
  xp?: number;
  weaponId?: string;
  armorId?: string;
  spellId?: string;
  /** Consumables, id → count. */
  items?: Record<string, number>;
  /** Permanent attribute gains (the bible's signets and sigils, abstracted). */
  attributes?: Partial<Attributes>;
  reputation?: Partial<Record<Faction, number>>;
}

export interface QuestRequires {
  /** Only offered to this generation of the line, or later. */
  generation?: number;
  /** Meeting ANY one of these attribute floors suffices ("STR 3 or AGI 3"). */
  anyAttr?: Partial<Attributes>;
  /** Faction standing floors — all must hold. */
  reputation?: Partial<Record<Faction, number>>;
}

export interface QuestDef {
  id: string;
  /** NPC id of the giver (npcs.ts). */
  giver: string;
  name: string;
  /** The giver's pitch, in their voice. */
  offer: string;
  /** What to actually do, in plain terms. */
  objectiveText: string;
  /** The giver's line when you report back. */
  completion: string;
  objective: QuestObjective;
  reward: QuestReward;
  requires?: QuestRequires;
  /** A seed of the Varek Ashveil mystery, logged on completion. */
  lore?: string;
}

// --- The quests (Narrative Bible §5, condensed to fit the current game) -------

export const QUESTS: Record<string, QuestDef> = {
  // Act I — Millhaven days
  unpaid_tab: {
    id: "unpaid_tab",
    giver: "mira",
    name: "The Unpaid Tab",
    offer:
      "“A traveler slipped out three weeks back owing a tab as long as my arm. I can't leave the inn to chase him. He was making for the towns — find him, and bring back what's mine.”",
    objectiveText: "Follow the debtor's trail: travel to any town.",
    completion:
      "“You found him? And the coin!” Mira laughs for the first time in weeks. In the debtor's pack you also found a letter he never sent — something about a pale fog to the north.",
    objective: { kind: "visitKind", settlementKind: "town" },
    reward: { gold: 15, xp: 12, items: { ration: 2 }, reputation: { merchants: 5 } },
    lore: "The letter's phrase stays with you: “the cold that doesn't lift, north of the grey marches.”",
  },
  wolf_at_the_gate: {
    id: "wolf_at_the_gate",
    giver: "gael",
    name: "Wolf at the South Gate",
    offer:
      "“A lone wolf's been circling the southern farms three nights running. Bold, for a wolf. Too bold. Put it down before it takes a child instead of a lamb.”",
    objectiveText: "Hunt down and kill a wolf (roam, hunt, or take to the road).",
    completion:
      "Gael turns the pelt over in his hands and frowns. “Good work. But look at its eyes. That grey... no animal should carry a grey like that.”",
    objective: { kind: "kill", enemyId: "wolf", count: 1 },
    reward: { gold: 20, xp: 15, reputation: { guard: 8 } },
    lore: "The wolf's eyes were wrong — a flat, ashen grey, like fog given hunger.",
  },
  eddans_delivery: {
    id: "eddans_delivery",
    giver: "eddan",
    name: "Eddan's Delivery",
    offer:
      "Eddan produces a book wrapped in oilcloth. “Carry this to a man called Hess — he keeps to the big cities. Do not open it. Do not lose it. And if anyone asks what you carry — you carry bread.”",
    objectiveText: "Carry the wrapped book to a city.",
    completion:
      "Hess was three days dead when you arrived. Eddan listens, and for a long moment looks every year of his age and then some. “Then keep the book,” he says at last. “And learn what is written in it. It seems the Flame means it for you.”",
    objective: { kind: "visitKind", settlementKind: "city" },
    reward: { spellId: "ember_ward", xp: 15, reputation: { church: 5 } },
    lore: "The sermons in Eddan's book match no doctrine of the Eternal Flame you've ever heard preached.",
  },
  // Act I–II — the Wardens of the towns
  proof_of_blade: {
    id: "proof_of_blade",
    giver: "valdis",
    name: "Proof of Blade",
    offer:
      "“I don't talk shop with people who can't fight — waste of two people's time. Wolves have been coming down the south road wrong in the head. Kill three, come back, and we'll see if you're worth arming.”",
    objectiveText: "Kill 3 wolves.",
    completion:
      "Valdis inspects your gear, then your hands, then finally your eyes. “You'll do.” He unlocks a case and hands you a Warden's blade, worn but true. “This has buried better monsters than wolves. Try to be worthy of it.”",
    objective: { kind: "kill", enemyId: "wolf", count: 3 },
    reward: { weaponId: "wardens_shortblade", xp: 20, reputation: { guard: 10 } },
    requires: { anyAttr: { STR: 3, AGI: 3 } },
  },
  lost_patrol: {
    id: "lost_patrol",
    giver: "valdis",
    name: "The Patrol That Didn't Return",
    offer:
      "Valdis lowers his voice. “Three of my scouts went toward the western edge six days ago. Officially, I can't send anyone after them — the council forbids it. Unofficially: the barrows have been giving up their dead, and my people walked right into it. Find what's left. Off the books.”",
    objectiveText: "Put down 2 of the walking dead (barrow skeletons — delve the barrows).",
    completion:
      "You lay the scouts' effects on the table. Valdis is silent a long while. “They knew the risk. Doesn't make it lighter.” He pushes a bundle across. “Field armor. Warden issue. They'd want it used.”",
    objective: { kind: "kill", enemyId: "barrow_skeleton", count: 2 },
    reward: { armorId: "wardens_field_armor", xp: 25, reputation: { guard: 15 } },
    lore: "Among the scouts' effects: a rubbing of a symbol from a standing stone — a veil, drawn over a flame.",
  },
  // Act II — Ashmark intrigue
  couriers_copy: {
    id: "couriers_copy",
    giver: "voss",
    name: "The Courier's Copy",
    offer:
      "“A letter passes between two council members tonight. I need to know what's in it — copied, resealed, the courier none the wiser. Charm him, outwit him, or out-quick him; I don't care which. I care that no one knows it happened.”",
    objectiveText: "Intercept the courier's letter (resolved here — Lady Voss needs only your word and your nerve).",
    completion:
      "Lady Voss reads your copy twice, and her face goes very still. “'Our arrangement with the northern party.' They put it in writing. The fools put it in writing.” She pays without counting.",
    objective: { kind: "talk" },
    reward: { gold: 40, xp: 20, reputation: { merchants: 10 } },
    requires: { anyAttr: { AGI: 4, SMT: 4, CHA: 4 } },
    lore: "Someone on the ruling council has an “arrangement” with something in the north.",
  },
  names_in_the_ledger: {
    id: "names_in_the_ledger",
    giver: "voss",
    name: "Names in the Ledger",
    offer:
      "“My dossier is one page short of burying half this council, and the men guarding that page are hired blades with graves for eyes — tomb-robbers in council livery. Get through them, and the ledger is whole.”",
    objectiveText: "Cut down 2 tomb bandits (they haunt the barrows and ruins).",
    completion:
      "The page slides into the dossier like a blade into a sheath. “Whole at last.” She works a signet ring from her hand. “The Voss name opens doors. Now it opens them for you.”",
    objective: { kind: "kill", enemyId: "tomb_bandit", count: 2 },
    reward: { gold: 30, xp: 30, attributes: { CHA: 2 }, reputation: { merchants: 10 } },
    lore: "The ledger names the traitor: a sitting council lord has been feeding the north information for years.",
  },
  // Rook, who finds you
  unusual_commission: {
    id: "unusual_commission",
    giver: "rook",
    name: "An Unusual Commission",
    offer:
      "“There's a ruin out past the roads — pick whichever you like, they all remember the same century. Something in the deep of it belongs to neither the living nor the dead. Clear the place to its bones and I'll pay you what it's worth. Which is a great deal.”",
    objectiveText: "Fully clear any ruin on the world map (defeat its guardian).",
    completion:
      "Rook turns your find over once, pockets it in a motion you almost don't see, and slides a heavy purse and a long, pale blade across the table. “The blade's yours. Found it the same way you found that. Consider it professional courtesy.”",
    objective: { kind: "clearRuin" },
    reward: { gold: 80, xp: 35, weaponId: "pale_brand" },
    lore: "Whatever Rook pocketed, it was cold enough to frost the table — and he knew exactly what it was.",
  },
  // Act II+ — the next generations
  her_sons_silence: {
    id: "her_sons_silence",
    giver: "mira",
    name: "Her Son's Silence",
    offer:
      "Mira is older now, and quieter. “My Aldric joined the Wardens. Six months, no letter. The last one said he was patrolling near the barrows — where the dead don't stay put. Someone has to look. I'm asking you, because your family never once let mine down.”",
    objectiveText: "Search where the dead walk: destroy the wight at the bottom of a barrow.",
    completion:
      "You found Aldric's trail — and put down the thing that stalked it. He lives, but he is changed: he saw something in the fog, a spire where no spire should stand, and could not move for a day and a night. Mira holds you like her own. “You brought me the truth. That's more than anyone else dared.”",
    objective: { kind: "kill", enemyId: "barrow_wight", count: 1 },
    reward: { gold: 60, xp: 30, items: { greater_draught: 1 }, reputation: { guard: 8 } },
    requires: { generation: 2 },
    lore: "Aldric's account, first of its kind: a spire in the northern fog, and a dread that roots the body where it stands.",
  },
  the_name_unspoken: {
    id: "the_name_unspoken",
    giver: "eddan",
    name: "The Name He Won't Speak",
    offer:
      "Eddan looks exactly as old as he did when your grandparent knew him. Exactly. “Three generations your family has sat across from me, and I owe you a piece of the truth. About a sealing that was never finished. About a scholar who solved death and lost everything else. Sit. This will take the evening.”",
    objectiveText: "Sit with Eddan and hear the whole of it.",
    completion:
      "By the end, the candle is out and Eddan's voice is a whisper. “He was not imprisoned. Only slowed. And the ritual that could end him has three parts — I hold one. If I do not survive to tell your children the second... come back afraid. Fear means you understand. Your grandparent was afraid too. They came back anyway.”",
    objective: { kind: "talk" },
    reward: { xp: 40, attributes: { SMT: 1 } },
    requires: { generation: 3, reputation: { church: 15 } },
    lore: "Counter-ritual, fragment the first: the sealing must be finished where it was begun — beneath the northern mountains.",
  },
};

// --- Progress helpers ----------------------------------------------------------

/** How much progress an objective needs before it can be turned in. */
export function questNeeded(q: QuestDef): number {
  switch (q.objective.kind) {
    case "kill":
      return q.objective.count;
    case "visitKind":
    case "clearRuin":
      return 1;
    case "talk":
      return 0;
  }
}

/** Human-readable reward list, for the offer panel and the completion log. */
export function rewardSummary(q: QuestDef): string {
  const r = q.reward;
  const parts: string[] = [];
  if (r.gold) parts.push(`${r.gold} gold`);
  if (r.weaponId) parts.push(WEAPONS[r.weaponId].name);
  if (r.armorId) parts.push(ARMORS[r.armorId].name);
  if (r.spellId) parts.push(`the ${SPELLS[r.spellId].name} spell`);
  if (r.items)
    for (const [id, n] of Object.entries(r.items)) parts.push(`${n}× ${ITEMS[id].name}`);
  if (r.attributes)
    for (const [k, v] of Object.entries(r.attributes)) parts.push(`+${v} ${k}`);
  if (r.xp) parts.push(`${r.xp} XP`);
  return parts.join(", ");
}

/** Why a quest can't be offered right now, or null if it can. */
export function questLockReason(state: GameState, q: QuestDef): string | null {
  const r = q.requires;
  if (!r) return null;
  if (r.generation && state.generation < r.generation) {
    return "They study your face, then shake their head. “Not yet. Some things wait for the next of a line.”";
  }
  if (r.anyAttr) {
    const entries = Object.entries(r.anyAttr) as [keyof Attributes, number][];
    if (!entries.some(([k, v]) => state.character.attributes[k] >= v)) {
      return `They size you up and find you wanting — prove yourself first (${entries
        .map(([k, v]) => `${k} ${v}`)
        .join(" or ")}).`;
    }
  }
  if (r.reputation) {
    const short = (Object.entries(r.reputation) as [Faction, number][]).filter(
      ([k, v]) => state.character.reputation[k] < v,
    );
    if (short.length > 0) {
      return `Your name doesn't yet carry the weight this needs (${short
        .map(([k, v]) => `${k} standing ${v}`)
        .join(", ")}).`;
    }
  }
  return null;
}

/** What an NPC's conversation should show right now. */
export type NpcQuestView =
  | { kind: "offer"; quest: QuestDef }
  | { kind: "locked"; quest: QuestDef; reason: string }
  | { kind: "active"; quest: QuestDef; progress: number; needed: number; ready: boolean }
  | { kind: "exhausted" };

export function npcQuestView(state: GameState, npcId: string): NpcQuestView {
  const npc = NPCS[npcId];
  if (!npc) return { kind: "exhausted" };
  for (const qid of npc.quests) {
    const q = QUESTS[qid];
    const p = state.quests[qid];
    if (p?.status === "done") continue;
    if (p) {
      const needed = questNeeded(q);
      return { kind: "active", quest: q, progress: p.progress, needed, ready: p.progress >= needed };
    }
    const reason = questLockReason(state, q);
    return reason ? { kind: "locked", quest: q, reason } : { kind: "offer", quest: q };
  }
  return { kind: "exhausted" };
}

// --- Accepting & completing -----------------------------------------------------

/** Take a job. Only the quest its giver is currently offering can be accepted. */
export function acceptQuest(state: GameState, questId: string): GameState {
  const q = QUESTS[questId];
  if (!q || state.quests[questId]) return state;
  const view = npcQuestView(state, q.giver);
  if (view.kind !== "offer" || view.quest.id !== questId) return state;

  let next: GameState = {
    ...state,
    quests: { ...state.quests, [questId]: { status: "active", progress: 0 } },
  };
  next = pushLog(next, {
    text: `Quest accepted — ${q.name}: ${q.objectiveText}`,
    tone: "neutral",
  });
  // Already standing somewhere that satisfies a visit objective? It counts.
  if (q.objective.kind === "visitKind") next = recordQuestArrival(next);
  return next;
}

/** Report back: apply the rewards, close the quest, narrate. */
export function turnInQuest(state: GameState, questId: string): GameState {
  const q = QUESTS[questId];
  const p = state.quests[questId];
  if (!q || !p || p.status !== "active" || p.progress < questNeeded(q)) return state;

  let character = { ...state.character };
  if (q.reward.gold) character = { ...character, gold: character.gold + q.reward.gold };
  if (q.reward.xp) character = grantXp(character, q.reward.xp).character;
  if (q.reward.weaponId && !character.ownedWeapons.includes(q.reward.weaponId)) {
    character = { ...character, ownedWeapons: [...character.ownedWeapons, q.reward.weaponId] };
  }
  if (q.reward.armorId && !character.ownedArmor.includes(q.reward.armorId)) {
    character = { ...character, ownedArmor: [...character.ownedArmor, q.reward.armorId] };
  }
  if (q.reward.spellId && !character.knownSpells.includes(q.reward.spellId)) {
    character = { ...character, knownSpells: [...character.knownSpells, q.reward.spellId] };
  }
  if (q.reward.items) {
    const inventory = { ...character.inventory };
    for (const [id, n] of Object.entries(q.reward.items)) inventory[id] = (inventory[id] ?? 0) + n;
    character = { ...character, inventory };
  }
  if (q.reward.attributes) {
    // Permanent gains (a signet's poise, a sigil's insight) — derived pools
    // grow with them, and current HP/mana keep their headroom.
    const attributes = { ...character.attributes };
    for (const [k, v] of Object.entries(q.reward.attributes) as [keyof Attributes, number][]) {
      attributes[k] += v;
    }
    const maxHp = maxHpFor(attributes);
    const maxMana = maxManaFor(attributes);
    character = {
      ...character,
      attributes,
      hp: character.hp + (maxHp - character.maxHp),
      maxHp,
      mana: character.mana + (maxMana - character.maxMana),
      maxMana,
    };
  }
  if (q.reward.reputation) character = applyReputation(character, q.reward.reputation);

  let next: GameState = {
    ...state,
    character,
    quests: { ...state.quests, [questId]: { ...p, status: "done" } },
  };
  next = pushLog(next, { text: q.completion, tone: "good" });
  next = pushLog(next, {
    text: `Quest complete — ${q.name}. Reward: ${rewardSummary(q)}.`,
    tone: "good",
  });
  if (q.lore) next = pushLog(next, { text: `✦ ${q.lore}`, tone: "neutral" });
  return next;
}

// --- Event hooks (called from engine.ts / dungeon.ts) -----------------------------

/** Bump every active quest whose objective `match` credits, narrating progress. */
function recordProgress(state: GameState, match: (obj: QuestObjective) => boolean): GameState {
  let next = state;
  for (const q of Object.values(QUESTS)) {
    const p = next.quests[q.id];
    if (!p || p.status !== "active") continue;
    const needed = questNeeded(q);
    if (p.progress >= needed || !match(q.objective)) continue;
    const progress = Math.min(needed, p.progress + 1);
    next = { ...next, quests: { ...next.quests, [q.id]: { ...p, progress } } };
    const giver = NPCS[q.giver];
    next = pushLog(
      next,
      progress >= needed
        ? { text: `${q.name} — done. ${giver.shortName} will want to hear of this.`, tone: "good" }
        : { text: `${q.name}: ${progress} of ${needed}.`, tone: "neutral" },
    );
  }
  return next;
}

/** A fight was won — credit kill quests hunting this enemy. */
export function recordQuestKill(state: GameState, enemyId: string): GameState {
  return recordProgress(state, (o) => o.kind === "kill" && o.enemyId === enemyId);
}

/** The character arrived at (or accepted a quest inside) a settlement. */
export function recordQuestArrival(state: GameState): GameState {
  const s = settlementOf(state.map, state.location.settlementId);
  if (!s) return state;
  return recordProgress(state, (o) => o.kind === "visitKind" && o.settlementKind === s.kind);
}

/** A world ruin was cleared for the first time. */
export function recordQuestRuinCleared(state: GameState): GameState {
  return recordProgress(state, (o) => o.kind === "clearRuin");
}

/** Active quests, for the journal panel — offer order is registry order. */
export function activeQuests(state: GameState): { quest: QuestDef; progress: number; needed: number }[] {
  return Object.values(QUESTS)
    .filter((q) => state.quests[q.id]?.status === "active")
    .map((q) => ({ quest: q, progress: state.quests[q.id].progress, needed: questNeeded(q) }));
}

/** How many quests the line has completed, ever. */
export function questsDoneCount(state: GameState): number {
  return Object.values(state.quests).filter((p) => p.status === "done").length;
}
