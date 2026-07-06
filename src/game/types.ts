// ---------------------------------------------------------------------------
// types.ts — the shape of all game data.
//
// These are TypeScript "types": they don't run, they just describe what a valid
// piece of data looks like. The editor and compiler use them to catch mistakes
// (e.g. reading a field that doesn't exist) before you ever run the game.
// ---------------------------------------------------------------------------

/** The four core attributes (GDD §3.1). */
export type AttributeKey = "STR" | "AGI" | "SMT" | "CHA";

/** The powers whose regard the player earns or loses (GDD §6.1). */
export type Faction = "guard" | "merchants" | "thieves" | "church";

/** A standing value for each faction. */
export type Reputation = Record<Faction, number>;

/** A number for each attribute — used for values and for hidden growth meters. */
export type Attributes = Record<AttributeKey, number>;

/** Time of day. Days are the normal phase; nights happen if the player stays up. */
export type Phase = "day" | "night";

/** Which attribute a weapon's accuracy and handling keys off (GDD §4.2). */
export type WeaponAttr = "STR" | "AGI";

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
}

/** Everything about the person the player is currently living as. */
export interface Character {
  name: string;
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
  /** Simple bag of item id -> count. */
  inventory: Record<string, number>;
  /** Standing with each faction (GDD §6.1). */
  reputation: Reputation;
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

export interface LogLine {
  id: number;
  text: string;
  /** Lets the UI tint good/bad/neutral events differently. */
  tone: "good" | "bad" | "neutral";
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
