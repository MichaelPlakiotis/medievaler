// ---------------------------------------------------------------------------
// LoadSaveButton.tsx — a small reusable "Load save" control: a styled label
// wrapping a hidden file input. Reads the picked .json, validates it, and hands
// the restored game up via onLoad — or shows a friendly error if the file is
// wrong. Used on both the creation screen and the in-game ledger.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { readSaveFile } from "../game/save";
import type { GameState } from "../game/types";

export function LoadSaveButton({
  onLoad,
  label = "Load save",
  className = "ghost",
}: {
  onLoad: (state: GameState) => void;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setError(null);
    try {
      onLoad(await readSaveFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that save file.");
    }
  }

  return (
    <span className="load-save">
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFile}
        hidden
      />
      {error && <span className="load-save-error">{error}</span>}
    </span>
  );
}
