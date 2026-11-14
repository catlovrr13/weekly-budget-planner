import { useState } from 'react';
import { fmt, sym, r2, sum, todayStr, fmtDate, mondayOf, isoDate, weekKey, DAYS } from '../utils.js';
import { WALLET_KINDS } from '../data.js';
import { goalPlan, onHand } from '../features.js';
import { plural } from './ui.jsx';

const kindName = (k) => WALLET_KINDS.find(([v]) => v === k)?.[1] || 'Other';

function WalletForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({ name: f.name.trim(), kind: f.kind, opening: r2(parseFloat(f.opening) || 0) });
    if (!onCancel) setF(initial);
  };
  return (
    <form className="row" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
      <label className="f">
        <span>Wallet name</span>
        <input required maxLength={40} value={f.name} onChange={set('name')} placeholder="e.g. GCash" />
      </label>
      <label className="f">
        <span>Type</span>
        <select value={f.kind} onChange={set('kind')}>
          {WALLET_KINDS.map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        <span>{f.kind === 'card' ? `Starting balance (${sym()}, owed as negative)` : `Starting balance (${sym()})`}</span>
        <input type="number" step="0.01" inputMode="decimal" value={f.opening} onChange={set('opening')} placeholder="0.00" />
      </label>
      <button className="btn" type="submit">
        {submitLabel}
      </button>
      {onCancel && (
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}

function TransferForm({ wallets, onSave }) {
  const [f, setF] = useState({ from: String(wallets[0].id), to: String(wallets[1].id), amt: '', date: todayStr() });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const a = parseFloat(f.amt);
  const same = f.from === f.to;
  const submit = (e) => {
    e.preventDefault();
    if (!(a > 0) || same) return;
    const pick = (v) => wallets.find((w) => String(w.id) === v).id;
    onSave({ from: pick(f.from), to: pick(f.to), amt: r2(a), date: f.date || todayStr() });
    setF({ ...f, amt: '' });
  };
  return (
    <form className="row" onSubmit={submit}>
      <label className="f">
        <span>From</span>
        <select value={f.from} onChange={set('from')}>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        <span>To</span>
        <select value={f.to} onChange={set('to')} aria-invalid={same}>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        <span>Amount ({sym()})</span>
        <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={f.amt} onChange={set('amt')} placeholder="0.00" />
      </label>
      <label className="f">
        <span>Date</span>
        <input type="date" value={f.date} onChange={set('date')} />
      </label>
      <button className="btn" type="submit" disabled={same}>
        Move money
      </button>
      {same && (
        <span className="err" style={{ flexBasis: '100%' }}>
          Pick two different wallets.
        </span>
      )}
    </form>
  );
}

export function WalletsCard({ rows, transfers, onAdd, onEdit, onDelete, onTransfer, onDeleteTransfer }) {
  const [editing, setEditing] = useState(null);
  const names = Object.fromEntries(rows.map((w) => [w.id, w.name]));
  const owedOnCards = -sum(
    rows.filter((w) => w.kind === 'card' && w.balance < 0),
    (w) => w.balance,
  );
  const recent = [...transfers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return (
    <section className="card" aria-label="Wallets">
      <h2>Wallets</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Where your money is: cash, e-wallets, bank accounts. Pick a wallet when you add an expense or income and its balance updates.
      </p>
      {rows.length > 0 && (
        <div className="mstats">
          <div className={'mstat' + (onHand(rows) < 0 ? ' over' : ' good')}>
            <small>Money on hand</small>
            <b>{fmt(onHand(rows))}</b>
          </div>
          {owedOnCards > 0 && (
            <div className="mstat over">
              <small>Owed on credit cards</small>
              <b>{fmt(owedOnCards)}</b>
            </div>
          )}
        </div>
      )}
      <WalletForm initial={{ name: '', kind: 'cash', opening: '' }} submitLabel="Add wallet" onSave={onAdd} />
      <ul className="dlist">
        {!rows.length && <li className="empty">No wallets yet. Add your cash, GCash or bank account to see what you really have.</li>}
        {rows.map((w) =>
          editing === w.id ? (
            <li className="dli" key={w.id}>
              <WalletForm
                initial={{ name: w.name, kind: w.kind, opening: String(w.opening) }}
                submitLabel="Save"
                onSave={(v) => {
                  onEdit(w.id, v);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li className="dli" key={w.id}>
              <div className="dtop">
                <div className="grow">
                  <b>{w.name}</b>
                  <span>
                    {kindName(w.kind)} · started at {fmt(w.opening)}
                  </span>
                </div>
                <span className={'amt' + (w.balance < 0 ? ' neg' : '')}>
                  {w.kind === 'card' && w.balance < 0 ? `${fmt(-w.balance)} owed` : fmt(w.balance)}
                </span>
              </div>
              <div className="acts">
                <button className="btn ghost sm" type="button" onClick={() => setEditing(w.id)} aria-label={`Edit ${w.name}`}>
                  Edit
                </button>
                <button className="btn ghost sm" type="button" onClick={() => onDelete(w)} aria-label={`Delete ${w.name}`}>
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {rows.length >= 2 && (
        <>
          <h3 className="sec">Move money between wallets</h3>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            For ATM withdrawals, cash-ins, or paying a credit card. It doesn’t count as spending.
          </p>
          <TransferForm key={rows.map((w) => w.id).join()} wallets={rows} onSave={onTransfer} />
          {recent.length > 0 && (
            <ul className="pays" style={{ marginTop: 10 }}>
              {recent.map((t) => (
                <li key={t.id}>
                  {fmtDate(t.date)}: {fmt(t.amt)} from {names[t.from]} to {names[t.to]}
                  <button className="x" type="button" onClick={() => onDeleteTransfer(t)} aria-label={`Remove transfer of ${fmt(t.amt)}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function IncomeCard({ cur, s, income = [], wallets, onAdd, onDelete }) {
  const thisWeek = weekKey(new Date()) === cur;
  const defaultDate = thisWeek ? todayStr() : isoDate(mondayOf(cur));
  const blank = { name: '', amt: '', date: defaultDate, wallet: wallets[0] ? String(wallets[0].id) : '', repeat: false };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    setErr('');
  };
  const names = Object.fromEntries(wallets.map((w) => [w.id, w.name]));
  const submit = (e) => {
    e.preventDefault();
    const a = parseFloat(f.amt);
    if (!f.name.trim()) return setErr('Add a name, like Allowance or Salary.');
    if (!(a > 0)) return setErr('Enter an amount above zero.');
    const wal = wallets.find((w) => String(w.id) === f.wallet);
    onAdd({ name: f.name.trim(), amt: r2(a), date: f.date || defaultDate, ...(wal ? { walletId: wal.id } : {}) }, f.repeat);
    setF({ ...blank, wallet: f.wallet });
  };
  return (
    <section className="card" aria-label="Income">
      <h2>Income</h2>
      <form className="row" onSubmit={submit} noValidate>
        <label className="f" style={{ flex: '2 1 180px' }}>
          <span>Where’s it from?</span>
          <input value={f.name} onChange={set('name')} maxLength={60} placeholder="e.g. Allowance" />
        </label>
        <label className="f">
          <span>Amount ({sym()})</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={f.amt} onChange={set('amt')} placeholder="0.00" />
        </label>
        <label className="f">
          <span>Date received</span>
          <input type="date" value={f.date} onChange={set('date')} />
        </label>
        {wallets.length > 0 && (
          <label className="f">
            <span>Received in</span>
            <select value={f.wallet} onChange={set('wallet')}>
              <option value="">Not tracked</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="chk">
          <input type="checkbox" checked={f.repeat} onChange={set('repeat')} /> Every week
        </label>
        <button className="btn" type="submit">
          Add income
        </button>
      </form>
      {err && (
        <div className="preview bad" role="alert">
          {err}
        </div>
      )}
      <h3 className="sec">Week of {fmtDate(isoDate(s.mon))}</h3>
      <ul>
        {!income.length && <li className="empty">No income recorded for this week.</li>}
        {income.map((i) => (
          <li className="item" key={i.id}>
            <div className="grow">
              <b>{i.name}</b>
              <span>
                {DAYS[i.day]}
                {i.walletId != null && names[i.walletId] ? ` · into ${names[i.walletId]}` : ''}
                {i.recurringId != null ? ' · every week' : ''}
              </span>
            </div>
            <span className="amt pos">+{fmt(i.amt)}</span>
            <button className="x" type="button" onClick={() => onDelete(i)} aria-label={`Delete income ${i.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {income.length > 0 && (
        <p className="hint">
          Total this week: {fmt(sum(income))}. Spent: {fmt(s.spent)}.{' '}
          {sum(income) >= s.spent ? 'You earned more than you spent.' : 'You spent more than you earned.'}
        </p>
      )}
    </section>
  );
}

function AmountDateForm({ max, label, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState({ amt: '', date: todayStr() });
  const a = parseFloat(f.amt);
  const bad = !(a > 0) || (max != null && a > max);
  return (
    <form
      className="row"
      style={{ marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!bad) onSave({ amt: r2(a), date: f.date || todayStr() });
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <label className="f">
        <span>
          {label} ({sym()})
        </span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={f.amt}
          onChange={(e) => setF({ ...f, amt: e.target.value })}
          autoFocus
        />
      </label>
      <label className="f">
        <span>Date</span>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </label>
      <button className="btn" type="submit" disabled={bad}>
        {submitLabel}
      </button>
      <button className="btn ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

function GoalForm({ onSave }) {
  const blank = { name: '', target: '', due: '' };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name: f.name.trim(), target: r2(parseFloat(f.target)), due: f.due });
        setF(blank);
      }}
    >
      <label className="f" style={{ flex: '2 1 180px' }}>
        <span>What are you saving for?</span>
        <input required maxLength={60} value={f.name} onChange={set('name')} placeholder="e.g. New phone" />
      </label>
      <label className="f">
        <span>Target ({sym()})</span>
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={f.target}
          onChange={set('target')}
          placeholder="0.00"
        />
      </label>
      <label className="f">
        <span>Target date (optional)</span>
        <input type="date" value={f.due} min={todayStr()} onChange={set('due')} />
      </label>
      <button className="btn" type="submit">
        Add goal
      </button>
    </form>
  );
}

export function GoalsCard({ goals, onAdd, onContribute, onRemoveContribution, onDelete }) {
  const [adding, setAdding] = useState(null);
  const today = todayStr();
  const plans = goals.map((g) => ({ g, p: goalPlan(g, today) }));
  const weekly = sum(
    plans.filter(({ p }) => p.perWeek),
    ({ p }) => p.perWeek,
  );
  return (
    <section className="card" aria-label="Savings goals">
      <h2>Savings goals</h2>
      {weekly > 0 && (
        <div className="ok" style={{ marginTop: 0, marginBottom: 12 }}>
          To stay on track, set aside about <b>{fmt(weekly)}</b> this week.
        </div>
      )}
      <GoalForm onSave={onAdd} />
      <ul className="dlist">
        {!goals.length && <li className="empty">No goals yet. Add one and the app works out how much to save each week.</li>}
        {plans.map(({ g, p }) => (
          <li className={'dli' + (p.done ? ' done' : '')} key={g.id}>
            <div className="dtop">
              <div className="grow">
                <b>{g.name}</b>
                <span>
                  {p.done
                    ? 'Reached!'
                    : p.late
                      ? `Target date ${fmtDate(g.due)} has passed · ${fmt(p.left)} to go`
                      : p.perWeek
                        ? `${fmt(p.perWeek)} a week for ${plural(p.weeksLeft, 'week')} to reach it by ${fmtDate(g.due)}`
                        : `${fmt(p.left)} to go`}
                </span>
              </div>
              <span className="amt">{fmt(g.target)}</span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(p.pct)}
              aria-label={`Saved toward ${g.name}`}
            >
              <i style={{ width: p.pct + '%' }} />
            </div>
            <div className="wk-n">
              Saved {fmt(p.saved)} of {fmt(g.target)}
            </div>
            {g.contributions.length > 0 && (
              <ul className="pays">
                {g.contributions.slice(-5).map((c) => (
                  <li key={c.id}>
                    {fmt(c.amt)}
                    {c.date ? ` on ${fmtDate(c.date)}` : ''}
                    <button
                      className="x"
                      type="button"
                      onClick={() => onRemoveContribution(g, c)}
                      aria-label={`Remove ${fmt(c.amt)} from ${g.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {adding === g.id ? (
              <AmountDateForm
                label="Amount saved"
                submitLabel="Add to goal"
                onSave={(v) => {
                  onContribute(g.id, v);
                  setAdding(null);
                }}
                onCancel={() => setAdding(null)}
              />
            ) : (
              <div className="acts">
                {!p.done && (
                  <button className="btn ghost sm" type="button" onClick={() => setAdding(g.id)}>
                    Add money
                  </button>
                )}
                <button className="btn ghost sm" type="button" onClick={() => onDelete(g)} aria-label={`Delete goal ${g.name}`}>
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
