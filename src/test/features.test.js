import { describe, it, expect } from 'vitest';
import { normalize, load, KEY, VERSION, applyRecurring, stopRule, applyReport } from '../data.js';
import {
  walletBalances,
  onHand,
  removeWallet,
  addEntries,
  placeOf,
  billDueDates,
  billsBetween,
  nextDue,
  goalPlan,
  categoryStatus,
  weeklyTrend,
  yearReview,
} from '../features.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('upgrading saved data', () => {
  it('adds the new sections to a version 2 save and keeps a copy of it', () => {
    const v2 = { v: 2, weeks: { '2026-W10': { budget: 100, items: [{ id: 'a', name: 'x', amt: 5, cat: 'Food', day: 0 }] } } };
    const st = memory({ [KEY]: JSON.stringify(v2) });
    const { db } = load(st);
    expect(db.v).toBe(VERSION);
    expect(db).toMatchObject({ wallets: [], transfers: [], goals: [], bills: [], catLimits: {} });
    expect(db.weeks['2026-W10'].items[0].name).toBe('x');
    expect(st.getItem(KEY + ':backup:v2')).toBe(JSON.stringify(v2));
  });

  it('drops links to wallets and bills that don’t exist', () => {
    const db = normalize({
      wallets: [{ id: 'w', name: 'Cash', kind: 'cash', opening: 100 }],
      bills: [{ id: 'b', name: 'Rent', amt: 10, firstDue: '2026-01-05' }],
      weeks: {
        '2026-W10': {
          budget: 0,
          items: [
            { id: 1, name: 'ok', amt: 1, cat: 'Food', day: 0, walletId: 'w', billId: 'b', billDue: '2026-03-05' },
            { id: 2, name: 'gone', amt: 1, cat: 'Food', day: 0, walletId: 'nope', billId: 'nope', billDue: '2026-03-05' },
          ],
          income: [{ id: 3, name: 'Pay', amt: 50, day: 1, walletId: 'nope' }],
        },
      },
      transfers: [{ id: 't', from: 'w', to: 'nope', amt: 5, date: '2026-03-01' }],
      catLimits: { Food: '1500', Nope: 5, Fun: -1 },
    });
    const [ok, gone] = db.weeks['2026-W10'].items;
    expect(ok).toMatchObject({ walletId: 'w', billId: 'b', billDue: '2026-03-05' });
    expect(gone.walletId).toBeUndefined();
    expect(gone.billId).toBeUndefined();
    expect(db.weeks['2026-W10'].income[0].walletId).toBeUndefined();
    expect(db.transfers).toEqual([]);
    expect(db.catLimits).toEqual({ Food: 1500 });
  });

  it('keeps a week’s income when a .txt report replaces its expenses', () => {
    const db = normalize({ weeks: { '2026-W10': { budget: 1, items: [], income: [{ id: 'i', name: 'Pay', amt: 500, day: 0 }] } } });
    const next = applyReport(db, { key: '2026-W10', budget: 900, items: [], debts: [], owed: [] }, 'expenses');
    expect(next.weeks['2026-W10'].income).toHaveLength(1);
    expect(next.weeks['2026-W10'].budget).toBe(900);
  });
});

