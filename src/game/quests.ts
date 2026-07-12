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
  /** Enter this many settlements you'd never entered before (new waypoints). */
  | { kind: "visitNew"; count: number }
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
  /** Turning this in ends the saga: the victory screen is owed (GameState.victory). */
  endsSaga?: boolean;
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
  // The wider world — faces met on the new roads
  rats_in_the_grain: {
    id: "rats_in_the_grain",
    giver: "maren",
    name: "Rats in the Grain",
    offer:
      "The widow doesn't waste your time. “Rats the size of terriers are in my grain store, and half this hamlet eats out of it come winter. My husband would have dealt with it. My husband is dead. You'll do.”",
    objectiveText: "Kill 3 giant rats (roam the outskirts, the alleys, or the barrows).",
    completion:
      "Maren counts the tails you show her like a woman counting rent. “Good. There's bread and coin for honest work — that's more than most promises are worth these days.”",
    objective: { kind: "kill", enemyId: "giant_rat", count: 3 },
    reward: { gold: 12, xp: 12, items: { ration: 3 }, reputation: { merchants: 3 } },
  },
  boar_in_the_barley: {
    id: "boar_in_the_barley",
    giver: "maren",
    name: "The Boar in the Barley",
    offer:
      "“Something's driven the boars down out of the hills — they trample more than they eat, like they're running FROM something. Two of the big ones have claimed my barley field. Un-claim it.”",
    objectiveText: "Kill 2 boars (hunt at night, or take to the wilds).",
    completion:
      "“Barley's saved, then.” She presses a wrapped meal into your hands, and for a moment her voice softens. “You asked what they were running from. Don't go finding out on an empty stomach.”",
    objective: { kind: "kill", enemyId: "boar", count: 2 },
    reward: { gold: 18, xp: 15, items: { hearty_meal: 1 } },
    lore: "The boars came down from the northern hills — everything alive seems to be moving AWAY from the north.",
  },
  cull_the_packs: {
    id: "cull_the_packs",
    giver: "sera",
    name: "Cull the Packs",
    offer:
      "The huntress is fletching arrows and doesn't look up. “Wolves hunt to eat. These don't. Four kills last month, nothing eaten, every carcass facing south — like the pack was sending a message. Help me thin them before the farms empty out.”",
    objectiveText: "Kill 4 wolves.",
    completion:
      "Sera studies the pelts a long time. “Same grey eyes, every one. I've hunted these woods twenty years, and I'm telling you: something north of here is TEACHING them.” She shows you how she strings a bow — a huntress's thanks.",
    objective: { kind: "kill", enemyId: "wolf", count: 4 },
    reward: { gold: 35, xp: 25, attributes: { AGI: 1 }, reputation: { guard: 5 } },
    lore: "The wolf packs aren't hunting for food. They're being driven — or sent — from the north.",
  },
  spiders_in_the_dark: {
    id: "spiders_in_the_dark",
    giver: "sera",
    name: "Spiders in the Dark",
    offer:
      "“The old delves used to be honest dangers — a bandit, a bad floor. Now there's webbing across the entrances thick as sailcloth, and my dogs won't go within a hundred paces. Burn me out two of whatever's spinning it.”",
    objectiveText: "Kill 2 crypt spiders (they nest in the barrows and ruins).",
    completion:
      "“Two, and the dogs still won't settle.” She pays anyway, and adds a draught from her own pack. “Whatever wakes the crypts is waking their vermin first. Watch the dark places, friend.”",
    objective: { kind: "kill", enemyId: "crypt_spider", count: 2 },
    reward: { gold: 30, xp: 20, items: { greater_draught: 1 } },
    requires: { anyAttr: { STR: 3, AGI: 3, SMT: 3 } },
  },
  the_long_road: {
    id: "the_long_road",
    giver: "bram",
    name: "The Long Road",
    offer:
      "The carter guildmaster spreads a route map crossed with red lines. “Three of my routes have gone quiet — no word, no wagons. I need someone to walk the roads my drivers won't and put their names back in honest ledgers. Visit three settlements you've never set foot in, and note what you see.”",
    objectiveText: "Enter 3 settlements you have never entered before.",
    completion:
      "Bram copies your account into the guild ledger word for word. “Roads are how a country breathes, and you've just proved these lungs still work. The guild moves you at half rate from here on — oh, they already do? Then take coin instead.”",
    objective: { kind: "visitNew", count: 3 },
    reward: { gold: 40, xp: 25, reputation: { merchants: 8 } },
    lore: "Every route that's gone quiet, Bram's map shows, runs toward the north country.",
  },
  roadside_toll: {
    id: "roadside_toll",
    giver: "bram",
    name: "The Roadside Toll",
    offer:
      "“Cutpurses have taken to working my wagon stops in pairs — one begs, one lifts. My drivers are carters, not fighters. Break up the trade. Two of them dangling from the magistrate's ledger will teach the rest arithmetic.”",
    objectiveText: "Put down 2 cutpurses (the alleys after dark, or the roads).",
    completion:
      "“The stops are quiet again, and my drivers sleep in their own wagons.” Bram shakes your hand like he's closing a contract — which, with Bram, he is.",
    objective: { kind: "kill", enemyId: "cutpurse", count: 2 },
    reward: { gold: 30, xp: 20, reputation: { guard: 5, merchants: 5 } },
  },
  grave_dust: {
    id: "grave_dust",
    giver: "nyra",
    name: "Grave Dust",
    offer:
      "The alchemist talks while three things bubble behind her. “Bone that walks holds a residue — grave dust, we call it, imprecisely. I need it fresh, which regrettably means I need someone to make walking bone stop walking. Two skeletons' worth. Mind the femurs, they're the good part.”",
    objectiveText: "Destroy 2 barrow skeletons (delve the barrows or the ruins).",
    completion:
      "Nyra grinds your samples on the spot, peers at the powder, and goes very quiet. “It's denser. Season on season, the animation residue is getting DENSER. Someone is pouring more power into the dead.” She pays you distractedly, adding meals from her own stores.",
    objective: { kind: "kill", enemyId: "barrow_skeleton", count: 2 },
    reward: { gold: 45, xp: 25, items: { hearty_meal: 2 } },
    lore: "Nyra's measurements say the necromancy animating the dead grows stronger every season. It has a source — and the source is not idle.",
  },
  the_alchemists_riddle: {
    id: "the_alchemists_riddle",
    giver: "nyra",
    name: "The Alchemist's Riddle",
    offer:
      "“Sit. I've a proof I can show no one at the universities — they'd laugh, or worse, they'd BELIEVE me and panic. You've the look of someone who can hold an idea without dropping it. Tell me where my reasoning fails. Please.”",
    objectiveText: "Work through Nyra's proof with her (an evening's hard thinking).",
    completion:
      "By dawn the slates are covered and Nyra is grinning like a student. “It doesn't fail. Flame preserve us, it doesn't fail — death can be REVERSED, and somebody north of the marches has already done it. You've a better head than half my old faculty. Keep it attached.”",
    objective: { kind: "talk" },
    reward: { xp: 35, attributes: { SMT: 1 }, items: { greater_draught: 2 } },
    requires: { anyAttr: { SMT: 5 } },
    lore: "Nyra's proof, checked and double-checked: the lich is not a story. The mathematics of unlife balance perfectly.",
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
  // The end of the saga (Narrative Bible Act IV, scaled to one dread delve).
  the_pale_architect: {
    id: "the_pale_architect",
    giver: "eddan",
    name: "The Pale Architect",
    offer:
      "Eddan unrolls a map with a hand that does not shake, though it should. “The Spire. Your family has spent generations earning the right to stand before it, and the ward will part for your blood now — I have seen to that. Varek Ashveil waits at its height. He knows you are coming. He has always known. End what my order could not.”",
    objectiveText: "Reach Varek's Spire at the world's far edge, climb it, and destroy Varek Ashveil.",
    completion:
      "Eddan listens to the end without a word. Then the oldest man you have ever known weeps like a boy. “A hundred years,” he says. “A hundred years, and it took a family that refused to stop. The blight will lift. The dead will rest. Go home — and tell your children what their name is worth.”",
    objective: { kind: "kill", enemyId: "varek_ashveil", count: 1 },
    reward: { gold: 500, xp: 250 },
    endsSaga: true,
    lore: "In the Spire's archive you found a shelf bearing your family's name — his notes on every ancestor who tried. The last entry reads only: “They came back. They always come back.”",
  },
};

