import { useState, useEffect } from 'react';
import { DAYS, CATS, fmt, weekKey, addDays, short, group, snap, downloadTxt, downloadXlsx } from './utils.js';

const KEY = 'pinkBudgetReactV1';
const SWATCHES = [['Blush', '#f4a6bd'], ['Rose', '#ee86a5'], ['Peach pink', '#f8b4b0'], ['Mauve', '#d9a0c0'], ['Petal', '#fbc8d8']];
const EMPTY = { budget: 0, items: [] };
const DEFAULTS = { weeks: {}, accent: '#f4a6bd', mode: 'auto' };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return DEFAULTS; }
}

function WeekPicker({ cur, setCur, s }) {
  const go = (n) => setCur(weekKey(addDays(s.mon, n * 7)));
  return (
    <section className="card" aria-label="Week and budget">
      <div className="nav">
        <button className="btn ghost" onClick={() => go(-1)} aria-label="Previous week">‹ Prev</button>
        <div className="f" style={{ flex: '1 1 170px' }}>
          <label htmlFor="week">Choose week</label>
          <input type="week" id="week" value={cur} onChange={(e) => e.target.value && setCur(e.target.value)} />
        </div>
        <button className="btn ghost" onClick={() => go(1)} aria-label="Next week">Next ›</button>
        <button className="btn ghost" onClick={() => setCur(weekKey(new Date()))}>This week</button>
      </div>
      <p className="range">{s.label}</p>
    </section>
  );
}

function BudgetInput({ cur, defaultValue, onChange }) {
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <div className="f">
        <label htmlFor="budget">Budget for this week (₱)</label>
        {/* key resets the field when the week changes; uncontrolled so decimals type naturally */}
        <input key={cur} id="budget" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 3,500"
          defaultValue={defaultValue || ''} onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))} />
      </div>
    </div>
  );
}

function Summary({ s, cur }) {
  const over = s.rem < 0;
  const pct = s.b > 0 ? Math.min(100, (s.spent / s.b) * 100) : s.spent > 0 ? 100 : 0;
  const now = new Date();
  const left = weekKey(now) === cur ? 7 - ((now.getDay() + 6) % 7) : s.mon > now ? 7 : 0;
  return (
    <section className="card" aria-label="Summary">
      <div className="stats">
        <div className="stat"><small>Budget</small><b>{fmt(s.b)}</b></div>
        <div className="stat"><small>Spent</small><b>{fmt(s.spent)}</b></div>
        <div className={'stat rem' + (over ? ' neg' : '')}><small>{over ? 'Over budget by' : 'Remaining'}</small><b>{fmt(Math.abs(s.rem))}</b></div>
      </div>
      <div className={'bar' + (over ? ' over' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Budget used">
        <i style={{ width: pct + '%' }} />
      </div>
      <div className="sub" style={{ margin: 0 }}>
        {s.b > 0 ? Math.round((s.spent / s.b) * 100) + '% of your budget used' : 'Enter a budget to start tracking.'}
      </div>
      {over && <div className="alert" role="alert">You’re over budget by {fmt(-s.rem)}.</div>}
      {!over && s.b > 0 && left > 0 && (
        <div className="ok">You can spend about {fmt(s.rem / left)} a day for the {left} day{left > 1 ? 's' : ''} left.</div>
      )}
    </section>
  );
}

function ExpenseForm({ cur, s, onAdd }) {
  const todayIdx = weekKey(new Date()) === cur ? (new Date().getDay() + 6) % 7 : 0;
  const [f, setF] = useState({ name: '', amt: '', cat: CATS[0], day: todayIdx });
  useEffect(() => setF((x) => ({ ...x, day: todayIdx })), [cur, todayIdx]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const a = parseFloat(f.amt), after = s.rem - a;
  const focus = (id) => document.getElementById(id)?.focus();

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return focus('name');
    if (!(a > 0)) return focus('amt');
    onAdd({ id: Date.now(), name: f.name.trim(), amt: Math.round(a * 100) / 100, cat: f.cat, day: +f.day });
    setF({ ...f, name: '', amt: '' });
    focus('name');
  };

  return (
    <section className="card" aria-label="Add expense">
      <h2>Add an expense</h2>
      <form className="row" onSubmit={submit}>
        <div className="f" style={{ flex: '2 1 180px' }}>
          <label htmlFor="name">What did you buy?</label>
          <input id="name" value={f.name} onChange={set('name')} placeholder="e.g. Groceries" maxLength={60} />
        </div>
        <div className="f">
          <label htmlFor="amt">Amount (₱)</label>
          <input id="amt" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={f.amt} onChange={set('amt')} />
        </div>
        <div className="f">
          <label htmlFor="cat">Category</label>
          <select id="cat" value={f.cat} onChange={set('cat')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="f">
          <label htmlFor="day">Day</label>
          <select id="day" value={f.day} onChange={set('day')}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}, {short(addDays(s.mon, i))}</option>)}
          </select>
        </div>
        <button className="btn" type="submit" id="add">Add expense</button>
      </form>
      <div className={'preview' + (a > 0 && after < 0 ? ' bad' : '')}>
        {a > 0 && (after < 0 ? `Adding this would put you over budget by ${fmt(-after)}.` : `After this, you’ll have ${fmt(after)} left.`)}
      </div>
    </section>
  );
}

