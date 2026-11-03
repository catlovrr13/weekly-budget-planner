import { useState, useEffect, useMemo } from 'react';
import { DAYS, CATS, SCOPES, hasExpenses, hasDebts, fmt, weekKey, addDays, short, group, snap, downloadTxt, downloadXlsx, parseReport, txtReport, mailtoLink, monthOfWeek, weekKeysOfMonth, fmtDate, todayStr, rateWeek, starsFor, starText } from './utils.js';

const KEY = 'pinkBudgetReactV1';
const SWATCHES = [['Blush', '#f4a6bd'], ['Rose', '#ee86a5'], ['Peach pink', '#f8b4b0'], ['Mauve', '#d9a0c0'], ['Petal', '#fbc8d8']];
const EMPTY = { budget: 0, items: [] };
const DEFAULTS = { weeks: {}, accent: '#f4a6bd', mode: 'auto', email: '', debts: [], owed: [] };
const TABS = [['expenses', 'Expenses'], ['debt', 'Debt'], ['month', 'Monthly'], ['data', 'Backup']];

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return DEFAULTS; }
}

function Tabs({ tab, setTab }) {
  const move = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    const [next] = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    document.getElementById('tab-' + next)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Sections" onKeyDown={move}>
      {TABS.map(([id, label]) => (
        <button key={id} id={'tab-' + id} className={'tab' + (tab === id ? ' on' : '')} role="tab"
          aria-selected={tab === id} aria-controls={'panel-' + id} tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)}>{label}</button>
      ))}
    </div>
  );
}

