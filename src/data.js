// Saved data: loading, validating, migrating, importing and backing up.
// Everything here is pure (no React) so it can be unit tested.
import { CATS, CURRENCIES, r2, findDebt } from './utils.js';

/**
 * @typedef {string|number} Id
 * @typedef {{ id: Id, name: string, amt: number, cat: string, day: number, debtId?: Id, recurringId?: Id }} Item
 * @typedef {{ budget: number, items: Item[], applied?: Id[] }} Week
 * @typedef {{ id: Id, lender: string, purpose: string, amount: number }} Debt
 * @typedef {{ id: Id, amt: number, date: string }} Repayment
 * @typedef {{ id: Id, person: string, amount: number, borrowedOn: string, promisedOn: string, paid: boolean, payments: Repayment[] }} Owed
 * @typedef {{ id: Id, name: string, amt: number, cat: string, day: number, start: string, end: string }} Rule
 * @typedef {{ v: number, weeks: Record<string, Week>, accent: string, mode: 'auto'|'light'|'dark', email: string,
 *   debts: Debt[], owed: Owed[], recurring: Rule[], currency: string, carryOver: boolean, lastBackup: string }} Db
 */

// Same key as before so people who already use the app keep their data.
export const KEY = 'pinkBudgetReactV1';
export const VERSION = 2;
export const EMPTY = Object.freeze({ budget: 0, items: [] });
export const DEFAULTS = Object.freeze({
  v: VERSION,
  weeks: {},
  accent: '#f4a6bd',
  mode: 'auto',
  email: '',
  debts: [],
  owed: [],
  recurring: [],
  currency: 'PHP',
  carryOver: false,
  lastBackup: '',
});

