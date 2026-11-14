import { describe, it, expect, beforeEach } from 'vitest';
import {
  weekKey,
  mondayOf,
  shiftWeek,
  sum,
  snap,
  carryInto,
  rateWeek,
  esc,
  unesc,
  txtReport,
  parseReport,
  setCurrency,
  fmt,
  findDebt,
  owedLeft,
  owedDone,
  contrast,
  onAccent,
  weekKeysOfMonth,
  monthOfWeek,
} from '../utils.js';

beforeEach(() => setCurrency('PHP'));

describe('week math', () => {
  it.each([
    [new Date(2026, 0, 1), '2026-W01'], // Thursday
    [new Date(2027, 0, 1), '2026-W53'], // Friday, belongs to the last week of 2026
    [new Date(2024, 11, 30), '2025-W01'], // Monday that starts 2025's first week
    [new Date(2020, 11, 31), '2020-W53'],
  ])('weekKey(%s) is %s', (d, k) => expect(weekKey(d)).toBe(k));

  it('mondayOf is the inverse of weekKey for every week of several years', () => {
    for (let d = new Date(2023, 0, 2); d < new Date(2028, 0, 1); d.setDate(d.getDate() + 7)) {
      expect(mondayOf(weekKey(d)).toDateString()).toBe(d.toDateString());
    }
  });

  it('shiftWeek crosses year boundaries', () => {
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
  });

  it('every week lands in exactly one month', () => {
    const seen = new Set();
    for (let mo = 0; mo < 12; mo++) {
      for (const k of weekKeysOfMonth(2026, mo)) {
        expect(seen.has(k)).toBe(false);
        expect(monthOfWeek(k)).toEqual({ y: 2026, mo });
        seen.add(k);
      }
    }
    expect(seen.size).toBe(53);
  });
});

describe('money', () => {
  it('sums in centavos so there is no floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum([{ amt: 0.1 }, { amt: 0.2 }])).toBe(0.3);
  });

  it('a week spent exactly to the budget is not "over by ₱0.00"', () => {
    const s = snap(
      {
        budget: 0.3,
        items: [
          { id: 1, amt: 0.1, day: 0 },
          { id: 2, amt: 0.2, day: 1 },
        ],
      },
      '2026-W10',
    );
    expect(s.rem).toBe(0);
  });

  it('formats in the chosen currency', () => {
    expect(fmt(1234.5)).toMatch(/₱1,234\.50/);
    setCurrency('USD');
    expect(fmt(5)).toMatch(/\$5\.00/);
    setCurrency('nonsense');
    expect(fmt(5)).toMatch(/₱/);
  });
});

describe('carry-over', () => {
  const weeks = {
    '2026-W08': { budget: 1000, items: [{ amt: 900 }] }, // +100
    '2026-W09': { budget: 1000, items: [{ amt: 1050 }] }, // +100 carried in, so +50
    '2026-W10': { budget: 1000, items: [] },
  };
  it('is zero when turned off', () => expect(carryInto(weeks, '2026-W10', false)).toBe(0));
  it('chains through consecutive budgeted weeks', () => expect(carryInto(weeks, '2026-W10', true)).toBe(50));
  it('stops at a week with no budget', () => expect(carryInto(weeks, '2026-W08', true)).toBe(0));
  it('carries overspending as a negative amount', () => {
    expect(carryInto({ '2026-W09': { budget: 500, items: [{ amt: 700 }] } }, '2026-W10', true)).toBe(-200);
  });
  it('is added to the week’s budget', () => {
    const s = snap({ budget: 1000, items: [] }, '2026-W10', 50);
    expect(s.b).toBe(1050);
    expect(s.base).toBe(1000);
  });
});

describe('rateWeek', () => {
  const wk = (budget, amts, extra = {}) =>
    snap({ budget, items: amts.map((amt, i) => ({ id: i, amt, day: i % 7, ...extra })) }, '2026-W10');
  it('needs a budget and expenses', () => {
    expect(rateWeek(wk(0, [10]))).toBeNull();
    expect(rateWeek(wk(100, []))).toBeNull();
  });
  it('gives 5 stars for a well-spread week under budget with no debts', () => {
    expect(rateWeek(wk(1000, [100, 100, 100, 100])).stars).toBe(5);
  });
  it('scores lower when over budget', () => {
    expect(rateWeek(wk(100, [80, 80, 80])).score).toBeLessThan(rateWeek(wk(1000, [80, 80, 80])).score);
  });
  it('notices debt payments when you owe', () => {
    const debts = [{ id: 'd', left: 500 }];
    expect(rateWeek(wk(1000, [100]), debts).notes).toContain('No debt payment yet this week');
    expect(rateWeek(wk(1000, [100], { debtId: 'd' }), debts).paid).toBe(100);
  });
});

describe('text escaping', () => {
  it('round-trips every special character', () => {
    const s = 'Snacks [work] (team): a|b → c \\ d';
    expect(unesc(esc(s))).toBe(s);
  });
});

