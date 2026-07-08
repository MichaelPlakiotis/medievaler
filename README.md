# Hearthbound (`medievaler`)

A single-player, choice-driven **medieval life & legacy RPG** that runs in your browser.
You live a mortal life one day at a time — build skills, earn coin, grow up, grow old — and
pass your story on to your children.

Fourteen milestones in, the game is a growing sandbox: **core life loop → combat → reputation &
crime → equipment & shops → marriage & the generational loop → a living town → the character
sheet → hero sprites & dungeon delves → a wider world map → procedural settlements → city
amenities → aging tiers → a bigger world with water, roads & movable households**. You can live
a whole life, raise a family, grow wise and then frail, die, and continue as your heir — leaving
your starting hamlet, **Lazy Springs**, to follow the roads to six other settlements. Still to
come: persistent family property (see the roadmap).

The whole game is now **staged on a living pixel-art settlement** (`src/scene/townScene.ts`, a
canvas animation with drifting clouds and chimney smoke, worn footpaths, lamp posts, a signpost,
and flower planters) whose sky shifts with the cycle — **Day**, **Sunset** at the rest decision,
**Night** when you stay up. Every settlement — the hamlet, a town, a city — gets its **own
generated layout**: building count, order, roof styles, alleys, and even which side the roads
leave from all vary, seeded deterministically from the settlement itself so it always looks the
same on your next visit. **Townsfolk wander their post** by day — the smith by the forge, patrons
by the tavern door, a villager at the well, merchants behind the stalls — with **population
scaling by settlement size** (a hamlet is quiet; a city bustles), and the streets empty out at
Night, when the town is yours to prowl. Your character is a **procedural paper-doll sprite**
(`src/scene/sprites.ts`, no image assets — drawn in code, same machinery the townsfolk are drawn
with) that walks between the town's hotspots and visibly changes as you equip different weapons
and armor. Ordinary actions are buttons placed on the town itself (the tavern, the forge, the
church, the well, a neighbour's door, the barrow on the hillside), and each one takes a beat — a
little "doing it" animation — before it resolves, so the day unfolds at a deliberate pace.
Focused moments (combat, the shop, a dungeon delve, succession) open as cards over the dimmed
scene.

> Full design lives in the Game Design Document (`Hearthbound_GDD.docx`, kept outside this repo).

---

## Play it locally

You need [Node.js](https://nodejs.org/) 18+ installed.

```bash
npm install     # once, to fetch dependencies
npm run dev      # start the game; open the http://localhost:5173 link it prints
```

Other commands:

```bash
npm test         # run the automated rules checks
npm run build     # produce an optimized static build in dist/
npm run preview   # serve that build locally
```

There's no server and no account. Your progress **auto-saves in this browser** (localStorage) so a
refresh resumes where you were. For durable, portable storage, open the **📜 Ledger** in-game and
**⬇ Download save** — you get a small `.json` file you own and can keep anywhere (Drive, USB, another
computer). **⬆ Load save file** (in the Ledger, or on the creation screen) restores it, on any
device. **New life** wipes the in-browser save and starts over. Save files are versioned, so the
game tells you kindly if a file is from an incompatible version.

---

## What you can do right now

- **Create a character** — name yourself and spend 5 points across Strength, Agility,
  Smartness, and Charisma. Your build even picks your starting weapon.
- **Live the day** — each day is 8 turns. Visit the tavern, the shop, roam the outskirts, or
  work for the town. Each choice costs a turn and earns gold, XP, and quiet practice toward
  your attributes.
- **Fight** — roaming, hunting, and prowling the alleys can turn up an enemy. Combat is
  turn-based (GDD §4): **Weapon Attack**, **Spell Attack** (spends mana), or **Use Item**
  (healing draught, smoke bomb to flee). Hit and damage come from your stats vs. theirs, so a
  win or loss feels earned. Enemies behave differently — some press the attack, some guard,
  some flee when hurt.
- **Win, lose, or die** — beat a foe for XP and loot; lose and a defeat check decides whether
  you're merely beaten and robbed, or killed outright.
- **Marriage, family & legacy** (GDD §2.4, §7.3 — the heart of the game) — you pick a **gender** at
  creation and **court a sweetheart of the opposite gender** (Charisma wins hearts faster). As you
  court, their **attributes are revealed**, so you can choose a match for stronger children — or
  **look elsewhere** for a better one. **Marry** once you're an adult (18), **buy a home**, and then
  **raise children** (at most one a year) who inherit a blend of both parents' attributes plus a
  little genetic luck. Everyone ages on their own timeline. When you die — in battle, or of **old
  age** — the run doesn't just end: if you have a child aged 12 or older, you **choose an heir** and
  continue as them, inheriting the family's gold, gear, **home**, and a share of its reputation. A
  single character is mortal; the family endures.
- **Portable saves that survive updates** — save files (and browser auto-saves) are versioned and
  **migrated forward** when the game changes, so an old save keeps working instead of being lost.
- **Crime & reputation** (GDD §6) — after dark you can **pick a pocket** or **burgle a home**.
  Each is a skill check against the target's difficulty: succeed and you take the loot; fail and
  a 50/50 luck roll decides whether you **escape** (seen, not caught) or are **arrested** (fined
  and jailed for the rest of the day). Every attempt shifts your standing with the four powers —
  **Town Guard, Merchants' Guild, Thieves' Den, The Church**. Good standing keeps your nights
  safe and your work well-paid; a hated outlaw sleeps poorly and draws more trouble. And below
  age 18, your deeds barely stick — a cheap, reckless adolescence before the reckoning of
  adulthood.
- **Shops & equipment** (GDD §3.3, §5.1) — **Visit the shop** to buy and sell weapons, armor, and
  supplies, and to manage your gear. Better gear means real combat progression: armor blocks
  damage (at a small cost to dodge), heavier weapons hit harder. Equipment is **attribute-gated** —
  you can *buy* an Iron Greatsword at Strength 2, but you can't *wield* it until you reach Strength
  6. Prices flex with your Merchants' Guild standing: goodwill earns a better deal. Browsing and
  trading are free; the visit only costs a turn when you leave.
- **Rest decision** — at the end of the day, **Sleep** to move on (danger scales with your Guard
  standing) or **Stay up** for 4 extra night turns — the window for crime — at the cost of being
  weary tomorrow. Rest also restores health and mana.
- **Grow and age** — level up, watch attributes rise from repeated use, and get older as the
  days pass. The years themselves now matter: entering **Maturity** (36) sharpens your mind and
  tongue (+Smartness, +Charisma on every roll), and **Old Age** (56) brings frailty (−Strength,
  −Agility) while the wisdom stays. These are *derived* modifiers — shown beside your attributes
  as "+1 age" / "−2 age" — that affect combat, crime, fleeing, courtship, and trap checks, but
  never your trained values, max HP, or what gear you can wield. An old knight keeps his
  greatsword and his learning; he just swings slower.
- **Character sheet** — a 🎒 tab on the right edge opens a DnD-style sidebar: an animated **paper-
  doll portrait** that redraws as you equip gear, your attributes with their practice bars,
  **skill points** to spend raising a stat, your condition, and your gear — **equip/unequip
  weapons and armor anywhere** (respecting attribute requirements).
- **Delve the barrow** — a dungeon hotspot on the hillside opens a **delve run**: a rolled chain
  of rooms (fights against tougher, barrow-dwelling foes, treasure, and shrine-or-trap events).
  After each room you choose to **press deeper** or **leave with your loot** — fleeing or losing a
  fight forces you out. A guardian waits in the final room; felling it awards **bonus gold and a
  skill point**. The whole delve, however deep you go, costs a single turn.
- **Know your odds** — combat shows your live **hit % and spell damage** before you commit to a
  move (and a read on the enemy's own odds against you); risky night actions show their **live
  success %** right on the hotspot. Ordinary actions pop a brief **+gold / +XP** chip where they
  happened, HP bars flash on a hit, and the HUD tracks the day's **turns as pips**. The ledger's
  chronicle keeps a longer history and can be **filtered (Good/Bad) and searched**.
- **Take to the road** — a hotspot at the edge of town opens a **regional hex map** (fog of
  war: only hexes you've reached or are next to are revealed). Moving to a neighboring hex costs
  a turn; the wilds get **more dangerous the farther you stray from a settlement**, and a hostile
  encounter pauses for a choice — **Fight**, **attempt to Flee** (an Agility skill check, now
  available in *every* fight, not just on the road), or **pay a bribe** to guarantee safe passage
  if you can afford it. The region is big now — **469 hexes** holding **seven settlements** (two
  hamlets, three towns, two cities), plus **lakes you can't cross** and a **road network linking
  every settlement**: follow a road and no encounter will trouble you (for now); cut across the
  wilds and save the time, if you dare.
- **Settlements that differ in kind, not just looks** — each settlement rolls its own
  **structures**: every one has a tavern and a working square, hamlets add only a **forge**,
  towns keep a **church** (and usually a forge), and cities have everything, university and
  pleasure house included — each in its own spot. No church means no studying there; no forge
  means no shop. What a place *has* now matters as much as where it is.
- **Buy homes — plural** — every settlement will sell you a plot, and the lot builds up visibly
  wherever you own one. Your **family lives in one settlement** (the first home you buy);
  **children can only be tried for while you're with them**, and owning a home elsewhere unlocks
  **"Send for your family"** — a cart fee moves the household, and family life moves with it.
- **Bigger-city amenities** — cities offer two things a hamlet or town can't: the **university**
  (tuition-priced, but trains Smartness harder than the free church study) and the **pleasure
  house** (trains Charisma; for a male character, a chance of fathering a child, added to your
  family like any other — heir-eligible, blended attributes, the same one-a-year rule). Visit
  while married and there's a real risk of being **caught** — a reputation hit with everyone but
  the Thieves' Den, and a chance the marriage doesn't survive it.

---

## How the code is organized

The golden rule: **game rules are plain TypeScript that knows nothing about the screen; React
only draws the state and forwards clicks.** That separation is what keeps the game easy to
change and test.

```
src/
├── game/            ← pure logic, no React. This is "the rules".
│   ├── types.ts      shapes of all data (Character, GameState, CombatState, …)
│   ├── config.ts     EVERY tunable number — balance the game by editing this
│   ├── rng.ts        seeded randomness (reproducible runs)
│   ├── log.ts        the shared "chronicle" helper
│   ├── character.ts  create a character; XP, levels, attribute growth
│   ├── equipment.ts  weapons + armor + items; requirements/gating (GDD §3.3)
│   ├── enemies.ts    the bestiary + encounter tables
│   ├── reputation.ts factions, standing, age-weighting, rep-driven risk (GDD §6.1)
│   ├── crime.ts      the crime skill-check + escape/arrest flow (GDD §6.2)
│   ├── shop.ts       buy / sell / equip, rep-driven prices (GDD §5.1)
│   ├── family.ts     courtship, marriage, children + blending (GDD §7.3)
│   ├── succession.ts death, heir eligibility, inheritance (GDD §2.4)
│   ├── actions.ts    the menu of activities + their outcomes
│   ├── combat.ts     the turn-based battle engine (GDD §4)
│   ├── engine.ts     the turn / day / night loop; ties all systems together
│   └── save.ts       load/save to the browser
├── ui/              ← React components. They only render + forward clicks.
│   ├── CharacterCreation.tsx
│   ├── GameScreen.tsx
│   ├── StatPanel.tsx
│   ├── ActionMenu.tsx
│   ├── CombatPanel.tsx
│   ├── GameOver.tsx
│   ├── ReputationPanel.tsx
│   ├── ShopPanel.tsx
│   ├── FamilyPanel.tsx
│   ├── SuccessionScreen.tsx
│   ├── EventLog.tsx
│   └── RestDecision.tsx
├── App.tsx          top-level: creation screen vs. game screen
└── main.tsx         boots React
test/
└── engine.test.ts   automated checks on the rules
```

**Want to tweak the game?** Start in `src/game/config.ts` (numbers) and `src/game/actions.ts`
(what each activity does). Nothing there requires understanding React.

---

## Roadmap (next milestones)

1. ~~**Combat**~~ ✅ — turn-based weapon / spell / item, hit & damage math, defeat check (GDD §4).
2. ~~**Reputation & crime**~~ ✅ — faction standing, pickpocket/burgle, escape/arrest, jail (GDD §6).
3. ~~**Equipment & shops**~~ ✅ — buy/sell weapons & armor with attribute gating (GDD §3.3, §5.1).
4. ~~**Marriage & the generational loop**~~ ✅ — courtship, children, heirs, inheritance (GDD §2.4, §7.3).
5. ~~**Aging tier effects**~~ ✅ — per-tier stat modifiers, derived from your current age:
   Maturity's wisdom (+SMT/+CHA), Old Age's frailty (−STR/−AGI, wisdom kept). Applied to every
   roll — combat, crime, courtship, traps — never to trained attributes, max HP, or gear (GDD §7.1).
6. ~~**World map & travel**~~ ✅ — a hex-based regional map with fog of war, travel encounters
   (fight/flee/bribe), and other settlements to reach (GDD §5.4).
7. ~~**Procedural settlements**~~ ✅ — each settlement (hamlet/town/city) gets its own generated
   building layout, alleys, roads, and population; proper names (the hamlet is Lazy Springs); a
   home that's visibly built up where you bought it.
8. ~~**Bigger-city amenities**~~ ✅ — a university (stronger, city-only Smartness training) and a
   brothel (Charisma training; a chance of fathering a child if you're male, with infidelity
   detection and reputation/divorce consequences if you're married) — city-only, the hamlet's
   church can't host either. Still to come: extra shop tiers and per-settlement standing.
9. **Family property** — a home/shop/land that persists and upgrades across generations (GDD §7.3).
10. **Deploy** to GitHub Pages so anyone can play from a link.
11. ~~**A bigger world**~~ ✅ — the map grew to radius 12 with seven settlements, impassable
    water, and a safe road network linking every settlement; each settlement rolls its own
    structures (hamlets: forge only; towns: church + usually a forge; cities: everything);
    homes can be owned in several settlements, the family lives in one of them, children
    require being together, and "Send for your family" moves the household (save v11).
