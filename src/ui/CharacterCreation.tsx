// ---------------------------------------------------------------------------
// CharacterCreation.tsx — the opening screen. The player names their character
// and spends exactly ATTR_POINTS across the four attributes (GDD §3.1). We keep
// a little local state for the in-progress allocation, and only hand a finished
// GameState back up to App when "Begin your life" is pressed.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ATTR_BASE, ATTR_LABELS, ATTR_POINTS, START_AGE } from "../game/config";
import { isValidAllocation, maxHpFor } from "../game/character";
import type { AttributeKey, Attributes, Gender, GameState } from "../game/types";
import { LoadSaveButton } from "./LoadSaveButton";

const KEYS: AttributeKey[] = ["STR", "AGI", "SMT", "CHA"];

const GOVERNS: Record<AttributeKey, string> = {
  STR: "Melee damage, carrying, hard labor.",
  AGI: "Dodging, stealth, hunting, quick hands.",
  SMT: "Spellpower, appraisal, lockpicking, wit.",
  CHA: "Winning people over, prices, romance.",
};

export function CharacterCreation({
  onBegin,
  onLoad,
}: {
  onBegin: (name: string, allocation: Attributes, gender: Gender) => void;
  onLoad: (state: GameState) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [alloc, setAlloc] = useState<Attributes>({
    STR: ATTR_BASE,
    AGI: ATTR_BASE,
    SMT: ATTR_BASE,
    CHA: ATTR_BASE,
  });

  const spent = KEYS.reduce((sum, k) => sum + (alloc[k] - ATTR_BASE), 0);
  const pointsLeft = ATTR_POINTS - spent;
  const ready = isValidAllocation(alloc);

  function change(key: AttributeKey, delta: number) {
    setAlloc((prev) => {
      const next = prev[key] + delta;
      if (next < ATTR_BASE) return prev; // can't go below base
      if (delta > 0 && pointsLeft <= 0) return prev; // no points left to spend
      return { ...prev, [key]: next };
    });
  }

  return (
    <div className="panel">
      <h2>Create your life</h2>
      <p className="muted">
        You begin as a {START_AGE}-year-old with almost nothing. Spend{" "}
        <strong>{ATTR_POINTS} points</strong> to decide who you are. There are no wasted
        attributes — each shapes what you can do, and this choice sticks with you.
      </p>

      <label className="muted" htmlFor="name">
        Name
      </label>
      <input
        id="name"
        type="text"
        placeholder="e.g. Aldreth, Mira, Cob…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
      />

      <div className="gender-row">
        <span className="muted">Gender</span>
        <div className="gender-toggle">
          <button
            className={gender === "male" ? "" : "ghost"}
            onClick={() => setGender("male")}
            type="button"
          >
            ♂ Man
          </button>
          <button
            className={gender === "female" ? "" : "ghost"}
            onClick={() => setGender("female")}
            type="button"
          >
            ♀ Woman
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        You'll court and, at 18, marry someone of the opposite gender.
      </p>

      <div className="row-between" style={{ margin: "16px 0 4px" }}>
        <span>Points to spend:</span>
        <span className="points-left">{pointsLeft}</span>
      </div>

      {KEYS.map((k) => (
        <div className="alloc-row" key={k}>
          <div>
            <div className="name">
              {ATTR_LABELS[k]} <span className="muted">({k})</span>
            </div>
            <div className="desc">{GOVERNS[k]}</div>
          </div>
          <div className="stepper">
            <button
              className="ghost"
              onClick={() => change(k, -1)}
              disabled={alloc[k] <= ATTR_BASE}
              aria-label={`decrease ${k}`}
            >
              −
            </button>
            <span className="val">{alloc[k]}</span>
            <button
              className="ghost"
              onClick={() => change(k, +1)}
              disabled={pointsLeft <= 0}
              aria-label={`increase ${k}`}
            >
              +
            </button>
          </div>
        </div>
      ))}

      <p className="muted" style={{ marginTop: 14 }}>
        Starting health: <strong>{maxHpFor(alloc)}</strong> (Strength makes you hardier).
      </p>

      <button
        style={{ width: "100%", marginTop: 8, padding: 14 }}
        disabled={!ready}
        onClick={() => onBegin(name, alloc, gender)}
      >
        {ready ? "Begin your life →" : `Spend all ${ATTR_POINTS} points to begin`}
      </button>

      <div className="create-load">
        <span className="muted">Already have a saved game?</span>
        <LoadSaveButton onLoad={onLoad} label="Load a save file" />
      </div>
    </div>
  );
}
