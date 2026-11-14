import { describe, it, expect } from 'vitest';
import {
  KEY,
  VERSION,
  normalize,
  load,
  save,
  applyReport,
  debtRowsOf,
  backupJson,
  parseBackup,
  applyRecurring,
  stopRule,
} from '../data.js';

const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};

describe('normalize', () => {
  it('turns junk into a valid empty database', () => {
    for (const junk of [null, 5, 'x', [], { weeks: 'nope', debts: {}, owed: [null, 3] }]) {
      expect(normalize(junk)).toMatchObject({ v: VERSION, weeks: {}, debts: [], owed: [], recurring: [], currency: 'PHP', mode: 'auto' });
    }
  });

  it('repairs damaged records without dropping good ones', () => {
    const db = normalize({
      weeks: {
        '2026-W10': {
          budget: '1200',
          items: [
            { id: 1, name: 'Rice', amt: '250.456', cat: 'Food', day: 2 },
            { name: 'bad', amt: -5 },
            null,
            { amt: 10, cat: 'Nope', day: 9 },
          ],
        },
        '2026-W99': { budget: 5, items: [] },
        'not-a-week': {},
        '2026-W11': { budget: 100 }, // no items array: this used to crash the app
      },
      debts: [
        { id: 'd1', lender: 'Mom', purpose: 'Rent', amount: 500 },
        { id: 'd1', lender: 'Dupe id', amount: 1 },
      ],
      accent: 'red',
      mode: 'neon',
      currency: 'XXX',
    });
    expect(Object.keys(db.weeks).sort()).toEqual(['2026-W10', '2026-W11']);
    expect(db.weeks['2026-W10'].budget).toBe(1200);
    expect(db.weeks['2026-W10'].items).toHaveLength(2);
    expect(db.weeks['2026-W10'].items[0].amt).toBe(250.46);
    expect(db.weeks['2026-W10'].items[1]).toMatchObject({ cat: 'Other', day: 0, name: 'Expense' });
    expect(db.weeks['2026-W11'].items).toEqual([]);
    expect(db.debts[0].id).toBe('d1');
    expect(db.debts[1].id).not.toBe('d1'); // duplicate ids get a fresh one
    expect(db).toMatchObject({ accent: '#f4a6bd', mode: 'auto', currency: 'PHP' });
  });

  it('drops links to debts that no longer exist', () => {
    const db = normalize({
      weeks: { '2026-W10': { budget: 0, items: [{ id: 1, name: 'x', amt: 5, cat: 'Debt', day: 0, debtId: 'gone' }] } },
    });
    expect(db.weeks['2026-W10'].items[0].debtId).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = normalize({
      weeks: { '2026-W10': { budget: 1, items: [{ id: 1, name: 'a', amt: 1, cat: 'Food', day: 1 }] } },
      debts: [{ id: 2, lender: 'x', purpose: '', amount: 3 }],
    });
    expect(normalize(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('load and save', () => {
  it('starts empty with nothing saved', () => {
    expect(load(memory()).db.weeks).toEqual({});
  });

  it('keeps an unreadable save instead of overwriting it', () => {
    const st = memory({ [KEY]: '{oops' });
    const { db, warning } = load(st);
    expect(db.weeks).toEqual({});
    expect(warning).toMatch(/couldn’t be read/);
    const backups = [...st.map.keys()].filter((k) => k.startsWith(KEY + ':backup:unreadable'));
    expect(backups).toHaveLength(1);
    expect(st.getItem(backups[0])).toBe('{oops');
  });

  it('upgrades a version 1 save and keeps a copy of the original', () => {
    const v1 = {
      weeks: { '2026-W10': { budget: 100, items: [{ id: 17, name: 'a', amt: 5, cat: 'Food', day: 0 }] } },
      accent: '#ee86a5',
      debts: [],
      owed: [{ id: 3, person: 'M', amount: 50, borrowedOn: '2026-01-01', promisedOn: '', paid: false }],
    };
    const st = memory({ [KEY]: JSON.stringify(v1) });
    const { db } = load(st);
    expect(db.v).toBe(VERSION);
    expect(db.weeks['2026-W10'].items[0].id).toBe(17);
    expect(db.owed[0].payments).toEqual([]);
    expect(db.accent).toBe('#ee86a5');
    expect(st.getItem(KEY + ':backup:v1')).toBe(JSON.stringify(v1));
  });

  it('reports when the browser refuses to save or read', () => {
    expect(
      save(
        {},
        {
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
        },
      ),
    ).toBe(false);
    expect(
      load({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }).warning,
    ).toMatch(/blocking storage/);
  });
});

describe('importing a .txt report', () => {
  const base = normalize({
    debts: [
      { id: 'mom-rent', lender: 'Mom', purpose: 'Rent', amount: 1000 },
      { id: 'mom-school', lender: 'Mom', purpose: 'School', amount: 2000 },
    ],
    weeks: {
      '2026-W01': { budget: 500, items: [{ id: 'p1', name: 'Pay Mom', amt: 300, cat: 'Debt', day: 0, debtId: 'mom-rent' }] },
      '2026-W02': { budget: 500, items: [{ id: 'p2', name: 'Pay Mom', amt: 400, cat: 'Debt', day: 0, debtId: 'mom-school' }] },
    },
  });

  it('"Load debts only" keeps payments from other weeks linked (they used to reset to the full amount)', () => {
    const p = {
      key: '2026-W05',
      debts: [
        { lender: 'Mom', purpose: 'School', amount: 2000 },
        { lender: 'Mom', purpose: 'Rent', amount: 1000 },
      ],
      owed: [],
      items: [],
    };
    const rows = debtRowsOf(applyReport(base, p, 'debts'));
    expect(rows.find((d) => d.purpose === 'Rent')).toMatchObject({ id: 'mom-rent', paid: 300, left: 700 });
    expect(rows.find((d) => d.purpose === 'School')).toMatchObject({ id: 'mom-school', paid: 400, left: 1600 });
  });

  it('unlinks payments whose debt is not in the imported list, keeping them as expenses', () => {
    const p = { key: '2026-W05', debts: [{ lender: 'Mom', purpose: 'Rent', amount: 1000 }], owed: [], items: [] };
    const next = applyReport(base, p, 'debts');
    expect(next.weeks['2026-W02'].items[0].debtId).toBeUndefined();
    expect(next.weeks['2026-W02'].items[0].amt).toBe(400);
  });

  it('links imported payments to the right one of two debts to the same lender', () => {
    const p = {
      key: '2026-W03',
      budget: 800,
      debts: [],
      owed: [],
      items: [{ name: 'Pay', cat: 'Debt', amt: 50, day: 1, lender: 'Mom', purpose: 'School' }],
    };
    const next = applyReport(base, p, 'expenses');
    expect(next.weeks['2026-W03'].items[0].debtId).toBe('mom-school');
    expect(next.debts).toBe(base.debts);
  });

  it('gives imported items unique ids', () => {
    const p = {
      key: '2026-W03',
      budget: 1,
      debts: [],
      owed: [],
      items: Array.from({ length: 50 }, () => ({ name: 'x', cat: 'Food', amt: 1, day: 0 })),
    };
    const ids = applyReport(base, p, 'expenses').weeks['2026-W03'].items.map((i) => i.id);
    expect(new Set(ids).size).toBe(50);
  });
});

describe('full backup', () => {
  it('round-trips the whole database', () => {
    const db = normalize({
      weeks: { '2026-W10': { budget: 100, items: [{ id: 'a', name: 'x', amt: 1, cat: 'Food', day: 0 }] } },
      debts: [{ id: 'd', lender: 'L', purpose: 'P', amount: 9 }],
      recurring: [{ id: 'r', name: 'Rent', amt: 5000, cat: 'Bills', day: 0, start: '2026-W01' }],
      currency: 'USD',
      carryOver: true,
    });
    expect(parseBackup(backupJson(db))).toEqual(db);
  });
  it('rejects other JSON', () => {
    expect(parseBackup('[1,2]')).toBeNull();
    expect(parseBackup('{"hello":1}')).toBeNull();
    expect(parseBackup('not json')).toBeNull();
  });
});

describe('recurring expenses', () => {
  const db = normalize({ recurring: [{ id: 'r', name: 'Netflix', amt: 549, cat: 'Fun', day: 4, start: '2026-W10' }] });

  it('is added once to weeks from its start', () => {
    expect(applyRecurring(db, '2026-W09')).toBe(db);
    const once = applyRecurring(db, '2026-W12');
    expect(once.weeks['2026-W12'].items).toMatchObject([{ name: 'Netflix', amt: 549, day: 4, recurringId: 'r' }]);
    expect(applyRecurring(once, '2026-W12')).toBe(once);
  });

  it('does not come back after you delete that week’s copy', () => {
    const once = applyRecurring(db, '2026-W12');
    const deleted = { ...once, weeks: { ...once.weeks, '2026-W12': { ...once.weeks['2026-W12'], items: [] } } };
    expect(applyRecurring(deleted, '2026-W12')).toBe(deleted);
  });

  it('stopping keeps past copies and removes future ones', () => {
    let d = applyRecurring(applyRecurring(db, '2026-W10'), '2026-W14');
    d = stopRule(d, 'r', '2026-W11');
    expect(d.weeks['2026-W10'].items).toHaveLength(1);
    expect(d.weeks['2026-W14'].items).toHaveLength(0);
    expect(applyRecurring(d, '2026-W15')).toBe(d);
  });
});
