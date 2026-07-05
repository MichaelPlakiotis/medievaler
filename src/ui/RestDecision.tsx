// ---------------------------------------------------------------------------
// RestDecision.tsx — the end-of-day fork (GDD §2.2). Shown only when the engine
// sets awaitingRest. Sleep advances the day; Stay Up opens a risky night phase
// at the cost of fatigue tomorrow.
// ---------------------------------------------------------------------------

import { NIGHT_TURNS } from "../game/config";

export function RestDecision({
  onSleep,
  onStayUp,
}: {
  onSleep: () => void;
  onStayUp: () => void;
}) {
  return (
    <div className="panel">
      <h2>The day is spent</h2>
      <p className="muted">
        Night draws in. Do you rest, or press on into the dark?
      </p>
      <div className="rest">
        <button onClick={onSleep}>
          Sleep
          <div className="hint" style={{ fontWeight: 400, marginTop: 4 }}>
            Advance to the next day. Without a roof, your purse isn't safe.
          </div>
        </button>
        <button className="danger" onClick={onStayUp}>
          Stay up
          <div className="hint" style={{ fontWeight: 400, marginTop: 4 }}>
            {NIGHT_TURNS} more turns after dark — but tomorrow you'll be weary.
          </div>
        </button>
      </div>
    </div>
  );
}