function ExpenseList({ s, onDelete }) {
  return (
    <section className="card" aria-label="Expenses">
      <h2>This week’s expenses</h2>
      <ul>
        {!s.items.length && <li className="empty">No expenses yet for this week.</li>}
        {s.items.map((i) => (
          <li className="item" key={i.id}>
            <div className="grow"><b>{i.name}</b><span>{DAYS[i.day]}, {short(addDays(s.mon, i.day))}</span></div>
            <span className="tag">{i.cat}</span>
            <span className="amt">{fmt(i.amt)}</span>
            <button className="x" onClick={() => onDelete(i.id)} aria-label={`Delete ${i.name}`}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bars({ rows, max }) {
  if (!rows.length) return <div className="empty">Nothing to show yet.</div>;
  return rows.map(([n, v]) => (
    <div className="mini" key={n}>
      <span className="n">{n}</span>
      <span className="t"><i style={{ width: (max ? (v / max) * 100 : 0) + '%' }} /></span>
      <span className="v">{fmt(v)}</span>
    </div>
  ));
}

function Breakdown({ s }) {
  const perDay = DAYS.map((d, i) => [d, s.items.filter((x) => x.day === i).reduce((a, c) => a + c.amt, 0)]);
  return (
    <section className="card" aria-label="Breakdown">
      <h2>Where it went</h2>
      <Bars rows={group(s.items, 'cat')} max={s.spent} />
      <h2 style={{ marginTop: 18 }}>Day by day</h2>
      <Bars rows={perDay} max={Math.max(...perDay.map((r) => r[1]), 1)} />
    </section>
  );
}

function ExportCard({ s, cur }) {
  return (
    <section className="card" aria-label="Export">
      <h2>Export this week</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Save the budget, summary and every expense for the week you’re viewing.</p>
      <div className="row">
        <button className="btn" onClick={() => downloadTxt(s, cur)}>Download .txt</button>
        <button className="btn" onClick={() => downloadXlsx(s, cur)}>Download Excel (.xlsx)</button>
      </div>
    </section>
  );
}

function ThemePanel({ db, setDb, onClear }) {
  return (
    <section className="card" aria-label="Theme">
      <h2>Make it yours</h2>
      <div className="sw">
        {SWATCHES.map(([n, c]) => (
          <button key={c} className="c" style={{ background: c }} title={n} aria-label={n} aria-pressed={db.accent === c} onClick={() => setDb((d) => ({ ...d, accent: c }))} />
        ))}
        <label htmlFor="pick" style={{ marginLeft: 6 }}>Custom</label>
        <input type="color" id="pick" value={db.accent} onChange={(e) => setDb((d) => ({ ...d, accent: e.target.value }))} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="f" style={{ flex: '0 1 200px' }}>
          <label htmlFor="mode">Light or dark</label>
          <select id="mode" value={db.mode} onChange={(e) => setDb((d) => ({ ...d, mode: e.target.value }))}>
            <option value="auto">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </div>
        <button className="btn ghost" onClick={onClear}>Clear this week</button>
      </div>
    </section>
  );
}

export default function App() {
  const [db, setDb] = useState(load);
  const [cur, setCur] = useState(() => weekKey(new Date()));
  const w = db.weeks[cur] || EMPTY;
  const s = snap(w, cur);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } }, [db]);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', db.accent);
    db.mode === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', db.mode);
  }, [db.accent, db.mode]);

  const update = (fn) => setDb((d) => ({ ...d, weeks: { ...d.weeks, [cur]: fn(d.weeks[cur] || EMPTY) } }));
  const clear = () => confirm('Remove all expenses for this week?') && update((x) => ({ ...x, items: [] }));
  const over = s.rem < 0;

  return (
    <>
      <div className="wrap">
        <h1>Weekly Budget Planner</h1>
        <p className="sub">Pick a week, set your budget, and watch it update with every expense you add.</p>
        <WeekPicker cur={cur} setCur={setCur} s={s} />
        <section className="card"><BudgetInput cur={cur} defaultValue={w.budget} onChange={(v) => update((x) => ({ ...x, budget: v }))} /></section>
        <Summary s={s} cur={cur} />
        <ExpenseForm cur={cur} s={s} onAdd={(it) => update((x) => ({ ...x, items: [...x.items, it] }))} />
        <div className="split">
          <ExpenseList s={s} onDelete={(id) => update((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) }))} />
          <Breakdown s={s} />
        </div>
        <ExportCard s={s} cur={cur} />
        <ThemePanel db={db} setDb={setDb} onClear={clear} />
      </div>
      <div className={'dock' + (over ? ' neg' : '')} aria-live="polite">
        <div><small>{over ? 'Over budget by' : 'Remaining this week'}</small><b>{fmt(Math.abs(s.rem))}</b></div>
        <button className="btn" onClick={() => { const el = document.getElementById('name'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.focus(), 350); }}>+ Add expense</button>
      </div>
    </>
  );
}
