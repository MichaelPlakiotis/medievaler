// ---------------------------------------------------------------------------
// log.ts — the shared "chronicle" helper. Both the day/turn engine and the
// combat engine narrate through here so every line gets a unique id (needed by
// React to key the list) and the log stays trimmed to a sane length.
// ---------------------------------------------------------------------------

import type { GameState, LogLine } from "./types";

let nextLogId = 1;

/** Append a line to the log, keeping only the most recent ~60 entries. */
export function pushLog(state: GameState, line: Omit<LogLine, "id">): GameState {
  const entry: LogLine = { ...line, id: nextLogId++ };
  const log = [...state.log, entry].slice(-60);
  return { ...state, log };
}
