// ---------------------------------------------------------------------------
// log.ts — the shared "chronicle" helper. Both the day/turn engine and the
// combat engine narrate through here so every line gets a unique id (needed by
// React to key the list) and the log stays trimmed to a sane length.
// ---------------------------------------------------------------------------

import type { GameState, LogLine } from "./types";

/** Keep enough history for the ledger's searchable chronicle to be useful. */
const LOG_LIMIT = 200;

/**
 * Append a line to the log, keeping only the most recent entries. The next id
 * is derived from the log already in `state` (its last entry always holds
 * the highest id, since we only ever append and trim from the front) rather
 * than a module-global counter — a global would reset to 1 on every page
 * load, colliding with ids already sitting in a loaded save's log and
 * producing duplicate React keys the moment the very first action ran after
 * a refresh.
 */
export function pushLog(state: GameState, line: Omit<LogLine, "id">): GameState {
  const nextId = state.log.length > 0 ? state.log[state.log.length - 1].id + 1 : 1;
  const entry: LogLine = { ...line, id: nextId };
  const log = [...state.log, entry].slice(-LOG_LIMIT);
  return { ...state, log };
}