describe('wallets', () => {
  const db = normalize({
    wallets: [
      { id: 'cash', name: 'Cash', kind: 'cash', opening: 500 },
      { id: 'gcash', name: 'GCash', kind: 'ewallet', opening: 1000 },
      { id: 'card', name: 'Visa', kind: 'card', opening: -200 },
    ],
    weeks: {
      '2026-W10': {
        budget: 0,
        items: [
          { id: 1, name: 'Lunch', amt: 150.25, cat: 'Food', day: 0, walletId: 'cash' },
          { id: 2, name: 'Shoes', amt: 999.99, cat: 'Shopping', day: 1, walletId: 'card' },
          { id: 3, name: 'Untracked', amt: 50, cat: 'Food', day: 1 },
        ],
        income: [{ id: 4, name: 'Allowance', amt: 2000, day: 0, walletId: 'gcash' }],
      },
    },
    transfers: [{ id: 't', from: 'gcash', to: 'cash', amt: 300, date: '2026-03-03' }],
  });

  it('adds up income, spending and transfers to the cent', () => {
    const rows = walletBalances(db);
    expect(rows.map((w) => [w.id, w.balance])).toEqual([
      ['cash', 649.75],
      ['gcash', 2700],
      ['card', -1199.99],
    ]);
  });

  it('leaves credit cards out of money on hand', () => {
    expect(onHand(walletBalances(db))).toBe(3349.75);
  });

  it('deleting a wallet keeps the expenses and drops its transfers', () => {
    const next = removeWallet(db, 'cash');
    expect(next.wallets.map((w) => w.id)).toEqual(['gcash', 'card']);
    expect(next.transfers).toEqual([]);
    expect(next.weeks['2026-W10'].items[0].walletId).toBeUndefined();
    expect(next.weeks['2026-W10'].items).toHaveLength(3);
  });
});

describe('dated entries', () => {
  it('puts each entry in the right week and day', () => {
    expect(placeOf('2026-11-14')).toEqual({ key: '2026-W46', day: 5 }); // Saturday
    expect(placeOf('2027-01-01')).toEqual({ key: '2026-W53', day: 4 });
    const db = addEntries(normalize({}), [
      { date: '2026-11-10', kind: 'expense', name: 'Bus', amt: 15, cat: 'Transport' },
      { date: '2026-11-13', kind: 'income', name: 'Pay', amt: 500 },
    ]);
    expect(db.weeks['2026-W46'].items[0]).toMatchObject({ name: 'Bus', day: 1, cat: 'Transport' });
    expect(db.weeks['2026-W46'].income[0]).toMatchObject({ name: 'Pay', day: 4 });
    expect(db.weeks['2026-W46'].items[0].date).toBeUndefined();
  });
});

describe('recurring income', () => {
  it('is added to the income list, not to expenses', () => {
    const db = normalize({ recurring: [{ id: 'r', kind: 'income', name: 'Allowance', amt: 1500, day: 0, start: '2026-W10' }] });
    const w = applyRecurring(db, '2026-W11').weeks['2026-W11'];
    expect(w.items).toEqual([]);
    expect(w.income[0]).toMatchObject({ name: 'Allowance', amt: 1500, recurringId: 'r' });
  });
  it('is removed from later weeks when stopped', () => {
    let db = normalize({ recurring: [{ id: 'r', kind: 'income', name: 'A', amt: 1, day: 0, start: '2026-W10' }] });
    db = applyRecurring(applyRecurring(db, '2026-W10'), '2026-W12');
    db = stopRule(db, 'r', '2026-W10');
    expect(db.weeks['2026-W10'].income).toHaveLength(1);
    expect(db.weeks['2026-W12'].income).toHaveLength(0);
  });
});

