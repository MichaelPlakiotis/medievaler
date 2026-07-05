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
  Smartness, and Charisma.
- **Live the day** — each day is 8 turns. Visit the tavern, the shop, roam the outskirts, or
  work for the town. Each choice costs a turn and earns gold, XP, and quiet practice toward
  your attributes.
- **Rest decision** — at the end of the day, **Sleep** to move on (risky if you've no roof) or
  **Stay up** for 4 extra night turns at the cost of being weary tomorrow.
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
│   ├── types.ts      shapes of all data (Character, GameState, …)
│   ├── config.ts     EVERY tunable number — balance the game by editing this
│   ├── rng.ts        seeded randomness (reproducible runs)
│   ├── character.ts  create a character; XP, levels, attribute growth
│   ├── actions.ts    the menu of activities + their outcomes
│   ├── engine.ts     the turn / day / night loop
│   └── save.ts       load/save to the browser
├── ui/              ← React components. They only render + forward clicks.
│   ├── CharacterCreation.tsx
│   ├── GameScreen.tsx
│   ├── StatPanel.tsx
│   ├── ActionMenu.tsx
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

1. **Combat** — turn-based weapon / spell / item, hit & damage math, defeat check (GDD §4).
2. **Reputation & crime** + the full night/burglary system (GDD §5.2, §6).
3. **World map & settlements** — travel between hamlets, towns, cities (GDD §5.4).
4. **Aging tier effects** — mechanical buffs/debuffs per life stage (GDD §7.1).
5. **Marriage & the generational loop** — heirs inherit blended attributes and family property
   (GDD §2.4, §7.3).
6. **Deploy** to GitHub Pages so anyone can play from a link.