export const uid = () =>
  globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const HEX = /^#[0-9a-f]{6}$/i;
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
const text = (x, max) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '').trim().slice(0, max);
const amount = (x) => {
  const n = r2(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const okId = (x) => (typeof x === 'string' && x.length > 0 && x.length < 100) || (typeof x === 'number' && Number.isFinite(x));
const day = (x) => (Number.isInteger(+x) && +x >= 0 && +x <= 6 ? +x : 0);

// Gives every record in a collection a usable, unique id (keeping the old one when it's fine).
function ids() {
  const seen = new Set();
  return (x) => {
    const v = okId(x) && !seen.has(x) ? x : uid();
    seen.add(v);
    return v;
  };
}

/**
 * Cleans up anything read from storage or a backup file, so a damaged or older
 * save can never crash the app. Unknown fields are dropped, bad values get defaults,
 * and links (debtId, recurringId) that point nowhere are removed.
 * @returns {Db}
 */
export function normalize(raw) {
  const o = obj(raw) || {};
  const debtId = ids(),
    owedId = ids(),
    ruleId = ids(),
    itemId = ids();

  const debts = arr(o.debts)
    .map(obj)
    .filter(Boolean)
    .map((d) => ({ id: debtId(d.id), lender: text(d.lender, 60) || 'Unknown', purpose: text(d.purpose, 80), amount: amount(d.amount) }))
    .filter((d) => d.amount > 0);
  const debtIds = new Set(debts.map((d) => d.id));

  const recurring = arr(o.recurring)
    .map(obj)
    .filter(Boolean)
    .map((r) => ({
      id: ruleId(r.id),
      name: text(r.name, 60) || 'Expense',
      amt: amount(r.amt),
      cat: CATS.includes(r.cat) ? r.cat : 'Other',
      day: day(r.day),
      start: WEEK.test(r.start) ? r.start : '',
      end: WEEK.test(r.end) ? r.end : '',
    }))
    .filter((r) => r.amt > 0 && r.start);
  const ruleIds = new Set(recurring.map((r) => r.id));

  const owed = arr(o.owed)
    .map(obj)
    .filter(Boolean)
    .map((x) => ({
      id: owedId(x.id),
      person: text(x.person, 60) || 'Someone',
      amount: amount(x.amount),
      borrowedOn: DATE.test(x.borrowedOn) ? x.borrowedOn : '',
      promisedOn: DATE.test(x.promisedOn) ? x.promisedOn : '',
      paid: x.paid === true,
      payments: arr(x.payments)
        .map(obj)
        .filter(Boolean)
        .map((p) => ({ id: okId(p.id) ? p.id : uid(), amt: amount(p.amt), date: DATE.test(p.date) ? p.date : '' }))
        .filter((p) => p.amt > 0),
    }))
    .filter((x) => x.amount > 0);

  const weeks = {};
  for (const [k, raw] of Object.entries(obj(o.weeks) || {})) {
    const w = obj(raw);
    if (!WEEK.test(k) || !w) continue;
    const items = arr(w.items)
      .map(obj)
      .filter(Boolean)
      .map((i) => {
        const it = {
          id: itemId(i.id),
          name: text(i.name, 60) || 'Expense',
          amt: amount(i.amt),
          cat: CATS.includes(i.cat) ? i.cat : 'Other',
          day: day(i.day),
        };
        if (debtIds.has(i.debtId)) it.debtId = i.debtId;
        if (ruleIds.has(i.recurringId)) it.recurringId = i.recurringId;
        return it;
      })
      .filter((i) => i.amt > 0);
    const applied = arr(w.applied).filter((x) => ruleIds.has(x));
    weeks[k] = { budget: Math.max(0, r2(w.budget)) || 0, items, ...(applied.length ? { applied } : {}) };
  }

  return {
    v: VERSION,
    weeks,
    debts,
    owed,
    recurring,
    accent: HEX.test(o.accent) ? o.accent.toLowerCase() : DEFAULTS.accent,
    mode: ['auto', 'light', 'dark'].includes(o.mode) ? o.mode : 'auto',
    email: text(o.email, 254),
    currency: CURRENCIES.some(([c]) => c === o.currency) ? o.currency : 'PHP',
    carryOver: o.carryOver === true,
    lastBackup: DATE.test(o.lastBackup) ? o.lastBackup : '',
  };
}

/**
 * Reads saved data. Never throws and never silently throws data away:
 * an unreadable save, or one from an older version, is copied to a backup key first.
 * @returns {{ db: Db, warning?: string }}
 */
export function load(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return {
      db: normalize({}),
      warning:
        'This browser is blocking storage, so your changes won’t be saved after you close the page. Download a full backup before leaving.',
    };
  }
  if (raw == null) return { db: normalize({}) };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    stash(storage, raw, 'unreadable-' + Date.now());
    return {
      db: normalize({}),
      warning:
        'Your saved data couldn’t be read, so the app started fresh. The old copy was kept in this browser, so don’t clear your browser data yet.',
    };
  }
  if (!obj(parsed) || parsed.v !== VERSION) stash(storage, raw, 'v' + (obj(parsed)?.v || 1));
  return { db: normalize(parsed) };
}

function stash(storage, raw, tag) {
  try {
    if (storage.getItem(`${KEY}:backup:${tag}`) == null) storage.setItem(`${KEY}:backup:${tag}`, raw);
  } catch {
    /* full or blocked */
  }
}

