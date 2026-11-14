import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { downloadXlsx, snap, setCurrency } from '../utils.js';

// Build the real workbook but capture it instead of saving a file.
vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal()), writeFile: vi.fn() }));

describe('Excel export', () => {
  const s = snap(
    {
      budget: 1000,
      items: [
        { id: 1, name: 'Rice', amt: 250.5, cat: 'Food', day: 0 },
        { id: 2, name: 'Pay Mom', amt: 300, cat: 'Debt', day: 2, debtId: 'd' },
      ],
    },
    '2026-W10',
  );
  const extra = {
    debts: [{ id: 'd', lender: 'Mom', purpose: 'Rent', amount: 1000, paid: 300, left: 700 }],
    owed: [{ id: 'o', person: 'Mark', amount: 500, borrowedOn: '2026-03-01', promisedOn: '', paid: false, payments: [{ amt: 200 }] }],
  };

  it('builds every sheet with the right totals and formulas', async () => {
    setCurrency('PHP');
    await downloadXlsx(s, '2026-W10', extra, 'all');
    const [wb, name] = XLSX.writeFile.mock.calls.at(-1);
    expect(name).toBe('budget-2026-W10.xlsx');
    expect(wb.SheetNames).toEqual(['Summary', 'Expenses', 'Debts I owe', 'Owed to me']);
    const ex = wb.Sheets.Expenses;
    expect(ex.E2.v).toBe(250.5);
    expect(ex.E5).toMatchObject({ v: 550.5, f: 'SUM(E2:E3)' });
    expect(ex.F3.v).toBe('Mom');
    expect(wb.Sheets.Summary.B6).toMatchObject({ v: 449.5, f: 'ABS(B4-B5)' });
    expect(wb.Sheets['Debts I owe'].E4).toMatchObject({ v: 700, f: 'SUM(E2:E2)' });
    const owed = wb.Sheets['Owed to me'];
    expect(owed.C2.v).toBe(200);
    expect(owed.D4).toMatchObject({ v: 300, f: 'SUM(D2:D2)' });
  });

  it('only includes the chosen part', async () => {
    await downloadXlsx(s, '2026-W10', extra, 'debts');
    const [wb, name] = XLSX.writeFile.mock.calls.at(-1);
    expect(name).toBe('budget-2026-W10-debts.xlsx');
    expect(wb.SheetNames).toEqual(['Debts I owe', 'Owed to me']);
  });
});
