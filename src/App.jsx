import { useState, useEffect, useMemo, useRef } from 'react';
import { fmt, weekKey, snap, carryInto, setCurrency, onAccent, r2, sum, isoDate, addDays } from './utils.js';
import { KEY, EMPTY, load, save, normalize, uid, debtRowsOf, applyReport, applyRecurring, stopRule } from './data.js';
import { walletBalances, onHand, removeWallet, addEntries, placeOf, billPayments, billsBetween, categoryStatus } from './features.js';
import { Tabs, Panel, Toast, plural } from './components/ui.jsx';
import {
  WeekPicker,
  Summary,
  RatingCard,
  AddExpenseCard,
  ExpenseList,
  RecurringCard,
  Breakdown,
  CategoryLimitsCard,
} from './components/expenses.jsx';
import { DebtsCard, OwedCard } from './components/debts.jsx';
import { MonthPanel, SearchCard } from './components/month.jsx';
import { WalletsCard, IncomeCard, GoalsCard } from './components/money.jsx';
import { BillsDueCard, BillsCard } from './components/bills.jsx';
import { TrendsCard, YearReviewCard } from './components/reports.jsx';
import { CsvImportCard } from './components/csvimport.jsx';
import { BackupCard, ExportCard, EmailCard, ImportCard, SettingsPanel, InstallCard } from './components/backup.jsx';

const TABS = [
  ['expenses', 'Expenses'],
  ['money', 'Money'],
  ['debt', 'Debt'],
  ['month', 'Reports'],
  ['data', 'Backup'],
];
const UNDO_MS = 10000;
const SAVE_FAILED =
  'Your browser refused to save (storage may be full or blocked). Download a full backup on the Backup tab so nothing is lost.';