function WeekPicker({ cur, setCur, s, rev, budget, onBudget }) {
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
      <div className="row" style={{ marginTop: 12 }}>
        <div className="f">
          <label htmlFor="budget">Budget for this week (₱)</label>
          {/* key resets the field when the week changes; uncontrolled so decimals type naturally */}
          <input key={`${cur}:${rev}`} id="budget" type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 3,500"
            defaultValue={budget || ''} onChange={(e) => onBudget(Math.max(0, parseFloat(e.target.value) || 0))} />
        </div>
      </div>
    </section>
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

function ExpenseForm({ cur, s, onAdd, debts = [] }) {
  const todayIdx = weekKey(new Date()) === cur ? (new Date().getDay() + 6) % 7 : 0;
  const [f, setF] = useState({ name: '', amt: '', cat: CATS[0], day: todayIdx, debt: '' });
  useEffect(() => setF((x) => ({ ...x, day: todayIdx })), [cur, todayIdx]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const a = parseFloat(f.amt), after = s.rem - a;
  const dbt = debts.find((d) => String(d.id) === f.debt);
  const tooMuch = !!dbt && a > dbt.left;
  const pickDebt = (e) => {
    const d = debts.find((x) => String(x.id) === e.target.value);
    setF({ ...f, debt: e.target.value, cat: d ? 'Debt' : f.cat, name: d && !f.name.trim() ? `Payment to ${d.lender}` : f.name });
  };
  const focus = (id) => document.getElementById(id)?.focus();

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return focus('name');
    if (!(a > 0) || tooMuch) return focus('amt');
    onAdd({ id: Date.now(), name: f.name.trim(), amt: Math.round(a * 100) / 100, cat: dbt ? 'Debt' : f.cat, day: +f.day, ...(dbt ? { debtId: dbt.id } : {}) });
    setF({ ...f, name: '', amt: '', debt: '' });
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
        {debts.length > 0 && (
          <div className="f" style={{ flex: '2 1 220px' }}>
            <label htmlFor="debt">This pays off a debt (optional)</label>
            <select id="debt" value={f.debt} onChange={pickDebt}>
              <option value="">No, regular expense</option>
              {debts.map((d) => <option key={d.id} value={d.id}>{d.lender}: {fmt(d.left)} left</option>)}
            </select>
          </div>
        )}
        <button className="btn" type="submit" id="add">Add expense</button>
      </form>
      <div className={'preview' + (a > 0 && (after < 0 || tooMuch) ? ' bad' : '')}>
        {a > 0 && (tooMuch
          ? `That’s more than the ${fmt(dbt.left)} left on this debt.`
          : (after < 0 ? `Adding this would put you over budget by ${fmt(-after)}.` : `After this, you’ll have ${fmt(after)} left.`)
            + (dbt ? ` ${dbt.lender}’s debt will drop to ${fmt(dbt.left - a)}.` : ''))}
      </div>
    </section>
  );
}

function ExpenseList({ s, onDelete, lenders = {} }) {
  return (
    <section className="card" aria-label="Expenses">
      <h2>This week’s expenses</h2>
      <ul>
        {!s.items.length && <li className="empty">No expenses yet for this week.</li>}
        {s.items.map((i) => (
          <li className="item" key={i.id}>
            <div className="grow"><b>{i.name}</b><span>{DAYS[i.day]}, {short(addDays(s.mon, i.day))}{i.debtId && lenders[i.debtId] ? ` · pays ${lenders[i.debtId]}` : ''}</span></div>
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

function ScopeField({ id, value, onChange }) {
  return (
    <div className="f" style={{ flex: '1 1 220px' }}>
      <label htmlFor={id}>What to include</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {SCOPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </div>
  );
}

function ExportCard({ s, cur, extra, scope, setScope }) {
  const what = hasExpenses(scope)
    ? (hasDebts(scope) ? 'this week’s budget and expenses, plus both debt lists' : 'this week’s budget, summary and every expense')
    : 'what you owe and what people owe you';
  return (
    <section className="card" aria-label="Export">
      <h2>Export</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Saves {what}.</p>
      <div className="row">
        <ScopeField id="exscope" value={scope} onChange={setScope} />
        <button className="btn" onClick={() => downloadTxt(s, cur, extra, scope)}>Download .txt</button>
        <button className="btn" onClick={() => downloadXlsx(s, cur, extra, scope)}>Download Excel (.xlsx)</button>
      </div>
      <p className="hint">The .txt can be loaded back in below. The .xlsx is for reading in Excel.</p>
    </section>
  );
}

function EmailCard({ email, setEmail, s, cur, extra, scope }) {
  const [msg, setMsg] = useState('');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = () => {
    if (!valid) { setMsg('Enter a valid email address first.'); document.getElementById('email')?.focus(); return; }
    const { href, trimmed } = mailtoLink(email.trim(), s, cur, extra, scope);
    setMsg(trimmed ? 'Your email app should open. The message was shortened to fit, so use Download .txt for the full report.' : 'Your email app should open with the summary ready to send.');
    window.location.href = href;
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(txtReport(s, cur, extra, scope)); setMsg('Summary copied. Paste it anywhere.'); }
    catch { setMsg('Couldn’t copy here. Try Download .txt instead.'); }
  };

  return (
    <section className="card" aria-label="Email summary">
      <h2>Email or copy</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Sends the same thing you picked above. Opens your email app with it filled in.</p>
      <div className="row">
        <div className="f" style={{ flex: '2 1 220px' }}>
          <label htmlFor="email">Your email address</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(''); }} />
        </div>
        <button className="btn" onClick={send}>Email summary</button>
        <button className="btn ghost" onClick={copy}>Copy summary</button>
      </div>
      <div className={'preview' + (msg.startsWith('Enter') ? ' bad' : '')} role="status">{msg}</div>
    </section>
  );
}

function ImportCard({ onLoad }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const p = useMemo(() => (file ? parseReport(file.text) : null), [file]);

  const pick = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMsg('');
    if (!/\.txt$/i.test(f.name) && f.type !== 'text/plain') { setFile(null); return setErr('Please choose a .txt file.'); }
    if (f.size > 1e6) { setFile(null); return setErr('That file is too large (1 MB max).'); }
    try { setFile({ name: f.name, text: await f.text() }); setErr(''); }
    catch { setFile(null); setErr('Couldn’t read that file. Please try again.'); }
  };

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const inside = p && [
    p.has.expenses ? count(p.items.length, 'expense', 'expenses') + ` in week ${p.key}` : null,
    p.has.debts ? count(p.debts.length, 'debt', 'debts') + ' you owe' : null,
    p.has.debts ? count(p.owed.length, 'person', 'people') + ' who owe you' : null,
  ].filter(Boolean).join(', ');

  const run = (scope) => {
    if (!onLoad(p, scope)) return;
    const done = [
      hasExpenses(scope) ? `${count(p.items.length, 'expense', 'expenses')} into week ${p.key}` : null,
      hasDebts(scope) ? 'your debt lists' : null,
    ].filter(Boolean).join(' and ');
    setMsg(`Loaded ${done}.`);
  };

  return (
    <section className="card" aria-label="Import">
      <h2>Import a .txt file</h2>
      <p className="sub" style={{ marginBottom: 12 }}>Open a .txt file to read it. If it’s a report from this app, you can load back everything in it, or just the part you need.</p>
      <label htmlFor="txtfile">Choose a .txt file</label>
      <input id="txtfile" type="file" accept=".txt,text/plain" onChange={pick} />
      {err && <div className="preview bad" role="alert">{err}</div>}
      {file && (
        <>
          <h3 className="fname">{file.name}</h3>
          <div className="ok" style={{ marginTop: 4 }}>
            {p
              ? `This is a Weekly Budget report: ${inside || 'nothing that can be loaded'}.`
              : 'This isn’t a Weekly Budget report, so you can read it here but not load it.'}
          </div>
          <pre className="txtview" tabIndex={0}>{file.text || '(This file is empty.)'}</pre>
          <div className="row">
            {p?.has.expenses && p?.has.debts && <button className="btn" onClick={() => run('all')}>Load everything</button>}
            {p?.has.expenses && <button className="btn ghost" onClick={() => run('expenses')}>Load expenses only</button>}
            {p?.has.debts && <button className="btn ghost" onClick={() => run('debts')}>Load debts only</button>}
            <button className="btn ghost" onClick={() => { setFile(null); setMsg(''); }}>Close</button>
          </div>
          {msg && <div className="preview" role="status">{msg}</div>}
        </>
      )}
    </section>
  );
}

function DebtForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({ lender: f.lender.trim(), purpose: f.purpose.trim(), amount: Math.round(parseFloat(f.amount) * 100) / 100 });
    if (!onCancel) setF(initial);
  };
  return (
    <form className="row" onSubmit={submit}>
      <label className="f"><span>Who did you borrow from?</span><input required maxLength={60} value={f.lender} onChange={set('lender')} placeholder="e.g. Ate Joy" /></label>
      <label className="f"><span>What was it for?</span><input required maxLength={80} value={f.purpose} onChange={set('purpose')} placeholder="e.g. Tuition" /></label>
      <label className="f"><span>Amount borrowed (₱)</span><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" /></label>
      <button className="btn" type="submit">{submitLabel}</button>
      {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function DebtsCard({ rows, onAdd, onEdit, onDelete }) {
  const [editing, setEditing] = useState(null);
  const totalLeft = rows.reduce((a, d) => a + d.left, 0);
  const totalPaid = rows.reduce((a, d) => a + Math.min(d.paid, d.amount), 0);
  return (
    <section className="card" aria-label="Money I owe">
      <h2>Money I owe</h2>
      <div className="mstats">
        <div className={'mstat' + (totalLeft > 0 ? ' over' : ' good')}><small>Still owed</small><b>{fmt(totalLeft)}</b></div>
        <div className="mstat good"><small>Paid so far</small><b>{fmt(totalPaid)}</b></div>
      </div>
      <DebtForm initial={{ lender: '', purpose: '', amount: '' }} submitLabel="Add debt" onSave={onAdd} />
      <ul className="dlist">
        {!rows.length && <li className="empty">No debts listed.</li>}
        {rows.map((d) => editing === d.id ? (
          <li className="dli" key={d.id}>
            <DebtForm initial={{ lender: d.lender, purpose: d.purpose, amount: String(d.amount) }} submitLabel="Save"
              onSave={(v) => { onEdit(d.id, v); setEditing(null); }} onCancel={() => setEditing(null)} />
          </li>
        ) : (
          <li className="dli" key={d.id}>
            <div className="dtop">
              <div className="grow"><b>{d.lender}</b><span>{d.purpose}</span></div>
              <span className={'chip ' + (d.left === 0 ? 'good' : 'over')}>{d.left === 0 ? 'Paid off' : `${fmt(d.left)} left`}</span>
            </div>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, (d.paid / d.amount) * 100))} aria-label={`Paid toward ${d.lender}`}>
              <i style={{ width: Math.min(100, (d.paid / d.amount) * 100) + '%' }} />
            </div>
            <div className="wk-n">Paid {fmt(d.paid)} of {fmt(d.amount)} · {d.count} payment{d.count === 1 ? '' : 's'}</div>
            <div className="acts">
              <button className="btn ghost sm" onClick={() => setEditing(d.id)}>Edit</button>
              <button className="btn ghost sm" onClick={() => onDelete(d)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">To pay a debt down, add an expense on the Expenses tab and pick the debt under “This pays off a debt.” Its balance drops automatically, and goes back up if you delete that expense.</p>
    </section>
  );
}

function OwedForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({ person: f.person.trim(), amount: Math.round(parseFloat(f.amount) * 100) / 100, borrowedOn: f.borrowedOn, promisedOn: f.promisedOn });
    if (!onCancel) setF(initial);
  };
  return (
    <form className="row" onSubmit={submit}>
      <label className="f"><span>Who owes you?</span><input required maxLength={60} value={f.person} onChange={set('person')} placeholder="e.g. Mark" /></label>
      <label className="f"><span>Amount (₱)</span><input required type="number" min="0.01" step="0.01" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" /></label>
      <label className="f"><span>Date borrowed</span><input required type="date" value={f.borrowedOn} onChange={set('borrowedOn')} /></label>
      <label className="f"><span>Promised pay date (optional)</span><input type="date" value={f.promisedOn} onChange={set('promisedOn')} /></label>
      <button className="btn" type="submit">{submitLabel}</button>
      {onCancel && <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function OwedCard({ list, onAdd, onEdit, onDelete }) {
  const [editing, setEditing] = useState(null);
  const today = todayStr();
  const late = (x) => !x.paid && x.promisedOn && x.promisedOn < today;
  const unpaid = list.filter((x) => !x.paid);
  const overdue = unpaid.filter(late);
  const sorted = [...list].sort((a, b) =>
    Number(!!a.paid) - Number(!!b.paid) || (a.promisedOn || '9999').localeCompare(b.promisedOn || '9999') || a.borrowedOn.localeCompare(b.borrowedOn));
  return (
    <section className="card" aria-label="Money owed to me">
      <h2>Money owed to me</h2>
      <div className="mstats">
        <div className="mstat good"><small>Still owed to me</small><b>{fmt(unpaid.reduce((a, x) => a + x.amount, 0))}</b></div>
        <div className={'mstat' + (overdue.length ? ' over' : '')}><small>Past promised date</small><b>{overdue.length ? fmt(overdue.reduce((a, x) => a + x.amount, 0)) : 'None'}</b></div>
      </div>
      <OwedForm initial={{ person: '', amount: '', borrowedOn: today, promisedOn: '' }} submitLabel="Add" onSave={onAdd} />
      <ul className="dlist">
        {!sorted.length && <li className="empty">Nobody owes you right now.</li>}
        {sorted.map((x) => editing === x.id ? (
          <li className="dli" key={x.id}>
            <OwedForm initial={{ person: x.person, amount: String(x.amount), borrowedOn: x.borrowedOn, promisedOn: x.promisedOn || '' }} submitLabel="Save"
              onSave={(v) => { onEdit(x.id, v); setEditing(null); }} onCancel={() => setEditing(null)} />
          </li>
        ) : (
          <li className={'dli' + (x.paid ? ' done' : '')} key={x.id}>
            <div className="dtop">
              <div className="grow">
                <b>{x.person}</b>
                <span>Borrowed {fmtDate(x.borrowedOn)} · {x.promisedOn ? `Promised to pay ${fmtDate(x.promisedOn)}` : 'No pay date given'}</span>
              </div>
              <span className="amt">{fmt(x.amount)}</span>
            </div>
            {x.paid && <span className="chip good">Paid back</span>}
            {late(x) && <span className="chip over">Past promised date</span>}
            <div className="acts">
              <button className="btn ghost sm" onClick={() => onEdit(x.id, { paid: !x.paid })}>{x.paid ? 'Mark unpaid' : 'Mark paid back'}</button>
              <button className="btn ghost sm" onClick={() => setEditing(x.id)}>Edit</button>
              <button className="btn ghost sm" onClick={() => onDelete(x)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function weekStatus(s, now) {
  const past = addDays(s.mon, 7) <= now, started = s.mon <= now;
  if (!s.b && !s.items.length) return { cls: 'none', text: 'Nothing recorded' };
  if (!s.b) return { cls: 'none', text: `No budget set · spent ${fmt(s.spent)}` };
  if (s.rem < 0) return { cls: 'over', text: `Over by ${fmt(-s.rem)}` };
  if (past) return { cls: 'good', text: `${fmt(s.rem)} left over` };
  if (started) return { cls: 'good', text: `${fmt(s.rem)} left so far` };
  return { cls: 'none', text: `Planned: ${fmt(s.b)}` };
}

function RatingCard({ s, debts }) {
  const r = rateWeek(s, debts);
  const now = new Date();
  const live = s.mon <= now && addDays(s.mon, 7) > now;
  if (!r) return (
    <section className="card rating" aria-label="Weekly rating">
      <div className="face" aria-hidden="true">🌸</div>
      <div className="rbody"><b className="rl">Your weekly rating</b><p className="sub" style={{ margin: 0 }}>Set a budget and add a few expenses to see how you’re doing this week.</p></div>
    </section>
  );
  return (
    <section className="card rating" aria-label="Weekly rating">
      <div className="face" aria-hidden="true">{r.face}</div>
      <div className="rbody">
        <div className="stars" role="img" aria-label={`${r.stars} out of 5 stars`}>{starText(r.stars)}</div>
        <b className="rl">{r.label}</b><span className="score">{r.score}/100{live ? ' so far' : ''}</span>
        <ul className="why">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </section>
  );
}

function MonthPanel({ db, cur, openWeek }) {
  const [m, setM] = useState(() => monthOfWeek(cur));
  useEffect(() => setM(monthOfWeek(cur)), [cur]);
  const shift = (n) => setM(({ y, mo }) => { const d = new Date(y, mo + n, 1); return { y: d.getFullYear(), mo: d.getMonth() }; });
  const now = new Date(), today = todayStr();
  const debtRows = db.debtRows;
  const weeks = weekKeysOfMonth(m.y, m.mo).map((key) => {
    const s = snap(db.weeks[key] || EMPTY, key);
    return { key, s, r: rateWeek(s, debtRows), debtPaid: s.items.filter((i) => i.debtId).reduce((a, i) => a + i.amt, 0) };
  });
  const tracked = weeks.filter((w) => w.s.b > 0);
  const started = tracked.filter((w) => w.s.mon <= now);
  const leftPast = tracked.filter((w) => addDays(w.s.mon, 7) <= now && w.s.rem > 0).reduce((a, w) => a + w.s.rem, 0);
  const overTotal = tracked.filter((w) => w.s.rem < 0).reduce((a, w) => a - w.s.rem, 0);
  const onTrack = started.filter((w) => w.s.rem >= 0).length;
  const rated = weeks.filter((w) => w.r);
  const avg = rated.length ? Math.round(rated.reduce((a, w) => a + w.r.score, 0) / rated.length) : null;
  const debtPaidMonth = weeks.reduce((a, w) => a + w.debtPaid, 0);
  const debtLeft = debtRows.reduce((a, d) => a + d.left, 0);
  const owedTotal = db.owed.filter((o) => !o.paid).reduce((a, o) => a + o.amount, 0);
  const prefix = `${m.y}-${String(m.mo + 1).padStart(2, '0')}`;
  const expected = db.owed.filter((o) => !o.paid && o.promisedOn && o.promisedOn.startsWith(prefix)).sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  const title = new Date(m.y, m.mo, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  return (
    <section className="card" aria-label="Month overview">
      <div className="mh">
        <button className="btn ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h2>{title}</h2>
        <button className="btn ghost" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="mstats">
        <div className="mstat good"><small>Left from past weeks</small><b>{fmt(leftPast)}</b></div>
        <div className={'mstat' + (overTotal > 0 ? ' over' : '')}><small>Went over by</small><b>{fmt(overTotal)}</b></div>
        <div className="mstat"><small>Weeks within budget</small><b>{started.length ? `${onTrack} of ${started.length}` : 'None tracked yet'}</b></div>
      </div>
      <h3 className="sec">Debts and loans</h3>
      <div className="mstats">
        <div className="mstat good"><small>Paid toward debts</small><b>{fmt(debtPaidMonth)}</b></div>
        <div className={'mstat' + (debtLeft > 0 ? ' over' : ' good')}><small>Debts still owed</small><b>{fmt(debtLeft)}</b></div>
        <div className="mstat good"><small>Owed to me</small><b>{fmt(owedTotal)}</b></div>
        <div className="mstat"><small>Average rating</small><b>{avg === null ? 'Not rated yet' : `${starText(starsFor(avg))} ${avg}`}</b></div>
      </div>
      {expected.length > 0 && (
        <>
          <h3 className="sec">Expected this month</h3>
          {expected.map((o) => (
            <div className={'exp' + (o.promisedOn < today ? ' late' : '')} key={o.id}>
              <span>{o.person} · {fmtDate(o.promisedOn)}{o.promisedOn < today ? ' (past)' : ''}</span><b>{fmt(o.amount)}</b>
            </div>
          ))}
        </>
      )}
      <h3 className="sec">Weeks</h3>
      <div className="wklist">
        {weeks.map(({ key, s, r, debtPaid }) => {
          const st = weekStatus(s, now);
          return (
            <button key={key} className={'wk' + (key === cur ? ' sel' : '')} onClick={() => openWeek(key)} aria-current={key === cur ? 'true' : undefined}>
              <div className="wk-h"><b>{short(s.mon)} – {short(addDays(s.mon, 6))}</b><span className={'chip ' + st.cls}>{st.text}</span></div>
              <div className="strip">
                {DAYS.map((d, i) => {
                  const day = addDays(s.mon, i);
                  const cls = 'dy' + (day.getMonth() !== m.mo ? ' out' : '') + (day.toDateString() === now.toDateString() ? ' today' : '');
                  return <span key={d} className={cls}>{day.getDate()}{s.items.some((x) => x.day === i) && <i />}</span>;
                })}
              </div>
              {s.b > 0 && <div className="wk-n">Budget {fmt(s.b)} · Spent {fmt(s.spent)}</div>}
              {(r || debtPaid > 0) && (
                <div className="wk-n">
                  {r && <span className="mstars" role="img" aria-label={`${r.stars} out of 5 stars`}>{starText(r.stars)}</span>}
                  {r && debtPaid > 0 && ' · '}
                  {debtPaid > 0 && `Paid ${fmt(debtPaid)} to debts`}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="cap">Tap a week to open it on the Expenses tab. Dots mark days with expenses. Weeks are grouped by the month their Thursday falls in.</p>
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
  const [rev, setRev] = useState(0);
  const [tab, setTab] = useState('expenses');
  const [scope, setScope] = useState('all');
  const w = db.weeks[cur] || EMPTY;
  const s = snap(w, cur);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } }, [db]);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', db.accent);
    db.mode === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', db.mode);
  }, [db.accent, db.mode]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  const update = (fn) => setDb((d) => ({ ...d, weeks: { ...d.weeks, [cur]: fn(d.weeks[cur] || EMPTY) } }));
  const clear = () => confirm('Remove all expenses for this week?') && update((x) => ({ ...x, items: [] }));
  const debtStats = useMemo(() => {
    const t = {};
    Object.values(db.weeks).forEach((w) => w.items.forEach((i) => {
      if (i.debtId) { const e = (t[i.debtId] ||= { paid: 0, count: 0 }); e.paid += i.amt; e.count += 1; }
    }));
    return t;
  }, [db.weeks]);
  const debtRows = db.debts.map((d) => {
    const st = debtStats[d.id] || { paid: 0, count: 0 };
    return { ...d, paid: st.paid, count: st.count, left: Math.max(0, Math.round((d.amount - st.paid) * 100) / 100) };
  });
  const lenders = Object.fromEntries(db.debts.map((d) => [d.id, d.lender]));
  const extra = { debts: debtRows, owed: db.owed };
  const addDebt = (v) => setDb((x) => ({ ...x, debts: [...x.debts, { id: Date.now(), ...v }] }));
  const editDebt = (id, v) => setDb((x) => ({ ...x, debts: x.debts.map((d) => (d.id === id ? { ...d, ...v } : d)) }));
  const deleteDebt = (d) => {
    const n = d.count ? ` Its ${d.count} payment${d.count === 1 ? '' : 's'} stay in your weekly budgets as regular expenses.` : '';
    if (!confirm(`Delete the debt to ${d.lender}?${n}`)) return;
    setDb((x) => ({
      ...x,
      debts: x.debts.filter((y) => y.id !== d.id),
      weeks: Object.fromEntries(Object.entries(x.weeks).map(([k, w]) => [k, { ...w, items: w.items.map((i) => (i.debtId === d.id ? { ...i, debtId: undefined } : i)) }])),
    }));
  };
  const addOwed = (v) => setDb((x) => ({ ...x, owed: [...x.owed, { id: Date.now(), paid: false, ...v }] }));
  const editOwed = (id, v) => setDb((x) => ({ ...x, owed: x.owed.map((o) => (o.id === id ? { ...o, ...v } : o)) }));
  const deleteOwed = (o) => confirm(`Delete ${o.person}’s ${fmt(o.amount)} from your list?`) && setDb((x) => ({ ...x, owed: x.owed.filter((y) => y.id !== o.id) }));

  // Loads a parsed .txt report back in: the whole thing, or only expenses, or only the debt lists.
  const importData = (p, loadScope) => {
    const wantEx = hasExpenses(loadScope), wantDebt = hasDebts(loadScope);
    const old = db.weeks[p.key];
    if (wantEx && old && (old.items.length || old.budget) && !confirm(`Replace what’s saved for week ${p.key}?`)) return false;
    if (wantDebt && (db.debts.length || db.owed.length)
      && !confirm(`Replace your saved debts (${db.debts.length}) and the ${db.owed.length} people who owe you with the lists in this file?`)) return false;
    const base = Date.now();
    setDb((d) => {
      const next = { ...d };
      if (wantDebt) {
        next.debts = p.debts.map((x, i) => ({ id: base + i, lender: x.lender, purpose: x.purpose, amount: x.amount }));
        next.owed = p.owed.map((o, i) => ({ id: base + 500 + i, ...o }));
      }
      if (wantEx) {
        // Payments reconnect to their debt by lender name, since ids are reassigned on import.
        const byLender = Object.fromEntries((wantDebt ? next.debts : d.debts).map((x) => [x.lender, x.id]));
        const items = p.items.map((it, i) => {
          const debtId = it.lender ? byLender[it.lender] : undefined;
          return { id: base + 1000 + i, name: it.name, cat: it.cat, amt: it.amt, day: it.day, ...(debtId ? { debtId } : {}) };
        });
        next.weeks = { ...d.weeks, [p.key]: { budget: p.budget, items } };
      }
      return next;
    });
    if (wantEx) { setCur(p.key); setRev((r) => r + 1); }
    return true;
  };

  const openWeek = (key) => { setCur(key); setTab('expenses'); };
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
        <Tabs tab={tab} setTab={setTab} />
        <main id={'panel-' + tab} role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={-1}>
          {tab === 'expenses' && (
            <>
              <WeekPicker cur={cur} setCur={setCur} s={s} rev={rev} budget={w.budget} onBudget={(v) => update((x) => ({ ...x, budget: v }))} />
              <Summary s={s} cur={cur} />
              <RatingCard s={s} debts={debtRows} />
              <ExpenseForm cur={cur} s={s} debts={debtRows.filter((d) => d.left > 0)} onAdd={(it) => update((x) => ({ ...x, items: [...x.items, it] }))} />
              <div className="split">
                <ExpenseList s={s} lenders={lenders} onDelete={(id) => update((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) }))} />
                <Breakdown s={s} />
              </div>
            </>
          )}
          {tab === 'debt' && (
            <>
              <DebtsCard rows={debtRows} onAdd={addDebt} onEdit={editDebt} onDelete={deleteDebt} />
              <OwedCard list={db.owed} onAdd={addOwed} onEdit={editOwed} onDelete={deleteOwed} />
            </>
          )}
          {tab === 'month' && <MonthPanel db={{ ...db, debtRows }} cur={cur} openWeek={openWeek} />}
          {tab === 'data' && (
            <>
              <ExportCard s={s} cur={cur} extra={extra} scope={scope} setScope={setScope} />
              <EmailCard email={db.email} setEmail={(v) => setDb((d) => ({ ...d, email: v }))} s={s} cur={cur} extra={extra} scope={scope} />
              <ImportCard onLoad={importData} />
              <ThemePanel db={db} setDb={setDb} onClear={clear} />
            </>
          )}
        </main>
      </div>
      <div className={'dock' + (over ? ' neg' : '')} aria-live="polite">
        <div><small>{over ? 'Over budget by' : 'Remaining this week'}</small><b>{fmt(Math.abs(s.rem))}</b></div>
        <button className="btn" onClick={jumpToAdd}>+ Add expense</button>
      </div>
    </>
  );
}