describe('debts and repayments', () => {
  const debts = [
    { id: 1, lender: 'Mom', purpose: 'Rent' },
    { id: 2, lender: 'Mom', purpose: 'Tuition' },
  ];
  it('tells two debts to the same lender apart by purpose', () => {
    expect(findDebt(debts, 'Mom', 'Tuition').id).toBe(2);
    expect(findDebt(debts, 'mom', 'rent').id).toBe(1);
  });
  it('falls back to lender only for old reports with no purpose', () => {
    expect(findDebt(debts, 'Mom', undefined).id).toBe(1);
    expect(findDebt(debts, 'Dad', undefined)).toBeUndefined();
  });
  it('tracks partial repayments', () => {
    const o = { amount: 1000, paid: false, payments: [{ amt: 300 }, { amt: 200.5 }] };
    expect(owedLeft(o)).toBe(499.5);
    expect(owedDone(o)).toBe(false);
    expect(owedDone({ ...o, payments: [...o.payments, { amt: 499.5 }] })).toBe(true);
    expect(owedLeft({ ...o, paid: true })).toBe(0);
  });
});

describe('.txt report round trip', () => {
  const debts = [
    { id: 'a', lender: 'Ate Joy (cousin)', purpose: 'Tuition [2nd sem]', amount: 5000, paid: 1000, left: 4000 },
    { id: 'b', lender: 'Ate Joy (cousin)', purpose: 'Phone', amount: 800, paid: 0, left: 800 },
  ];
  const owed = [
    {
      id: 'o',
      person: 'Mark: from work',
      amount: 600,
      borrowedOn: '2026-03-01',
      promisedOn: '2026-03-20',
      paid: false,
      payments: [{ amt: 150, date: '2026-03-05' }],
    },
  ];
  const items = [
    { id: 1, name: 'Snacks [office] | team', amt: 120.5, cat: 'Food', day: 0 },
    { id: 2, name: 'Payment → Joy', amt: 1000, cat: 'Debt', day: 2, debtId: 'a' },
    { id: 3, name: 'Jeep', amt: 0.1, cat: 'Transport', day: 2 },
    { id: 4, name: 'Jeep', amt: 0.2, cat: 'Transport', day: 6 },
  ];
  const s = snap({ budget: 3500, items }, '2026-W10');

  it('reads back exactly what it wrote, including awkward characters', () => {
    const p = parseReport(txtReport(s, '2026-W10', { debts, owed }, 'all'));
    expect(p.key).toBe('2026-W10');
    expect(p.budget).toBe(3500);
    expect(p.has).toEqual({ expenses: true, debts: true });
    expect(p.items.map((i) => [i.name, i.amt, i.cat, i.day])).toEqual(s.items.map((i) => [i.name, i.amt, i.cat, i.day]));
    expect(p.items[1]).toMatchObject({ lender: 'Ate Joy (cousin)', purpose: 'Tuition [2nd sem]' });
    expect(p.debts).toEqual(debts.map(({ lender, purpose, amount }) => ({ lender, purpose, amount })));
    expect(p.owed[0]).toMatchObject({
      person: 'Mark: from work',
      amount: 600,
      borrowedOn: '2026-03-01',
      promisedOn: '2026-03-20',
      payments: [{ amt: 150 }],
    });
  });

  it('writes the base budget and the carry-over separately', () => {
    const p = parseReport(txtReport(snap({ budget: 1000, items: [] }, '2026-W10', 250), '2026-W10', {}, 'expenses'));
    expect(p.budget).toBe(1000);
  });

  it('works with other currency symbols', () => {
    setCurrency('EUR');
    const p = parseReport(txtReport(s, '2026-W10', { debts, owed }, 'expenses'));
    expect(p.budget).toBe(3500);
    expect(p.items).toHaveLength(4);
    expect(p.has.debts).toBe(false);
  });

  it('still reads reports from the previous version', () => {
    const old = [
      'WEEKLY BUDGET',
      'Week: Mar 2 – Mar 8, 2026 (2026-W10)',
      '',
      'Budget:    ₱1,000.00',
      '',
      'EXPENSES',
      '',
      'Mon, Mar 2, 2026',
      '  - Rice [Food]: ₱250.00',
      '  - Pay back [Debt → Ate Joy]: ₱100.00',
      '',
      'MONEY I OWE (balances as of export)',
      '  - Ate Joy (Tuition): ₱400.00 left of ₱500.00',
      '',
      'MONEY OWED TO ME',
      '  - Mark: ₱300.00 | borrowed 2026-03-01 | no pay date given | PAID BACK',
    ].join('\n');
    const p = parseReport(old);
    expect(p.budget).toBe(1000);
    expect(p.items[1]).toMatchObject({ name: 'Pay back', lender: 'Ate Joy', purpose: undefined });
    expect(p.debts).toEqual([{ lender: 'Ate Joy', purpose: 'Tuition', amount: 500 }]);
    expect(p.owed[0]).toMatchObject({ person: 'Mark', paid: true });
  });

  it('rejects text that is not a report', () => {
    expect(parseReport('hello')).toBeNull();
    expect(parseReport('Week: x (2026-W99)')).toBeNull();
  });
});

describe('contrast', () => {
  it('matches the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1);
  });
  it('picks white text on dark accents and dark text on light ones', () => {
    expect(onAccent('#f4a6bd')).toBe('#4a2c36');
    expect(onAccent('#3a0020')).toBe('#ffffff');
  });
});
