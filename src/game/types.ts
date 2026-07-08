// ---------------------------------------------------------------------------
// types.ts — the shape of all game data.
//
// These are TypeScript "types": they don't run, they just describe what a valid
// piece of data looks like. The editor and compiler use them to catch mistakes
// (e.g. reading a field that doesn't exist) before you ever run the game.
// ---------------------------------------------------------------------------

/** The four core attributes (GDD §3.1). */
export type AttributeKey = "STR" | "AGI" | "SMT" | "CHA";

/** A character's gender. You court suitors of the opposite gender (GDD §7.3). */
export type Gender = "male" | "female";

/** The powers whose regard the player earns or loses (GDD §6.1). */
export type Faction = "guard" | "merchants" | "thieves" | "church";

/** A standing value for each faction. */
export type Reputation = Record<Faction, number>;

/** A number for each attribute — used for values and for hidden growth meters. */
export type Attributes = Record<AttributeKey, number>;

/** The four stages of a life (GDD §7.1). Each carries its own stat modifiers. */
export type AgeTier = "Adolescence" | "Prime" | "Maturity" | "Old Age";

/** Time of day. Days are the normal phase; nights happen if the player stays up. */
export type Phase = "day" | "night";

/** Which attribute a weapon's accuracy and handling keys off (GDD §4.2). */
export type WeaponAttr = "STR" | "AGI";

/** Minimum attributes an item needs before it can be equipped (GDD §3.3). */
export type Requirements = Partial<Attributes>;

/** A weapon the character can fight with (GDD §3.3 / §4.2). */
export interface Weapon {
  id: string;
  name: string;
  /** Base damage before the Strength modifier and the target's armor. */
  baseDamage: number;
  /** Per-weapon proficiency feeding the accuracy formula. */
  skill: number;
  /** Whether accuracy leans on STR (heavy) or AGI (light). */
  attackAttr: WeaponAttr;
  /** Attribute floor to wield it (GDD §3.3). Absent = anyone can. */
  requirements?: Requirements;
  /** Shop price in gold. */
  price: number;
}

/** A piece of armor (GDD §3.3 / §4.2). */
export interface Armor {
  id: string;
  name: string;
  /** Subtracted from incoming damage. */
  armorValue: number;
  /** Weight penalty subtracted from dodge. */
  weightPenalty: number;
  requirements?: Requirements;
  price: number;
}

/** A partner being courted, before marriage (GDD §7.3). */
export interface Suitor {
  name: string;
  gender: Gender;
  attributes: Attributes;
  /** How well the courtship is going, 0–100; propose once it's high enough. */
  relationship: number;
}

/** The person the character married (kept for blending children). */
export interface Spouse {
  name: string;
  gender: Gender;
  attributes: Attributes;
}

/** A child. Age is derived from birthDay, so children grow with the calendar. */
export interface Child {
  name: string;
  gender: Gender;
  attributes: Attributes;
  /** The game-day this child was born (age 0). */
  birthDay: number;
  alive: boolean;
}

/** Everything about the person the player is currently living as. */
export interface Character {
  name: string;
  gender: Gender;
  /**
   * The game-day corresponding to age 0 for THIS character. Age is derived from
   * it, so an heir born mid-game ages from their own birth, not the world clock
   * (GDD §7). Can be negative for the very first character.
   */
  birthDay: number;
  /** Cached whole-year age, recomputed as days pass. */
  ageYears: number;
  /** Current attribute values (STR/AGI/SMT/CHA). */
  attributes: Attributes;
  /**
   * Hidden "practice" meters, one per attribute. Doing a relevant action fills
   * the meter; when it passes a threshold the attribute rises by 1 (GDD §3.1 —
   * "training montage by gameplay"). The player never sees raw meter numbers.
   */
  attributeProgress: Attributes;
  hp: number;
  maxHp: number;
  /** Smartness-fed magic pool; regenerates on rest (GDD §4.2). */
  mana: number;
  maxMana: number;
  gold: number;
  /** Overall life progress (GDD §3.2). */
  level: number;
  xp: number;
  /** The weapon currently in hand (GDD §4). */
  weapon: Weapon;
  /** The armor currently worn, or null for unarmored (GDD §3.3). */
  armor: Armor | null;
  /** Ids of every weapon/armor owned (whether equipped or just carried). */
  ownedWeapons: string[];
  ownedArmor: string[];
  /** Simple bag of consumable id -> count. */
  inventory: Record<string, number>;
  /** Standing with each faction (GDD §6.1). */
  reputation: Reputation;
  /** The sweetheart currently being courted, if any (GDD §7.3). */
  suitor: Suitor | null;
  /** The spouse, once married. */
  spouse: Spouse | null;
  /** Children born to this character. */
  children: Child[];
  /** Owns a home — required to raise children, and persists to heirs (GDD §7.3). */
  ownsHome: boolean;
  /** Which settlement the home was bought in (null if none) — it only renders
   *  built-up there, and persists to heirs alongside ownsHome. */
  homeSettlementId: string | null;
  /** Unspent skill points (earned from adventuring bosses); spend to raise an attribute. */
  skillPoints: number;
}

