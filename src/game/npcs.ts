// ---------------------------------------------------------------------------
// npcs.ts — the named quest-givers of the Ashveil saga (Narrative Bible §4).
// Same registry pattern as equipment.ts: plain data + a small availability
// helper. Quest definitions and progression logic live in quests.ts.
//
// Every NPC lives in exactly ONE place at a time — no doubles across towns.
// The world map is procedural, so placement is a rule, not a hardcoded name:
// Mira and Gael anchor the starting hamlet; Valdis holds the first town's
// Warden outpost and Lady Voss the first city's manor (this run's "Duskford"
// and "Ashmark"); Eddan and Rook are wanderers on a daily circuit — each day
// they're at one settlement on their route, and gone from it the next.
// ---------------------------------------------------------------------------

import { settlementOf } from "./worldmap";
import type { GameState, Gender, Settlement, StructureKind } from "./types";

/** Where an NPC lives. Exactly one of these rules per NPC. */
export interface NpcPlace {
  /** Pinned to one settlement id (the starting hamlet is always "hamlet"). */
  settlementId?: string;
  /** Pinned to the Nth settlement of this tier this run generated (`index`,
   *  default 0 — the first). Lets each town/city keep its own faces. */
  kind?: Settlement["kind"];
  index?: number;
  /** A wanderer: visits one settlement with this building per day, in turn. */
  roams?: StructureKind;
}

export interface NpcDef {
  id: string;
  /** Full name, e.g. "Mira Thatch". */
  name: string;
  /** What their floating name tag calls them, e.g. "Mira". */
  shortName: string;
  /** Drives their little in-town paper-doll (scene walker). */
  gender: Gender;
  /** One-line role, shown under the name. */
  title: string;
  place: NpcPlace;
  /** Opening line of every conversation. */
  greeting: string;
  /** Line shown once their whole quest chain is done. */
  farewell: string;
  /** Ordered quest chain (ids into QUESTS); each offered once the prior is done. */
  quests: string[];
  /** Rook's rule: he only appears after this many quests are done (any givers). */
  minQuestsDone?: number;
}

