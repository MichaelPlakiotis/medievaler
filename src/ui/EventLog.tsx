// ---------------------------------------------------------------------------
// EventLog.tsx — the scrolling narration. This is the "text game" feel: every
// action writes a line here. We render newest-last; CSS flips it so the newest
// line sits at the bottom and stays in view. The ledger's full chronicle (up
// to 200 lines) can be filtered by tone and searched by text — the 3-line
// strip on the main screen is unaffected.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import type { LogLine } from "../game/types";

type ToneFilter = "all" | "good" | "bad";

export function EventLog({ log }: { log: LogLine[] }) {
  const [tone, setTone] = useState<ToneFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.filter((line) => {
      if (tone !== "all" && line.tone !== tone) return false;
      if (q && !line.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [log, tone, query]);

  return (
    <div className="panel">
      <div className="row-between">
        <h2 style={{ border: "none", marginBottom: 0, paddingBottom: 0 }}>Chronicle</h2>
        <div className="log-filters">
          {(["all", "good", "bad"] as ToneFilter[]).map((t) => (
            <button
              key={t}
              className={tone === t ? "log-filter active" : "log-filter ghost"}
              onClick={() => setTone(t)}
            >
              {t === "all" ? "All" : t === "good" ? "Good" : "Bad"}
            </button>
          ))}
        </div>
      </div>
      <input
        type="text"
        className="log-search"
        placeholder="Search the chronicle…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="log">
        {/* reversed so, with column-reverse CSS, newest ends up at the bottom */}
        {[...filtered].reverse().map((line) => (
          <p key={line.id} className={line.tone}>
            {line.text}
          </p>
        ))}
        {filtered.length === 0 && <p className="muted">Nothing matches yet.</p>}
      </div>
    </div>
  );
}