describe('bills', () => {
  const monthly = { id: 'b', name: 'Rent', amt: 5000, cat: 'Bills', firstDue: '2026-01-31', repeat: 'monthly' };
  it('repeats monthly and moves the 31st to the end of short months', () => {
    expect(billDueDates(monthly, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(billDueDates({ ...monthly, firstDue: '2028-01-31' }, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']); // leap year
  });
  it('never shows dates before the first due date', () => {
    expect(billDueDates(monthly, '2025-11-01', '2026-01-30')).toEqual([]);
  });
  it('handles one-time bills', () => {
    const once = { ...monthly, repeat: 'once', firstDue: '2026-03-10' };
    expect(billDueDates(once, '2026-03-09', '2026-03-15')).toEqual(['2026-03-10']);
    expect(billDueDates(once, '2026-03-11', '2026-04-15')).toEqual([]);
    expect(nextDue(once, '2026-03-11')).toBeNull();
  });
  it('knows which ones are paid', () => {
    let db = normalize({ bills: [monthly] });
    db = addEntries(db, [
      { date: '2026-02-28', kind: 'expense', name: 'Rent', amt: 5000, cat: 'Bills', billId: 'b', billDue: '2026-02-28' },
    ]);
    const occ = billsBetween(db, '2026-02-01', '2026-03-31');
    expect(occ.map((o) => [o.due, !!o.paidBy])).toEqual([
      ['2026-02-28', true],
      ['2026-03-31', false],
    ]);
  });
});

describe('savings goals', () => {
  const goal = { id: 'g', name: 'Phone', target: 12000, due: '2026-12-31', contributions: [{ amt: 2000 }, { amt: 1000 }] };
  it('works out how much to save each week', () => {
    const p = goalPlan(goal, '2026-11-14'); // 47 days left → 7 weeks
    expect(p).toMatchObject({ saved: 3000, left: 9000, weeksLeft: 7, done: false, late: false });
    expect(p.perWeek).toBe(1285.71);
  });
  it('is done once the target is reached, and late after the date', () => {
    expect(goalPlan({ ...goal, contributions: [{ amt: 12000 }] }, '2026-11-14')).toMatchObject({ done: true, perWeek: null });
    expect(goalPlan(goal, '2027-01-05')).toMatchObject({ late: true, weeksLeft: 1, perWeek: 9000 });
    expect(goalPlan({ ...goal, due: '' }, '2026-11-14')).toMatchObject({ perWeek: null, left: 9000 });
  });
});

describe('category limits', () => {
  it('shows each limited category, fullest first', () => {
    const items = [
      { cat: 'Food', amt: 1600 },
      { cat: 'Fun', amt: 100 },
      { cat: 'Transport', amt: 50 },
    ];
    const rows = categoryStatus(items, { Food: 1500, Fun: 1000 });
    expect(rows.map((r) => [r.cat, r.over, r.left])).toEqual([
      ['Food', true, -100],
      ['Fun', false, 900],
    ]);
  });
});

describe('trends and year in review', () => {
  const db = normalize({
    weeks: {
      '2026-W01': {
        budget: 1000,
        items: [{ id: 1, name: 'Rice', amt: 300, cat: 'Food', day: 0 }],
        income: [{ id: 9, name: 'Pay', amt: 2000, day: 0 }],
      },
      '2026-W02': {
        budget: 500,
        items: [
          { id: 2, name: 'TV', amt: 900, cat: 'Shopping', day: 2 },
          { id: 3, name: 'Bus', amt: 20, cat: 'Transport', day: 3 },
        ],
      },
      '2025-W40': { budget: 0, items: [{ id: 4, name: 'Old', amt: 99, cat: 'Food', day: 0 }] },
    },
    goals: [
      {
        id: 'g',
        name: 'Trip',
        target: 5000,
        contributions: [
          { amt: 700, date: '2026-01-05' },
          { amt: 1, date: '2025-12-01' },
        ],
      },
    ],
  });

  it('lists the last weeks oldest first, including empty ones', () => {
    const t = weeklyTrend(db.weeks, '2026-W03', 4);
    expect(t.map((w) => w.key)).toEqual(['2025-W52', '2026-W01', '2026-W02', '2026-W03']);
    expect(t[2]).toMatchObject({ total: 920 });
    expect(t[2].byCat).toMatchObject({ Shopping: 900, Transport: 20, Food: 0 });
  });

  it('sums up a year', () => {
    const r = yearReview(db, 2026);
    expect(r).toMatchObject({ spent: 1220, income: 2000, saved: 700, activeWeeks: 2, avgWeek: 610, budgeted: 2, within: 1 });
    expect(r.biggest).toMatchObject({ name: 'TV', amt: 900 });
    expect(r.byCat[0]).toEqual(['Shopping', 900]);
    expect(r.months[0]).toEqual({ spent: 1220, income: 2000 });
    expect(yearReview(db, 2025).spent).toBe(99);
  });
});
