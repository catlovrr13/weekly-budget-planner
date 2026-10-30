# 🌸 Weekly Budget Planner

A soft pink weekly budget tracker built with React and Vite. Pick a week, set your budget in Philippine Peso (₱), add expenses, and watch your remaining balance update in real time. If you go over, the app shows exactly by how much.

## Features

- **Week calendar:** choose any week of the year, or jump with Prev, Next and This week. Each week keeps its own budget and expenses.
- **Live budget:** every expense you add or delete instantly updates Budget, Spent and Remaining.
- **Over-budget alert:** the bar and summary turn red and show "Over budget by ₱X" when you exceed your budget.
- **Add-expense preview:** while you type an amount, see what you'd have left (or how far over you'd go) before you add it.
- **Expense details:** each expense has a name, amount, category and day of the week.
- **Breakdowns:** spending by category and day by day, plus a suggested daily spend for the days left in the week.
- **Export:** download any week as a `.txt` report or an Excel `.xlsx` file (Summary and Expenses sheets, with formulas).
- **Customizable theme:** pick a preset pink or any custom color, and choose light, dark or match-my-device mode.
- **Mobile friendly:** large tap targets and a pinned Remaining bar at the bottom of the screen on phones.

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vite.dev/)
- [SheetJS (`xlsx`)](https://sheetjs.com/) for Excel export
- Plain CSS with CSS variables for theming

## Getting started

You'll need [Node.js](https://nodejs.org/) (version 18 or newer) installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server with hot reload |
| `npm run build` | Creates a production build in `dist/` |
| `npm run preview` | Serves the production build locally for testing |

## Project structure

```
.
├── index.html          # App shell and font links
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx        # React entry point
    ├── App.jsx         # App state and all UI components
    ├── utils.js        # Week math, currency formatting, .txt and .xlsx export
    └── styles.css      # Pink theme, layout and mobile styles
```

## How to use

1. **Choose a week** with the calendar, or use Prev, Next and This week.
2. **Enter your budget** for that week in pesos.
3. **Add expenses** with a name, amount, category and day. Press Enter or tap Add expense.
4. **Watch the summary.** Remaining goes down with each expense. If you pass your budget, the amount you're over is shown in red.
5. **Export** the week as `.txt` or Excel from the Export card.
6. **Customize** the accent color and light or dark mode from the "Make it yours" card.

## Customizing the theme

All colors are CSS variables at the top of `src/styles.css`. To change the default pink, edit `--accent` (and the matching default in `src/App.jsx`):

```css
:root {
  --accent: #f4a6bd;   /* main pink */
  --bg: #fff4f7;       /* page background */
  --over: #c2234f;     /* over-budget color */
}
```

## Deploying

Run `npm run build`, then upload the generated `dist/` folder to any static host, such as Netlify, Vercel, Cloudflare Pages or GitHub Pages. If you deploy to a GitHub Pages sub-path (for example `username.github.io/repo-name/`), add `base: '/repo-name/'` to `vite.config.js`.

## Good to know

- **Data storage:** budgets and expenses are saved in your browser's `localStorage`. They stay on that device and browser, don't sync between devices, and are erased if you clear your browser data. Use the Excel or text export to keep backups.
- **Week picker support:** the calendar uses `<input type="week">`, which works in Chrome, Edge and most mobile browsers. Desktop Safari and Firefox show a plain text box where you type a week like `2026-W44`. Prev, Next and This week work everywhere.
- **Currency:** amounts are formatted as Philippine Peso (PHP) using `Intl.NumberFormat('en-PH')`.

## License

Add your preferred license here (for example, MIT).
