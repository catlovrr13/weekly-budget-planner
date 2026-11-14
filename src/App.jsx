import { useState, useEffect, useMemo, useRef } from 'react';
import { fmt, weekKey, snap, carryInto, setCurrency, onAccent, r2 } from './utils.js';
import { KEY, EMPTY, load, save, normalize, uid, debtRowsOf, applyReport, applyRecurring, stopRule } from './data.js';
import { Tabs, Panel, Toast } from './components/ui.jsx';
import { WeekPicker, Summary, RatingCard, AddExpenseCard, ExpenseList, RecurringCard, Breakdown } from './components/expenses.jsx';
import { DebtsCard, OwedCard } from './components/debts.jsx';
import { MonthPanel, SearchCard } from './components/month.jsx';
import { BackupCard, ExportCard, EmailCard, ImportCard, SettingsPanel } from './components/backup.jsx';

const TABS = [
  ['expenses', 'Expenses'],
  ['debt', 'Debt'],
  ['month', 'Monthly'],
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
        const { debtId: _old, ...rest } = i;
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
            <Summary s={s} cur={cur} />
            <RatingCard s={s} debts={debtRows} />
            <AddExpenseCard key={cur} cur={cur} s={s} debts={debtRows.filter((d) => d.left > 0)} onSave={addItem} />
            <div className="split">
              <ExpenseList
                key={cur}
                s={s}
                cur={cur}
                debts={debtRows}
                lenders={lenders}
                onEdit={editItem}
                onDelete={deleteItem}
                onClear={clearWeek}
              />
              <Breakdown s={s} />
            </div>
            <RecurringCard rules={db.recurring} cur={cur} onStop={stopRecurring} onRemove={removeRecurring} />
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
            <SearchCard weeks={db.weeks} lenders={lenders} openWeek={openWeek} />
          </Panel>
          <Panel id="data" tab={tab}>
            <BackupCard db={db} onBackedUp={(d) => setDb((x) => ({ ...x, lastBackup: d }))} />
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
