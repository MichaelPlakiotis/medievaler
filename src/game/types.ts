// ---------------------------------------------------------------------------
// types.ts — the shape of all game data.
//
// These are TypeScript "types": they don't run, they just describe what a valid
// piece of data looks like. The editor and compiler use them to catch mistakes
// (e.g. reading a field that doesn't exist) before you ever run the game.
// ---------------------------------------------------------------------------

/** The four core attributes (GDD §3.1). */
export type AttributeKey = "STR" | "AGI" | "SMT" | "CHA";

/** A number for each attribute — used for values and for hidden growth meters. */
export type Attributes = Record<AttributeKey, number>;

/** Time of day. Days are the normal phase; nights happen if the player stays up. */
export type Phase = "day" | "night";

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
  gold: number;
  /** Overall life progress (GDD §3.2). */
  level: number;
  xp: number;
  /** Simple bag of item name -> count. Fleshed out in a later milestone. */
  inventory: Record<string, number>;
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
  /** Newest-last list of narrative lines shown in the event log. */
  log: LogLine[];
  /** Schema version, so we can migrate old saves later. */
  version: number;
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
}

/** The result of applying one action: the new state plus what to narrate. */
export interface ApplyResult {
  state: GameState;
  line: Omit<LogLine, "id">;
}
