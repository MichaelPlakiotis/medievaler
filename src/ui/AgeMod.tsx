// ---------------------------------------------------------------------------
// AgeMod.tsx — the little "−2 age" / "+1 age" suffix shown beside an attribute
// when the character's life tier modifies it (aging.ts). Shared by the stat
// panel and the character sheet so they can't drift apart.
// ---------------------------------------------------------------------------

import { tierModifiers } from "../game/aging";
import type { AttributeKey, Character } from "../game/types";

export function AgeMod({ character, attr }: { character: Character; attr: AttributeKey }) {
  const mod = tierModifiers(character.ageYears)[attr] ?? 0;
  if (mod === 0) return null;
  const effective = Math.max(1, character.attributes[attr] + mod);
  return (
    <span
      className={`age-mod ${mod > 0 ? "up" : "down"}`}
      title={`Age modifier: your rolls use ${effective} ${attr}`}
    >
      {mod > 0 ? `+${mod}` : `${mod}`} age
    </span>
  );
}