/** @returns {boolean} false when the browser refused to save (full or blocked). */
export function save(db, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, typeof db === 'string' ? db : JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

// ---- Debt balances ----
export function debtRowsOf(db) {
  const t = {};
  for (const w of Object.values(db.weeks))
    for (const i of w.items) {
      if (i.debtId == null) continue;
      const e = (t[i.debtId] ||= { cents: 0, count: 0 });
      e.cents += Math.round(i.amt * 100);
      e.count += 1;
    }
  return db.debts.map((d) => {
    const st = t[d.id] || { cents: 0, count: 0 };
    const paid = st.cents / 100;
    return { ...d, paid, count: st.count, left: Math.max(0, r2(d.amount - paid)) };
  });
}

// ---- Importing a .txt report ----
/**
 * Loads a parsed .txt report into the data: everything, only the week's expenses, or only the debt lists.
 * Debts in the file that match a saved debt (same lender and purpose) keep the saved debt's id, so
 * payments recorded in other weeks stay linked. Payments in the imported week find their debt the same way.
 * @returns {Db}
 */
export function applyReport(db, p, scope) {
  const wantEx = scope !== 'debts',
    wantDebt = scope !== 'expenses';
  const next = { ...db };
  if (wantDebt) {
    const unused = [...db.debts];
    next.debts = p.debts.map((x) => {
      const match = findDebt(unused, x.lender, x.purpose);
      if (match) unused.splice(unused.indexOf(match), 1);
      return { id: match ? match.id : uid(), lender: x.lender, purpose: x.purpose, amount: x.amount };
    });
    next.owed = p.owed.map((o) => ({
      ...o,
      id: uid(),
      payments: (o.payments || []).map((pm) => ({ id: uid(), amt: pm.amt, date: pm.date || '' })),
    }));
    // Payments elsewhere whose debt is no longer listed become regular expenses.
    const kept = new Set(next.debts.map((d) => d.id));
    next.weeks = Object.fromEntries(
      Object.entries(db.weeks).map(([k, w]) => [
        k,
        w.items.some((i) => i.debtId != null && !kept.has(i.debtId))
          ? {
              ...w,
              items: w.items.map((i) => {
                if (i.debtId == null || kept.has(i.debtId)) return i;
                const { debtId: _drop, ...rest } = i;
                return rest;
              }),
            }
          : w,
      ]),
    );
  }
  if (wantEx) {
    const items = p.items.map((it) => {
      const d = it.lender ? findDebt(next.debts, it.lender, it.purpose) : undefined;
      return { id: uid(), name: it.name, cat: it.cat, amt: it.amt, day: it.day, ...(d ? { debtId: d.id } : {}) };
    });
    // Mark every recurring rule as already applied, so they don't get added on top of the imported list.
    const applied = db.recurring.map((r) => r.id);
    next.weeks = { ...(next.weeks || db.weeks), [p.key]: { budget: p.budget, items, ...(applied.length ? { applied } : {}) } };
  }
  return next;
}

// ---- Full backup (.json) ----
export const APP_ID = 'weekly-budget-planner';
export const backupJson = (db) => JSON.stringify({ app: APP_ID, exportedAt: new Date().toISOString(), ...db }, null, 2);
/** @returns {Db|null} */
export function parseBackup(textIn) {
  let o;
  try {
    o = JSON.parse(textIn);
  } catch {
    return null;
  }
  if (!obj(o) || (o.app !== APP_ID && !obj(o.weeks))) return null;
  return normalize(o);
}

// ---- Recurring expenses ----
export const rulesFor = (db, key) => db.recurring.filter((r) => r.start <= key && (!r.end || key <= r.end));

/** Adds this week's copies of any recurring expenses that haven't been added yet. Returns the same object when nothing changes. */
export function applyRecurring(db, key) {
  const w = db.weeks[key] || EMPTY;
  const applied = w.applied || [];
  const todo = rulesFor(db, key).filter((r) => !applied.includes(r.id));
  if (!todo.length) return db;
  const items = todo.map((r) => ({ id: uid(), name: r.name, amt: r.amt, cat: r.cat, day: r.day, recurringId: r.id }));
  return { ...db, weeks: { ...db.weeks, [key]: { ...w, items: [...w.items, ...items], applied: [...applied, ...todo.map((r) => r.id)] } } };
}

/** Stops a rule after `key`: keeps it in weeks up to and including `key`, removes it from later weeks. */
export function stopRule(db, ruleId, key) {
  const weeks = Object.fromEntries(
    Object.entries(db.weeks).map(([k, w]) => [
      k,
      k > key && w.items.some((i) => i.recurringId === ruleId) ? { ...w, items: w.items.filter((i) => i.recurringId !== ruleId) } : w,
    ]),
  );
  return { ...db, weeks, recurring: db.recurring.map((r) => (r.id === ruleId ? { ...r, end: key } : r)) };
}