export default function App() {
  const [boot] = useState(load);
  const [db, setDb] = useState(boot.db);
  const [warning, setWarning] = useState(boot.warning || '');
  const [cur, setCur] = useState(() => weekKey(new Date()));
  const [rev, setRev] = useState(0); // bumps to reset the uncontrolled budget field
  const [tab, setTab] = useState('expenses');
  const [scope, setScope] = useState('all');
  const [toast, setToast] = useState(null); // { msg, prev, next }

  setCurrency(db.currency);
  const w = db.weeks[cur] || EMPTY;
  const s = snap(w, cur, carryInto(db.weeks, cur, db.carryOver));
  const debtRows = useMemo(() => debtRowsOf(db), [db]);
  const lenders = useMemo(() => Object.fromEntries(db.debts.map((d) => [d.id, d.lender])), [db.debts]);
  const extra = useMemo(() => ({ debts: debtRows, owed: db.owed }), [debtRows, db.owed]);
  const walletRows = useMemo(() => walletBalances(db), [db]);
  const hand = db.wallets.length ? onHand(walletRows) : null;
  const overCats = categoryStatus(s.items, db.catLimits).filter((c) => c.over);
  const income = w.income || [];
  const paidBills = useMemo(() => billPayments(db), [db]);
  const billsDue = billsBetween(db, isoDate(s.mon), isoDate(addDays(s.mon, 6)), paidBills);
  const billsMissed =
    cur === weekKey(new Date())
      ? billsBetween(db, isoDate(addDays(s.mon, -35)), isoDate(addDays(s.mon, -1)), paidBills).filter((o) => !o.paidBy)
      : [];

  // ---- Saving, and staying in sync with other open tabs ----
  const lastSaved = useRef(null);
  useEffect(() => {
    const json = JSON.stringify(db);
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    if (!save(json)) setWarning(SAVE_FAILED);
  }, [db]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || e.newValue == null) return;
      try {
        const next = normalize(JSON.parse(e.newValue));
        lastSaved.current = JSON.stringify(next);
        setDb(next);
        setRev((r) => r + 1);
      } catch {
        /* another tab wrote something unreadable; keep ours */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Recurring expenses are added to a week the first time it's opened.
  useEffect(() => {
    setDb((d) => applyRecurring(d, cur));
  }, [cur, db.recurring]);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', db.accent);
    r.style.setProperty('--on-accent', onAccent(db.accent));
    if (db.mode === 'auto') r.removeAttribute('data-theme');
    else r.setAttribute('data-theme', db.mode);
  }, [db.accent, db.mode]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // ---- Undo ----
  // Destructive changes go through `change`, which remembers the data from just before.
  // Any other change afterwards closes the undo offer, so undo can never wipe newer work.
  const change = (fn, msg) => {
    const next = applyRecurring(fn(db), cur);
    setDb(next);
    setToast({ msg, prev: db, next });
  };
  useEffect(() => {
    if (toast && db !== toast.next) setToast(null);
  }, [db, toast]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const undo = () => {
    if (!toast || db !== toast.next) return;
    setDb(toast.prev);
    setToast(null);
    setRev((r) => r + 1);
  };

  // ---- Expenses ----
  const updateWeek = (fn) => setDb((d) => ({ ...d, weeks: { ...d.weeks, [cur]: fn(d.weeks[cur] || EMPTY) } }));
  const addItem = (v, repeat) => {
    if (!repeat) return updateWeek((x) => ({ ...x, items: [...x.items, { id: uid(), ...v }] }));
    const rule = { id: uid(), name: v.name, amt: v.amt, cat: v.cat, day: v.day, start: cur, end: '' };
    setDb((d) => {
      const wk = d.weeks[cur] || EMPTY;
      return {
        ...d,
        recurring: [...d.recurring, rule],
        weeks: {
          ...d.weeks,
          [cur]: { ...wk, items: [...wk.items, { id: uid(), ...v, recurringId: rule.id }], applied: [...(wk.applied || []), rule.id] },
        },
      };
    });
  };
  const editItem = (id, v) =>
    updateWeek((x) => ({
      ...x,
      items: x.items.map((i) => {
        if (i.id !== id) return i;
        const { debtId: _old, walletId: _w, ...rest } = i;
        return { ...rest, ...v };
      }),
    }));
  const deleteItem = (item) =>
    change(
      (d) => ({ ...d, weeks: { ...d.weeks, [cur]: { ...d.weeks[cur], items: d.weeks[cur].items.filter((i) => i.id !== item.id) } } }),
      `Deleted “${item.name}”.`,
    );
  const clearWeek = () =>
    change((d) => ({ ...d, weeks: { ...d.weeks, [cur]: { ...d.weeks[cur], items: [] } } }), 'Cleared this week’s expenses.');
  const stopRecurring = (r) => change((d) => stopRule(d, r.id, cur), `“${r.name}” won’t repeat after this week.`);
  const removeRecurring = (r) =>
    change(
      (d) => ({
        ...d,
        recurring: d.recurring.filter((x) => x.id !== r.id),
        weeks: Object.fromEntries(
          Object.entries(d.weeks).map(([k, wk]) => [
            k,
            {
              ...wk,
              items: wk.items.map((i) => {
                if (i.recurringId !== r.id) return i;
                const { recurringId: _r, ...rest } = i;
                return rest;
              }),
              ...(wk.income
                ? {
                    income: wk.income.map((i) => {
                      if (i.recurringId !== r.id) return i;
                      const { recurringId: _r, ...rest } = i;
                      return rest;
                    }),
                  }
                : {}),
              ...(wk.applied ? { applied: wk.applied.filter((x) => x !== r.id) } : {}),
            },
          ]),
        ),
      }),
      `Removed “${r.name}” from recurring expenses.`,
    );

  // ---- Debts and money owed to me ----
  const addDebt = (v) => setDb((x) => ({ ...x, debts: [...x.debts, { id: uid(), ...v }] }));
  const editDebt = (id, v) => setDb((x) => ({ ...x, debts: x.debts.map((d) => (d.id === id ? { ...d, ...v } : d)) }));
  const deleteDebt = (debt) =>
    change(
      (x) => ({
        ...x,
        debts: x.debts.filter((y) => y.id !== debt.id),
        weeks: Object.fromEntries(
          Object.entries(x.weeks).map(([k, wk]) => [
            k,
            {
              ...wk,
              items: wk.items.map((i) => {
                if (i.debtId !== debt.id) return i;
                const { debtId: _d, ...rest } = i;
                return rest;
              }),
            },
          ]),
        ),
      }),
      `Deleted the debt to ${debt.lender}.${debt.count ? ' Its payments stay as regular expenses.' : ''}`,
    );
  const addOwed = (v) => setDb((x) => ({ ...x, owed: [...x.owed, { id: uid(), paid: false, payments: [], ...v }] }));
  const editOwed = (id, v) => setDb((x) => ({ ...x, owed: x.owed.map((o) => (o.id === id ? { ...o, ...v } : o)) }));
  const deleteOwed = (o) => change((x) => ({ ...x, owed: x.owed.filter((y) => y.id !== o.id) }), `Deleted ${o.person}’s ${fmt(o.amount)}.`);
  const payOwed = (id, p) =>
    setDb((x) => ({
      ...x,
      owed: x.owed.map((o) => (o.id === id ? { ...o, payments: [...o.payments, { id: uid(), amt: r2(p.amt), date: p.date }] } : o)),
    }));
  const removePayment = (o, p) =>
    change(
      (x) => ({ ...x, owed: x.owed.map((y) => (y.id === o.id ? { ...y, payments: y.payments.filter((z) => z.id !== p.id) } : y)) }),
      `Removed ${o.person}’s ${fmt(p.amt)} payment.`,
    );

  // ---- Category limits ----
  const setLimits = (catLimits) => setDb((d) => ({ ...d, catLimits }));

  // ---- Wallets and transfers ----
  const addWallet = (v) => setDb((d) => ({ ...d, wallets: [...d.wallets, { id: uid(), ...v }] }));
  const editWallet = (id, v) => setDb((d) => ({ ...d, wallets: d.wallets.map((x) => (x.id === id ? { ...x, ...v } : x)) }));
  const deleteWallet = (wal) => change((d) => removeWallet(d, wal.id), `Deleted ${wal.name}. Expenses that used it are kept.`);
  const addTransfer = (v) => setDb((d) => ({ ...d, transfers: [...d.transfers, { id: uid(), ...v }] }));
  const deleteTransfer = (t) =>
    change((d) => ({ ...d, transfers: d.transfers.filter((x) => x.id !== t.id) }), `Removed the ${fmt(t.amt)} transfer.`);

  // ---- Income ----
  const addIncome = (v, repeat) => {
    if (!repeat) return setDb((d) => addEntries(d, [{ ...v, kind: 'income' }]));
    const { key, day } = placeOf(v.date);
    const rule = {
      id: uid(),
      kind: 'income',
      name: v.name,
      amt: v.amt,
      cat: 'Other',
      day,
      start: key,
      end: '',
      ...(v.walletId != null ? { walletId: v.walletId } : {}),
    };
    setDb((d) => {
      const wk = d.weeks[key] || EMPTY;
      const { date: _d, ...rest } = v;
      return {
        ...d,
        recurring: [...d.recurring, rule],
        weeks: {
          ...d.weeks,
          [key]: {
            ...wk,
            income: [...(wk.income || []), { id: uid(), ...rest, day, recurringId: rule.id }],
            applied: [...(wk.applied || []), rule.id],
          },
        },
      };
    });
  };
  const deleteIncome = (item) =>
    change(
      (d) => ({
        ...d,
        weeks: { ...d.weeks, [cur]: { ...d.weeks[cur], income: (d.weeks[cur].income || []).filter((i) => i.id !== item.id) } },
      }),
      `Deleted income “${item.name}”.`,
    );

  // ---- Savings goals ----
  const addGoal = (v) => setDb((d) => ({ ...d, goals: [...d.goals, { id: uid(), contributions: [], ...v }] }));
  const contribute = (id, v) =>
    setDb((d) => ({
      ...d,
      goals: d.goals.map((g) => (g.id === id ? { ...g, contributions: [...g.contributions, { id: uid(), ...v }] } : g)),
    }));
  const removeContribution = (g, c) =>
    change(
      (d) => ({
        ...d,
        goals: d.goals.map((x) => (x.id === g.id ? { ...x, contributions: x.contributions.filter((y) => y.id !== c.id) } : x)),
      }),
      `Removed ${fmt(c.amt)} from ${g.name}.`,
    );
  const deleteGoal = (g) => change((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) }), `Deleted the goal “${g.name}”.`);

  // ---- Bills ----
  const addBill = (v) => setDb((d) => ({ ...d, bills: [...d.bills, { id: uid(), ...v }] }));
  const deleteBill = (b) => change((d) => ({ ...d, bills: d.bills.filter((x) => x.id !== b.id) }), `Deleted the bill “${b.name}”.`);
  const payBill = (bill, due) =>
    setDb((d) =>
      addEntries(d, [
        {
          date: due,
          kind: 'expense',
          name: bill.name,
          amt: bill.amt,
          cat: bill.cat,
          billId: bill.id,
          billDue: due,
          ...(bill.walletId != null ? { walletId: bill.walletId } : {}),
        },
      ]),
    );

  // ---- CSV statements ----
  const importCsv = (entries, csvPrefs) =>
    change((d) => ({ ...addEntries(d, entries), csvPrefs }), `Imported ${plural(entries.length, 'transaction')}.`);

  // ---- Import and restore (both undoable) ----
  const importData = (p, loadScope) => {
    const next = applyReport(db, p, loadScope);
    setDb(next);
    setToast({ msg: 'Loaded the report.', prev: db, next });
    if (loadScope !== 'debts') {
      setCur(p.key);
      setRev((r) => r + 1);
    }
  };
  const restoreBackup = (backup) => {
    change(() => backup, 'Restored your backup.');
    setRev((r) => r + 1);
  };

  const openWeek = (key) => {
    setCur(key);
    setTab('expenses');
  };
  const jumpToAdd = () => {
    setTab('expenses');
    setTimeout(() => {
      const el = document.getElementById('name');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el?.focus(), 350);
    }, 0);
  };
  const over = s.rem < 0;

  return (
    <>
      <div className="wrap">
        <h1>Weekly Budget Planner</h1>
        <p className="sub">Pick a week, set your budget, and watch it update with every expense you add.</p>
        {warning && (
          <div className="alert" role="alert" style={{ marginBottom: 16 }}>
            {warning}{' '}
            <button className="btn ghost sm" type="button" onClick={() => setWarning('')}>
              Dismiss
            </button>
          </div>
        )}
        <Tabs tabs={TABS} tab={tab} setTab={setTab} />
        <main>
          <Panel id="expenses" tab={tab}>
            <WeekPicker
              cur={cur}
              setCur={setCur}
              s={s}
              rev={rev}
              budget={w.budget}
              onBudget={(v) => updateWeek((x) => ({ ...x, budget: v }))}
            />
            <Summary s={s} cur={cur} income={sum(income)} hand={hand} overCats={overCats} />
            <BillsDueCard due={billsDue} overdue={billsMissed} onPay={payBill} />
            <RatingCard s={s} debts={debtRows} />
            <AddExpenseCard
              key={`${cur}:${db.wallets.length}`}
              cur={cur}
              s={s}
              debts={debtRows.filter((d) => d.left > 0)}
              wallets={walletRows}
              limits={db.catLimits}
              onSave={addItem}
            />
            <div className="split">
              <ExpenseList
                key={cur}
                s={s}
                cur={cur}
                debts={debtRows}
                lenders={lenders}
                wallets={walletRows}
                limits={db.catLimits}
                onEdit={editItem}
                onDelete={deleteItem}
                onClear={clearWeek}
              />
              <Breakdown s={s} />
            </div>
            <CategoryLimitsCard items={s.items} limits={db.catLimits} onSave={setLimits} />
            <RecurringCard rules={db.recurring} cur={cur} onStop={stopRecurring} onRemove={removeRecurring} />
          </Panel>
          <Panel id="money" tab={tab}>
            <WalletsCard
              rows={walletRows}
              transfers={db.transfers}
              onAdd={addWallet}
              onEdit={editWallet}
              onDelete={deleteWallet}
              onTransfer={addTransfer}
              onDeleteTransfer={deleteTransfer}
            />
            <IncomeCard
              key={`${cur}:${db.wallets.length}`}
              cur={cur}
              s={s}
              income={income}
              wallets={walletRows}
              onAdd={addIncome}
              onDelete={deleteIncome}
            />
            <GoalsCard
              goals={db.goals}
              onAdd={addGoal}
              onContribute={contribute}
              onRemoveContribution={removeContribution}
              onDelete={deleteGoal}
            />
            <BillsCard bills={db.bills} wallets={walletRows} onAdd={addBill} onDelete={deleteBill} />
          </Panel>
          <Panel id="debt" tab={tab}>
            <DebtsCard rows={debtRows} onAdd={addDebt} onEdit={editDebt} onDelete={deleteDebt} />
            <OwedCard
              list={db.owed}
              onAdd={addOwed}
              onEdit={editOwed}
              onDelete={deleteOwed}
              onPay={payOwed}
              onRemovePayment={removePayment}
            />
          </Panel>
          <Panel id="month" tab={tab}>
            <MonthPanel weeks={db.weeks} debtRows={debtRows} owed={db.owed} cur={cur} carryOver={db.carryOver} openWeek={openWeek} />
            <TrendsCard weeks={db.weeks} endKey={cur} openWeek={openWeek} />
            <YearReviewCard db={db} debtRows={debtRows} openWeek={openWeek} />
            <SearchCard weeks={db.weeks} lenders={lenders} openWeek={openWeek} />
          </Panel>
          <Panel id="data" tab={tab}>
            <InstallCard />
            <BackupCard db={db} onBackedUp={(d) => setDb((x) => ({ ...x, lastBackup: d }))} />
            <CsvImportCard weeks={db.weeks} wallets={walletRows} prefs={db.csvPrefs} onImport={importCsv} />
            <ExportCard s={s} cur={cur} extra={extra} scope={scope} setScope={setScope} />
            <EmailCard email={db.email} setEmail={(v) => setDb((d) => ({ ...d, email: v }))} s={s} cur={cur} extra={extra} scope={scope} />
            <ImportCard onLoad={importData} onRestore={restoreBackup} />
            <SettingsPanel db={db} setDb={setDb} />
          </Panel>
        </main>
      </div>
      <Toast toast={toast} onUndo={undo} onClose={() => setToast(null)} />
      <div className={'dock' + (over ? ' neg' : '')} aria-live="polite">
        <div>
          <small>{over ? 'Over budget by' : 'Remaining this week'}</small>
          <b>{fmt(Math.abs(s.rem))}</b>
        </div>
        <button className="btn" type="button" onClick={jumpToAdd}>
          + Add expense
        </button>
      </div>
    </>
  );
}
