// ---------------------------------------------------------------------------
// EventLog.tsx — the scrolling narration. This is the "text game" feel: every
// action writes a line here. We render newest-last; CSS flips it so the newest
// line sits at the bottom and stays in view.
// ---------------------------------------------------------------------------

import type { LogLine } from "../game/types";

export function EventLog({ log }: { log: LogLine[] }) {
  return (
    <div className="panel">
      <h2>Chronicle</h2>
      <div className="log">
        {/* reversed so, with column-reverse CSS, newest ends up at the bottom */}
        {[...log].reverse().map((line) => (
          <p key={line.id} className={line.tone}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
