# 🌸 Weekly Budget Planner

A soft pink weekly budget tracker built with React and Vite. Pick a week, set your budget (in pesos by default, or another currency), add expenses, and watch your remaining balance update in real time. If you go over, the app shows exactly by how much.

## Features

- **Four tabs:** Expenses, Debt, Monthly and Backup, so each part of the app is one short screen instead of one long scroll.
- **Week calendar:** choose any week of the year, or jump with Prev, Next and This week. Each week keeps its own budget and expenses.
- **Live budget:** every expense you add or delete instantly updates Budget, Spent and Remaining.
- **Over-budget alert:** the bar and summary turn red and show "Over budget by ₱X" when you exceed your budget.
- **Add-expense preview:** while you type an amount, see what you'd have left (or how far over you'd go) before you add it.
- **Expense details:** each expense has a name, amount, category and day of the week, and can be edited or deleted. Deletes can be undone for 10 seconds.
- **Recurring expenses:** tick "Repeat every week" for things like rent or subscriptions. They're added to every week from then on until you stop them.
- **Carry-over (optional):** bring each week's leftover, or overspending, into the next week's budget.
- **Breakdowns:** spending by category and day by day, plus a suggested daily spend for the days left in the week.
- **Weekly rating:** a 1–5 star score out of 100 for how the week went, with the reasons behind it.
- **Debt tracking:** list what you owe and what people owe you. Paying a debt is an expense tagged with the debt, so balances follow your weekly spending. Record partial repayments from people who owe you.
- **Monthly summary:** every week of a month at a glance, with leftovers, overspending, debt payments and expected repayments. Tap a week to open it.
- **Search:** find expenses across every week by name, lender, category or date range.
- **Full backup:** download everything as one .json file and restore it on any device. The app reminds you when it's been a while.
- **Export, whole or partial:** download everything (expenses **and** debts), expenses only, or debts only, as a `.txt` report or an Excel `.xlsx` file with formulas.
- **Import, whole or partial:** open a `.txt` file to read it; if it's a report from this app, load back everything in it, just the expenses, or just the debt lists. Imports can be undone.
- **Email or copy:** send the same selection to yourself through your email app, or copy it as text.
- **Customizable theme:** pick a preset pink or any custom color (with a warning if text would be hard to read), and choose light, dark or match-my-device mode.
- **Mobile friendly:** large tap targets and a pinned Remaining bar at the bottom of the screen on phones.

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vite.dev/)
- [SheetJS (`xlsx`)](https://sheetjs.com/) for Excel export
- Plain CSS with CSS variables for theming

## Getting started

You'll need [Node.js](https://nodejs.org/) (version 22.12 or newer) installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Scripts

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Starts the development server with hot reload    |
| `npm run build`      | Creates a production build in `dist/`            |
| `npm run preview`    | Serves the production build locally for testing  |
| `npm test`           | Runs the unit and app tests once (Vitest)        |
| `npm run test:watch` | Re-runs tests as you edit                        |
| `npm run lint`       | Checks the code with ESLint                      |
| `npm run format`     | Formats every file with Prettier                 |
| `npm run check`      | Lint + tests (what Netlify runs before building) |

## Project structure

```
.
├── index.html              # App shell and font links
├── netlify.toml            # Netlify build settings (runs lint + tests before every deploy)
├── eslint.config.js, .prettierrc.json
├── vite.config.js          # Vite + Vitest config
└── src/
    ├── main.jsx            # React entry point
    ├── App.jsx             # App state, saving, undo, and the four tabs
    ├── data.js             # Saved data: validation, upgrades, imports, full backups, recurring expenses
    ├── utils.js            # Week math, money, currency, rating, .txt/.xlsx export and .txt parsing
    ├── components/         # Expenses, debts, monthly/search, backup/settings and shared UI pieces
    ├── test/               # Vitest unit tests and app tests (Testing Library)
    └── styles.css          # Pink theme, tabs, layout and mobile styles
```

## How to use

On the **Expenses** tab:

1. **Choose a week** with the calendar, or use Prev, Next and This week.
2. **Enter your budget** for that week in pesos.
3. **Add expenses** with a name, amount, category and day. Press Enter or tap Add expense.
4. **Watch the summary.** Remaining goes down with each expense. If you pass your budget, the amount you're over is shown in red.

On the **Debt** tab, list what you borrowed and what people owe you. To pay a debt down, go back to Expenses, add the payment and pick the debt under "This pays off a debt" — the balance drops on its own, and goes back up if you delete that expense.

On the **Monthly** tab, step through months to see how each week went, and tap a week to open it. Use **Find expenses** to search every week.

On the **Backup** tab, download a full backup, export or email one week, or load a `.json` backup or `.txt` report back in. Settings (theme, currency and carry-over) live here too. "Clear week" is on the Expenses tab, next to the list.

## Customizing the theme

All colors are CSS variables at the top of `src/styles.css`. To change the default pink, edit `--accent` (and the matching default in `src/App.jsx`):

```css
:root {
  --accent: #f4a6bd; /* main pink */
  --bg: #fff4f7; /* page background */
  --over: #c2234f; /* over-budget color */
}
```

## Deploying

The app is deployed on Netlify. `netlify.toml` tells Netlify to run `npm run check` (lint + tests) and then `npm run build`, and to publish `dist/`. If a test fails, the deploy stops and the live site keeps the last working version. It also sets Node 22 and caching headers so people always get the newest build.

For other static hosts, run `npm run build` and upload `dist/`. If you deploy to a GitHub Pages sub-path (for example `username.github.io/repo-name/`), add `base: '/repo-name/'` to `vite.config.js`.

## Good to know

- **Data storage:** budgets and expenses are saved in your browser's `localStorage`. They stay on that device and browser, don't sync between devices, and are erased if you clear your browser data. Download a full `.json` backup now and then. Saved data is checked when the app loads, and if it can't be read, the original is kept rather than overwritten. Two open tabs stay in sync.
- **Week picker support:** the calendar uses `<input type="week">`, which works in Chrome, Edge and most mobile browsers. Desktop Safari and Firefox show a plain text box where you type a week like `2026-W44`. Prev, Next and This week work everywhere.
- **Currency:** Philippine Peso by default; change it under Settings. This only changes the symbol, and amounts aren't converted.