export const NPCS: Record<string, NpcDef> = {
  mira: {
    id: "mira",
    gender: "female",
    name: "Mira Thatch",
    shortName: "Mira",
    title: "Innkeeper of the Hearthside Inn",
    place: { settlementId: "hamlet" },
    greeting:
      "Mira looks up from the hearth, wiping her hands on her apron. “Sit, before you fall over. There's stew, and there's talk — both cheap.”",
    farewell:
      "“You've done right by this house, and this house remembers. There'll always be a bowl for your name here.”",
    quests: ["unpaid_tab", "her_sons_silence"],
  },
  gael: {
    id: "gael",
    gender: "male",
    name: "Captain Gael",
    shortName: "Gael",
    title: "Captain of the Town Watch",
    place: { settlementId: "hamlet" },
    greeting:
      "The watch captain leans on his spear at the gate. “Quiet today. That's how I like it. You here to keep it that way, or ruin it?”",
    farewell: "“The gate stands easier with you about. Walk on.”",
    quests: ["wolf_at_the_gate"],
  },
  eddan: {
    id: "eddan",
    gender: "male",
    name: "Brother Eddan",
    shortName: "Eddan",
    title: "A wandering priest, always on the road",
    place: { roams: "church" },
    greeting:
      "The old priest doesn't look up from his book at first. “Sit. The Flame doesn't mind company, and neither do I. You have the look of someone the road is pulling north.”",
    farewell:
      "“I have told your family everything I am permitted to carry. What remains must be found, not given.”",
    quests: ["eddans_delivery", "the_name_unspoken", "the_pale_architect"],
  },
  valdis: {
    id: "valdis",
    gender: "male",
    name: "Valdis Crane",
    shortName: "Valdis",
    title: "A disgraced Warden, playing cards alone",
    place: { kind: "town" },
    greeting:
      "The Warden doesn't offer you a seat. “Let me guess. You've heard stories. Everyone's heard stories. The difference is, mine are true — and nobody with a title wants them to be.”",
    farewell:
      "“You fight like your family. That's not flattery — I've watched a lot of people die badly, and you don't. Keep it that way.”",
    quests: ["proof_of_blade", "lost_patrol"],
  },
  voss: {
    id: "voss",
    gender: "female",
    name: "Lady Serenthal Voss",
    shortName: "Lady Voss",
    title: "A noble with a conscience — and a dossier",
    place: { kind: "city" },
    greeting:
      "Lady Voss receives you without ceremony. “I'll be brief. Something is rotten in this council, and everyone useful is either bought or afraid. You appear to be neither. Yet.”",
    farewell:
      "“The council fears my ledger now, and half of that fear is your doing. My door stays open to your line.”",
    quests: ["couriers_copy", "names_in_the_ledger"],
  },
  maren: {
    id: "maren",
    gender: "female",
    name: "Widow Maren",
    shortName: "Maren",
    title: "A farmwife holding her husband's land alone",
    place: { kind: "hamlet", index: 1 },
    greeting:
      "A woman with flour to her elbows looks you over from her doorstep. “If you're selling, I'm not buying. If you're working, sit down and name your rate — there's more wrong on this land than one pair of hands can fix.”",
    farewell:
      "“The grain's safe, the field's mine again, and I did it by hiring well. My husband would've liked you. Go on, before I find you more work.”",
    quests: ["rats_in_the_grain", "boar_in_the_barley"],
  },
  sera: {
    id: "sera",
    gender: "female",
    name: "Sera Wynn",
    shortName: "Sera",
    title: "A huntress who knows the wilds too well",
    place: { kind: "town", index: 1 },
    greeting:
      "The huntress by the gate has three dogs, two bows, and no patience. “You walk loud. Sit down before you scare off everything within a mile, and tell me if you're any use with sharp things.”",
    farewell:
      "“The woods are quieter, and I know exactly what that quiet costs. Walk soft out there — and if you ever see grey eyes in the dark, run first, be brave later.”",
    quests: ["cull_the_packs", "spiders_in_the_dark"],
  },
  bram: {
    id: "bram",
    gender: "male",
    name: "Bram Cartwright",
    shortName: "Bram",
    title: "Guildmaster of the Carters — every road is his ledger",
    place: { kind: "city", index: 1 },
    greeting:
      "The guildmaster looks up from a desk of route maps and waybills. “You came in off the road, which means you're either a customer or a problem. You have the look of a third thing: useful. Sit.”",
    farewell:
      "“The guild's ledgers are square and my roads breathe easy. Any carter post in the realm will treat your name like coin — spend it wisely.”",
    quests: ["the_long_road", "roadside_toll"],
  },
  nyra: {
    id: "nyra",
    gender: "female",
    name: "Nyra of the Ninth Retort",
    shortName: "Nyra",
    title: "An alchemist the universities won't discuss",
    place: { roams: "university" },
    greeting:
      "Somewhere behind a barricade of glassware, a voice: “Don't touch the green one. Or the table it's on. Or, ideally, anything.” An ash-smudged face appears. “Oh good — you look sturdy AND literate. Rare combination. Sit.”",
    farewell:
      "“I've work now that will take years, thanks to your samples — and your head. If the universities ask about me, tell them I'm dead. It keeps my rent down.”",
    quests: ["grave_dust", "the_alchemists_riddle"],
  },
  rook: {
    id: "rook",
    gender: "male",
    name: "The Merchant Rook",
    shortName: "Rook",
    title: "He was here before you arrived. He always is.",
    place: { roams: "tavern" },
    minQuestsDone: 2,
    greeting:
      "A man you don't remember entering sets two cups down. “Rook. Just Rook. I deal in things that are hard to find and harder to forget. You, for instance — you've been busy. People notice. I notice sooner.”",
    farewell:
      "“A pleasure, as always. If you ever wonder how I knew where to find you — don't. Some ledgers are better left closed.”",
    quests: ["unusual_commission"],
  },
};

/** A stable per-NPC offset so the wanderers walk different circuits. */
function circuitOffset(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return h;
}

/**
 * The ONE settlement where this NPC can be found today, or null (a wanderer
 * between stops on a map with nowhere to stop). Exclusive by construction:
 * pinned NPCs have a single home, wanderers a single stop per day.
 */
export function npcSettlementId(state: GameState, npc: NpcDef): string | null {
  if (npc.place.settlementId) return npc.place.settlementId;
  if (npc.place.kind) {
    const ofKind = state.map.settlements.filter((s) => s.kind === npc.place.kind);
    return ofKind[npc.place.index ?? 0]?.id ?? null;
  }
  if (npc.place.roams) {
    const stops = state.map.settlements.filter((s) => s.structures.includes(npc.place.roams!));
    if (stops.length === 0) return null;
    return stops[(state.day + circuitOffset(npc.id)) % stops.length].id;
  }
  return null;
}

/** Where to look for an NPC today, in words — for the quest journal. */
export function npcWhereabouts(state: GameState, npcId: string): string {
  const npc = NPCS[npcId];
  const id = npc ? npcSettlementId(state, npc) : null;
  const settlement = settlementOf(state.map, id);
  if (!settlement) return "somewhere on the road";
  return npc.place.roams ? `today at ${settlement.name}` : `in ${settlement.name}`;
}

/**
 * The NPCs who can be spoken to right now: daytime only, whoever calls THIS
 * settlement home today. Drives both the hotspot buttons and engine-side
 * validation of a "talk" action.
 */
export function npcsAt(state: GameState): NpcDef[] {
  if (state.phase !== "day") return [];
  const s = settlementOf(state.map, state.location.settlementId);
  if (!s) return [];
  const questsDone = Object.values(state.quests).filter((q) => q.status === "done").length;
  return Object.values(NPCS).filter((n) => {
    if (npcSettlementId(state, n) !== s.id) return false;
    if (n.minQuestsDone && questsDone < n.minQuestsDone) return false;
    return true;
  });
}
