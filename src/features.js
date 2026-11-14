// Wallets, income, bills, savings goals, category limits, trends and the year in review.
// Pure functions over the saved data, so they can be unit tested.
import { CATS, r2, sum, weekKey, mondayOf, addDays, isoDate, monthOfWeek, rateWeek, snap } from './utils.js';
import { EMPTY, uid } from './data.js';

const cents = (n) => Math.round((+n || 0) * 100);
export const fromIso = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** Week key and day index (Mon = 0) for a YYYY-MM-DD date. */
export const placeOf = (iso) => {
  const d = fromIso(iso);
  return { key: weekKey(d), day: (d.getDay() + 6) % 7 };
};
export const dateOfEntry = (key, dayIdx) => isoDate(addDays(mondayOf(key), dayIdx));

// ---- Wallets ----
/** Each wallet with its current balance: opening + income − expenses ± transfers. */
export function walletBalances(db) {
  const bal = new Map(db.wallets.map((w) => [w.id, cents(w.opening)]));
  const add = (id, c) => {
    if (id != null && bal.has(id)) bal.set(id, bal.get(id) + c);
  };
  for (const w of Object.values(db.weeks)) {
    for (const i of w.items) add(i.walletId, -cents(i.amt));
    for (const i of w.income || []) add(i.walletId, cents(i.amt));
  }
  for (const t of db.transfers) {
    add(t.from, -cents(t.amt));
    add(t.to, cents(t.amt));
  }
  return db.wallets.map((w) => ({ ...w, balance: bal.get(w.id) / 100 }));
}
/** Money you actually have: every wallet except credit cards (whose balance is what you owe). */
export const onHand = (rows) =>
  sum(
    rows.filter((w) => w.kind !== 'card'),
    (w) => w.balance,
  );

/** Removes a wallet and every reference to it (entries stay, they just stop counting against a wallet). */
export function removeWallet(db, id) {
  const strip = (list) =>
    list?.map((i) => {
      if (i.walletId !== id) return i;
      const { walletId: _w, ...rest } = i;
      return rest;
    });
  return {
    ...db,
    wallets: db.wallets.filter((w) => w.id !== id),
    transfers: db.transfers.filter((t) => t.from !== id && t.to !== id),
    recurring: strip(db.recurring),
    bills: strip(db.bills),
    weeks: Object.fromEntries(
      Object.entries(db.weeks).map(([k, w]) => [k, { ...w, items: strip(w.items), ...(w.income ? { income: strip(w.income) } : {}) }]),
    ),
  };
}

// ---- Adding dated entries (income, bill payments, CSV rows) ----
/** Adds expenses and income, each with a YYYY-MM-DD `date`, into the right weeks. */
export function addEntries(db, entries) {
  const weeks = { ...db.weeks };
  for (const e of entries) {
    const { key, day } = placeOf(e.date);
    const w = weeks[key] || EMPTY;
    const { date: _d, kind, ...rest } = e;
    const entry = { id: uid(), ...rest, day };
    weeks[key] = kind === 'income' ? { ...w, income: [...(w.income || []), entry] } : { ...w, items: [...w.items, entry] };
  }
  return { ...db, weeks };
}

// ---- Bills ----
const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate();
/** Due dates of one bill between two YYYY-MM-DD dates (inclusive). A due day of 31 becomes the 30th, 28th… in shorter months. */
export function billDueDates(bill, from, to) {
  if (bill.repeat === 'once') return bill.firstDue >= from && bill.firstDue <= to ? [bill.firstDue] : [];
  const first = fromIso(bill.firstDue);
  const want = first.getDate();
  const out = [];
  const start = fromIso(from > bill.firstDue ? from : bill.firstDue);
  for (let y = start.getFullYear(), m = start.getMonth(); ; m++) {
    const d = new Date(y, m, Math.min(want, lastDayOf(y, m)));
    const iso = isoDate(d);
    if (iso > to) break;
    if (iso >= from && iso >= bill.firstDue) out.push(iso);
  }
  return out;
}
/** Index of bill payments: "billId|YYYY-MM-DD" → the expense that paid it. */
export function billPayments(db) {
  const paid = new Map();
  for (const w of Object.values(db.weeks)) for (const i of w.items) if (i.billId != null) paid.set(`${i.billId}|${i.billDue}`, i);
  return paid;
}
/** Every bill occurrence between two dates, earliest first, with whether it's been paid. */
export function billsBetween(db, from, to, paid = billPayments(db)) {
  return db.bills
    .flatMap((bill) => billDueDates(bill, from, to).map((due) => ({ bill, due, paidBy: paid.get(`${bill.id}|${due}`) || null })))
    .sort((a, b) => a.due.localeCompare(b.due) || a.bill.name.localeCompare(b.bill.name));
}
export const nextDue = (bill, today) => billDueDates(bill, today, isoDate(addDays(fromIso(today), 400)))[0] || null;

