import { describe, it, expect } from 'vitest';
import { parseCsv, guessLayout, parseAmount, parseDate, guessDateOrder, guessCategory, rowsToEntries, dupKey } from '../csv.js';

describe('parseCsv', () => {
  it('handles quotes, commas inside quotes, escaped quotes and CRLF', () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n2026-11-01,"Jollibee, SM North",-250.00\r\n2026-11-02,"He said ""hi""",100\r\n\r\n');
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-11-01', 'Jollibee, SM North', '-250.00'],
      ['2026-11-02', 'He said "hi"', '100'],
    ]);
  });
  it('detects semicolon and tab separators', () => {
    expect(parseCsv('a;b;c\n1;2;3')[1]).toEqual(['1', '2', '3']);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });
});

describe('guessLayout', () => {
  it('skips account details above the header and finds money in/out columns', () => {
    const rows = parseCsv(
      [
        'Account Name,Juan Dela Cruz',
        'Account Number,1234',
        '',
        'Transaction Date,Description,Debit,Credit,Running Balance',
        '11/03/2026,MERALCO,"2,300.00",,10000.00',
        '11/05/2026,PAYROLL,,"15,000.00",25000.00',
      ].join('\n'),
    );
    const l = guessLayout(rows);
    expect(l).toMatchObject({ headerRow: 2, date: 0, desc: 1, debit: 2, credit: 3, amount: -1 });
    const { entries, skipped } = rowsToEntries(rows, l, { order: guessDateOrder(['11/03/2026']) });
    expect(skipped).toBe(0);
    expect(entries).toEqual([
      { date: '2026-11-03', name: 'MERALCO', amt: 2300, kind: 'expense', cat: 'Bills' },
      { date: '2026-11-05', name: 'PAYROLL', amt: 15000, kind: 'income', cat: undefined },
    ]);
  });

  it('works with a single signed amount column', () => {
    const rows = parseCsv('Date,Details,Amount (PHP)\n2026-11-10,GrabFood,-320.50\n2026-11-11,Cash In,1000\n2026-11-12,Bad row,\n');
    const l = guessLayout(rows);
    expect(l).toMatchObject({ date: 0, desc: 1, amount: 2 });
    const { entries, skipped } = rowsToEntries(rows, l);
    expect(entries.map((e) => [e.name, e.kind, e.amt, e.cat])).toEqual([
      ['GrabFood', 'expense', 320.5, 'Food'],
      ['Cash In', 'income', 1000, undefined],
    ]);
    expect(skipped).toBe(1);
    expect(rowsToEntries(rows, l, { sign: 'positive' }).entries[0].kind).toBe('income');
  });
});

describe('parseAmount', () => {
  it.each([
    ['₱1,234.50', 1234.5],
    ['-500', -500],
    ['(1,000.00)', -1000],
    ['1,000.00 DR', -1000],
    ['PHP 75', 75],
    ['250-', -250],
  ])('%s → %s', (s, n) => expect(parseAmount(s)).toBe(n));
  it('returns NaN for blanks', () => expect(parseAmount('')).toBeNaN());
});

describe('parseDate', () => {
  it.each([
    ['2026-11-14', 'mdy', '2026-11-14'],
    ['2026/1/5', 'mdy', '2026-01-05'],
    ['03/04/2026', 'mdy', '2026-03-04'],
    ['03/04/2026', 'dmy', '2026-04-03'],
    ['3-4-26', 'dmy', '2026-04-03'],
    ['Nov 14, 2026', 'mdy', '2026-11-14'],
    ['November 4 2026 10:30 AM', 'mdy', '2026-11-04'],
    ['14 Nov 2026', 'mdy', '2026-11-14'],
    ['14-Nov-26', 'mdy', '2026-11-14'],
    ['2026-11-14T08:00:00', 'mdy', '2026-11-14'],
    ['02/30/2026', 'mdy', ''],
    ['hello', 'mdy', ''],
  ])('%s (%s) → %s', (s, o, iso) => expect(parseDate(s, o)).toBe(iso));

  it('guesses day-first or month-first from the values', () => {
    expect(guessDateOrder(['01/02/2026', '25/02/2026'])).toBe('dmy');
    expect(guessDateOrder(['01/02/2026', '02/25/2026'])).toBe('mdy');
  });
});

describe('guessCategory', () => {
  it.each([
    ['GRABFOOD*JOLLIBEE', 'Food'],
    ['Grab Car', 'Transport'],
    ['MERALCO ONLINE', 'Bills'],
    ['Mercury Drug', 'Health'],
    ['NETFLIX.COM', 'Fun'],
    ['SHOPEE PH', 'Shopping'],
    ['Something else', 'Other'],
  ])('%s → %s', (d, c) => expect(guessCategory(d)).toBe(c));
});

it('dupKey ignores case and spacing at the ends', () => {
  expect(dupKey('2026-11-01', 250, ' Jollibee ')).toBe(dupKey('2026-11-01', 250.0, 'jollibee'));
});
