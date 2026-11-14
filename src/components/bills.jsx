import { useState } from 'react';
import { CATS, fmt, sym, r2, todayStr, fmtDate } from '../utils.js';
import { nextDue, fromIso } from '../features.js';

function BillRow({ occ, today, onPay }) {
  const { bill, due, paidBy } = occ;
  const late = !paidBy && due < today;
  return (
    <li className="item">
      <div className="grow">
        <b>{bill.name}</b>
        <span>
          Due {fmtDate(due)}
          {late ? ' · overdue' : ''}
        </span>
      </div>
      {late && <span className="chip over">Overdue</span>}
      <span className="amt">{fmt(bill.amt)}</span>
      {paidBy ? (
        <span className="chip good">✓ Paid</span>
      ) : (
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => onPay(bill, due)}
          aria-label={`Mark ${bill.name} due ${fmtDate(due)} as paid`}
        >
          Mark paid
        </button>
      )}
    </li>
  );
}

/** Bills due this week (and any missed ones), shown on the Expenses tab. */
export function BillsDueCard({ due, overdue, onPay }) {
  if (!due.length && !overdue.length) return null;
  const today = todayStr();
  return (
    <section className="card" aria-label="Bills due">
      <h2>Bills due</h2>
      <ul>
        {overdue.map((o) => (
          <BillRow key={o.bill.id + o.due} occ={o} today={today} onPay={onPay} />
        ))}
        {due.map((o) => (
          <BillRow key={o.bill.id + o.due} occ={o} today={today} onPay={onPay} />
        ))}
      </ul>
      <p className="hint">“Mark paid” adds the bill as an expense on its due date. Delete that expense to undo it.</p>
    </section>
  );
}

/** Adding and removing bills, on the Money tab. */
export function BillsCard({ bills, wallets, onAdd, onDelete }) {
  const blank = { name: '', amt: '', cat: 'Bills', firstDue: todayStr(), repeat: true, wallet: '' };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const today = todayStr();
  const submit = (e) => {
    e.preventDefault();
    const wal = wallets.find((w) => String(w.id) === f.wallet);
    onAdd({
      name: f.name.trim(),
      amt: r2(parseFloat(f.amt)),
      cat: f.cat,
      firstDue: f.firstDue,
      repeat: f.repeat ? 'monthly' : 'once',
      ...(wal ? { walletId: wal.id } : {}),
    });
    setF(blank);
  };
  const sorted = bills.map((b) => ({ b, next: nextDue(b, today) })).sort((x, y) => (x.next || '9999').localeCompare(y.next || '9999'));
  return (
    <section className="card" aria-label="Bills">
      <h2>Bills and reminders</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Add bills with a due date. They show up on the Expenses tab in the week they’re due, with a reminder if one is missed.
      </p>
      <form className="row" onSubmit={submit}>
        <label className="f" style={{ flex: '2 1 180px' }}>
          <span>Bill</span>
          <input required maxLength={60} value={f.name} onChange={set('name')} placeholder="e.g. Meralco" />
        </label>
        <label className="f">
          <span>Amount ({sym()})</span>
          <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={f.amt} onChange={set('amt')} placeholder="0.00" />
        </label>
        <label className="f">
          <span>{f.repeat ? 'Next due date' : 'Due date'}</span>
          <input required type="date" value={f.firstDue} onChange={set('firstDue')} />
        </label>
        <label className="f">
          <span>Category</span>
          <select value={f.cat} onChange={set('cat')}>
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {wallets.length > 0 && (
          <label className="f">
            <span>Paid from</span>
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
          <input type="checkbox" checked={f.repeat} onChange={set('repeat')} /> Every month
        </label>
        <button className="btn" type="submit">
          Add bill
        </button>
      </form>
      <ul className="dlist">
        {!bills.length && <li className="empty">No bills yet.</li>}
        {sorted.map(({ b, next }) => (
          <li className="dli" key={b.id}>
            <div className="dtop">
              <div className="grow">
                <b>{b.name}</b>
                <span>
                  {b.repeat === 'monthly' ? `Every month on day ${fromIso(b.firstDue).getDate()}` : 'One time'} · {b.cat}
                  {next ? ` · next due ${fmtDate(next)}` : ' · no upcoming due date'}
                </span>
              </div>
              <span className="amt">{fmt(b.amt)}</span>
            </div>
            <div className="acts">
              <button className="btn ghost sm" type="button" onClick={() => onDelete(b)} aria-label={`Delete bill ${b.name}`}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