// ---- Savings goals ----
export function goalPlan(goal, today) {
  const saved = sum(goal.contributions);
  const left = Math.max(0, r2(goal.target - saved));
  const done = left === 0;
  let weeksLeft = null,
    perWeek = null;
  if (goal.due && !done) {
    const days = Math.round((fromIso(goal.due) - fromIso(today)) / 864e5);
    weeksLeft = Math.max(1, Math.ceil(days / 7));
    perWeek = r2(left / weeksLeft);
  }
  return {
    saved,
    left,
    done,
    weeksLeft,
    perWeek,
    late: !!goal.due && !done && goal.due < today,
    pct: Math.min(100, (saved / goal.target) * 100),
  };
}

// ---- Category limits ----
/** Spending against each weekly category limit, biggest share first. */
export function categoryStatus(items, limits) {
  return CATS.filter((c) => limits[c] > 0)
    .map((c) => {
      const spent = sum(items.filter((i) => i.cat === c));
      return { cat: c, spent, limit: limits[c], left: r2(limits[c] - spent), over: spent > limits[c], pct: (spent / limits[c]) * 100 };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ---- Trends and year in review ----
/** Spending per category for the `n` weeks ending at `endKey`, oldest first. */
export function weeklyTrend(weeks, endKey, n = 12) {
  const mon = mondayOf(endKey);
  return Array.from({ length: n }, (_, i) => {
    const key = weekKey(addDays(mon, (i - n + 1) * 7));
    const items = (weeks[key] || EMPTY).items;
    const byCat = Object.fromEntries(CATS.map((c) => [c, sum(items.filter((x) => x.cat === c))]));
    return { key, mon: mondayOf(key), byCat, total: sum(items) };
  });
}

/** Totals for one year. A week belongs to the year (and month) its Thursday falls in, like the monthly view. */
export function yearReview(db, year, debtRows = []) {
  const keys = Object.keys(db.weeks)
    .filter((k) => monthOfWeek(k).y === year)
    .sort();
  const months = Array.from({ length: 12 }, () => ({ spent: 0, income: 0 }));
  const byCat = Object.fromEntries(CATS.map((c) => [c, 0]));
  let spentC = 0,
    incomeC = 0,
    biggest = null,
    best = null,
    budgeted = 0,
    within = 0,
    debtC = 0;
  for (const key of keys) {
    const w = db.weeks[key];
    const mo = monthOfWeek(key).mo;
    for (const i of w.items) {
      const c = cents(i.amt);
      spentC += c;
      byCat[i.cat] += c;
      months[mo].spent += c;
      if (i.debtId != null) debtC += c;
      if (!biggest || i.amt > biggest.amt) biggest = { ...i, key };
    }
    for (const i of w.income || []) {
      incomeC += cents(i.amt);
      months[mo].income += cents(i.amt);
    }
    const s = snap(w, key);
    if (s.b > 0) {
      budgeted++;
      if (s.rem >= 0) within++;
    }
    const r = rateWeek(s, debtRows);
    if (r && (!best || r.score > best.score)) best = { key, score: r.score, stars: r.stars };
  }
  const saved = sum(
    db.goals.flatMap((g) => g.contributions.filter((c) => c.date.startsWith(String(year)))),
    (c) => c.amt,
  );
  const activeWeeks = keys.filter((k) => db.weeks[k].items.length).length;
  return {
    year,
    spent: spentC / 100,
    income: incomeC / 100,
    saved,
    debtPaid: debtC / 100,
    activeWeeks,
    avgWeek: activeWeeks ? r2(spentC / 100 / activeWeeks) : 0,
    budgeted,
    within,
    biggest,
    best,
    byCat: Object.entries(byCat)
      .map(([c, v]) => [c, v / 100])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]),
    months: months.map((m) => ({ spent: m.spent / 100, income: m.income / 100 })),
  };
}
/** Years that have any data, newest first (always includes the current year). */
export function yearsWithData(db, now = new Date()) {
  const ys = new Set([now.getFullYear()]);
  for (const k of Object.keys(db.weeks)) ys.add(monthOfWeek(k).y);
  return [...ys].sort((a, b) => b - a);
}
