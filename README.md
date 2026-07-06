# Hearthbound (`medievaler`)

A single-player, choice-driven **medieval life & legacy RPG** that runs in your browser.
You live a mortal life one day at a time — build skills, earn coin, grow up, grow old — and
(in later milestones) pass your story on to your children.

This repo is **Milestone 1: the core life loop**. It's a real, playable foundation; combat,
crime, reputation, the world map, marriage and the generational hand-off are designed to layer
on top of it next (see the roadmap at the bottom).

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

There's no server and no account — your progress is saved in your browser (localStorage) on
this device. **New life** wipes it and starts over.

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
  you're merely beaten and robbed, or killed outright (which, for now, ends the run).
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
  days pass.

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
│   ├── actions.ts    the menu of activities + their outcomes
│   ├── combat.ts     the turn-based battle engine (GDD §4)
│   ├── engine.ts     the turn / day / night loop; ties combat, crime & shop in
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
4. **World map & settlements** — travel between hamlets, towns, cities; per-settlement standing
   and more crime types (bank, library, assassination) that the current single hamlet can't host
   (GDD §5.4, §6.2).
5. **Aging tier effects** — mechanical buffs/debuffs per life stage (GDD §7.1).
6. **Marriage & the generational loop** — heirs inherit blended attributes and family property
   (GDD §2.4, §7.3).
7. **Deploy** to GitHub Pages so anyone can play from a link.