// --- Progress helpers ----------------------------------------------------------

/** How much progress an objective needs before it can be turned in. */
export function questNeeded(q: QuestDef): number {
  switch (q.objective.kind) {
    case "kill":
      return q.objective.count;
    case "visitNew":
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
  // Eddan marks the Spire on your map the moment the final hunt begins — the
  // whole island, and the ports a boat can carry you between.
  if (q.id === "the_pale_architect") {
    const spire = next.map.sites.find((s) => s.id === "spire");
    if (spire) {
      const keys = new Set(next.discovered);
      keys.add(`${spire.hex.q},${spire.hex.r}`);
      for (const k of next.map.lichIsland ?? []) keys.add(k);
      for (const p of next.map.ports ?? []) keys.add(`${p.hex.q},${p.hex.r}`);
      next = { ...next, discovered: [...keys] };
      next = pushLog(next, {
        text: "Eddan marks your map: Varek's Spire, on an island in the far sea — and the harbors whose boats can carry you there. No road reaches it. It was built that way.",
        tone: "neutral",
      });
    }
  }
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
  // The saga's final turn-in: the ending is owed on screen (GameScreen).
  if (q.endsSaga && !next.victory) next = { ...next, victory: "won" };
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

/** The character entered a settlement they'd never entered before (a new
 *  fast-travel waypoint was unlocked — engine.enterTown). */
export function recordQuestNewSettlement(state: GameState): GameState {
  return recordProgress(state, (o) => o.kind === "visitNew");
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