/** The full saved state of a run. This is exactly what we store in the browser. */
export interface GameState {
  character: Character;
  /** Days lived so far, starting at 1. */
  day: number;
  /** Which turn of the current phase we're on, starting at 1. */
  turn: number;
  phase: Phase;
  /**
   * True after the player takes the final turn of the phase, meaning the
   * end-of-day Sleep / Stay-Up decision is now due (GDD §2.2).
   */
  awaitingRest: boolean;
  /**
   * A flat penalty applied to the next day's action outcomes after staying up
   * (GDD §2.2 fatigue). 0 when rested.
   */
  fatigue: number;
  /** Seeded RNG state — kept in the save so runs are reproducible. */
  rngSeed: number;
  /** An active battle, or null when not fighting (GDD §4). */
  combat: CombatState | null;
  /** True while the player is browsing the shop (GDD §5.1). */
  shopOpen: boolean;
  /** An active dungeon delve, or null when not delving. */
  dungeon: DungeonState | null;
  /** The regional map, generated once per run. */
  map: WorldMap;
  /** Hexes revealed so far (fog of war), as `"q,r"` keys. */
  discovered: string[];
  /** Where the character currently is on the world map. */
  location: LocationState;
  /** True while viewing the hex map (shop-visit pattern: free to open). */
  mapOpen: boolean;
  /** A hostile encounter rolled mid-travel, awaiting Fight/Flee/Bribe. */
  roadEncounter: RoadEncounterState | null;
  /**
   * When the character dies leaving eligible heirs, this holds them for the
   * player to choose from (GDD §2.4). Null the rest of the time.
   */
  pendingSuccession: Child[] | null;
  /** How the last character died, for the succession/death screen. */
  deathCause: string | null;
  /** True once the character has died with no heir — the run is over (GDD §4.4). */
  dead: boolean;
  /** Newest-last list of narrative lines shown in the event log. */
  log: LogLine[];
  /** Schema version, so we can migrate old saves later. */
  version: number;
}

/** How an enemy tends to act each round (GDD §4.1). */
export type EnemyBehavior = "aggressive" | "defensive" | "coward";

/** A kind of enemy the player can meet. Values are placeholders to balance. */
export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  armor: number;
  /** Accuracy and dodge on the same small scale as the player's derived values. */
  accuracy: number;
  dodge: number;
  dmgMin: number;
  dmgMax: number;
  behavior: EnemyBehavior;
  /** 0–1 chance that a defeat at this enemy's hands is lethal (GDD §4.4). */
  lethality: number;
  xp: number;
  goldMin: number;
  goldMax: number;
  /** Line shown when the fight begins. */
  intro: string;
}

/** A live enemy in the current fight: its definition plus its changing state. */
export type EnemyInstance = EnemyDef & { hp: number; defending: boolean };

/** How a finished fight turned out. */
export type CombatOutcome = "won" | "fled" | "beaten" | "killed";

/** The state of an in-progress (or just-finished) battle. */
export interface CombatState {
  enemy: EnemyInstance;
  round: number;
  over: boolean;
  outcome?: CombatOutcome;
}

// --- World map & travel (the "bigger world" arc) ----------------------------

/** A hex on the regional map, in axial coordinates. */
export interface HexCoord {
  q: number;
  r: number;
}

/** Cosmetic terrain flavor — not a difficulty input (distance from a
 *  settlement is, per design). */
export type TerrainKind = "plains" | "forest" | "hills" | "mountains";

/** A place you can live, shop, and (eventually) find bigger-city amenities.
 *  Tier drives population and building count (townScene.ts) and — in a later
 *  milestone — which amenities (university, brothel) are on offer. */
export interface Settlement {
  id: string;
  name: string;
  hex: HexCoord;
  kind: "hamlet" | "town" | "city";
}

/** The regional map generated once per run. */
export interface WorldMap {
  radius: number;
  settlements: Settlement[];
  /** Terrain keyed by `"q,r"` (see hexKey in worldmap.ts). */
  terrain: Record<string, TerrainKind>;
}

/** Where the character currently stands on the world map. */
export interface LocationState {
  hex: HexCoord;
  /** Set only when standing exactly on a settlement's hex. */
  settlementId: string | null;
}

/** A hostile encounter rolled while traveling, awaiting a Fight/Flee/Bribe choice. */
export interface RoadEncounterState {
  enemy: EnemyDef;
  tier: number;
}

export interface LogLine {
  id: number;
  text: string;
  /** Lets the UI tint good/bad/neutral events differently. */
  tone: "good" | "bad" | "neutral";
}

/** A room kind within a dungeon delve. */
export type RoomKind = "fight" | "treasure" | "event" | "boss";

/** An in-progress (or just-entered) delve beneath the barrow. */
export interface DungeonState {
  /** Which room the player is currently in, 1-based. */
  depth: number;
  /** The rolled chain of rooms for this delve; the last is always "boss". */
  rooms: RoomKind[];
  /** True once the current room's outcome is settled — press deeper or leave. */
  roomResolved: boolean;
  /** True once a fight/event outcome forces retreat (fled, or beaten out). */
  mustLeave: boolean;
  /** Gold gathered so far this delve, for the exit narration. */
  lootGold: number;
}

/** An action the player can pick this turn (GDD §2.1 / §5.1 / §5.2). */
export interface ActionDef {
  id: string;
  label: string;
  /** Short hint shown under the button. */
  hint: string;
  /** Which phase(s) this action is offered in. */
  phases: Phase[];
  /** The attribute this action mainly trains, if any. */
  trains?: AttributeKey;
  /** A crime or otherwise risky choice — the UI flags it (GDD §6.2). */
  danger?: boolean;
}

/** The result of applying one action: the new state plus what to narrate. */
export interface ApplyResult {
  state: GameState;
  line: Omit<LogLine, "id">;
}
