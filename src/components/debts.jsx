import { useState } from 'react';
import { fmt, sym, r2, sum, todayStr, fmtDate, owedRepaid, owedLeft, owedDone, isLate } from '../utils.js';
import { plural } from './ui.jsx';

function DebtForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({ lender: f.lender.trim(), purpose: f.purpose.trim(), amount: r2(parseFloat(f.amount)) });
    if (!onCancel) setF(initial);
  };
  return (
    <form className="row" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
      <label className="f">
        <span>Who did you borrow from?</span>
        <input required maxLength={60} value={f.lender} onChange={set('lender')} placeholder="e.g. Ate Joy" />
      </label>
      <label className="f">
        <span>What was it for?</span>
        <input required maxLength={80} value={f.purpose} onChange={set('purpose')} placeholder="e.g. Tuition" />
      </label>
      <label className="f">
        <span>Amount borrowed ({sym()})</span>
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={f.amount}
          onChange={set('amount')}
          placeholder="0.00"
        />
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

export function DebtsCard({ rows, onAdd, onEdit, onDelete }) {
  const [editing, setEditing] = useState(null);
  const totalLeft = sum(rows, (d) => d.left);
  const totalPaid = sum(rows, (d) => Math.min(d.paid, d.amount));
  return (
    <section className="card" aria-label="Money I owe">
      <h2>Money I owe</h2>
      <div className="mstats">
        <div className={'mstat' + (totalLeft > 0 ? ' over' : ' good')}>
          <small>Still owed</small>
          <b>{fmt(totalLeft)}</b>
        </div>
        <div className="mstat good">
          <small>Paid so far</small>
          <b>{fmt(totalPaid)}</b>
        </div>
      </div>
      <DebtForm initial={{ lender: '', purpose: '', amount: '' }} submitLabel="Add debt" onSave={onAdd} />
      <ul className="dlist">
        {!rows.length && <li className="empty">No debts listed.</li>}
        {rows.map((d) =>
          editing === d.id ? (
            <li className="dli" key={d.id}>
              <DebtForm
                initial={{ lender: d.lender, purpose: d.purpose, amount: String(d.amount) }}
                submitLabel="Save"
                onSave={(v) => {
                  onEdit(d.id, v);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li className="dli" key={d.id}>
              <div className="dtop">
                <div className="grow">
                  <b>{d.lender}</b>
                  <span>{d.purpose}</span>
                </div>
                <span className={'chip ' + (d.left === 0 ? 'good' : 'over')}>{d.left === 0 ? 'Paid off' : `${fmt(d.left)} left`}</span>
              </div>
              <div
                className="bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(100, (d.paid / d.amount) * 100))}
                aria-label={`Paid toward ${d.lender}`}
              >
                <i style={{ width: Math.min(100, (d.paid / d.amount) * 100) + '%' }} />
              </div>
              <div className="wk-n">
                Paid {fmt(d.paid)} of {fmt(d.amount)} · {plural(d.count, 'payment')}
              </div>
              <div className="acts">
                <button className="btn ghost sm" type="button" onClick={() => setEditing(d.id)} aria-label={`Edit debt to ${d.lender}`}>
                  Edit
                </button>
                <button className="btn ghost sm" type="button" onClick={() => onDelete(d)} aria-label={`Delete debt to ${d.lender}`}>
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      <p className="hint">
        To pay a debt down, add an expense on the Expenses tab and pick the debt under “This pays off a debt.” Its balance drops
        automatically, and goes back up if you delete that expense.
      </p>
    </section>
  );
}

function OwedForm({ initial, submitLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    onSave({ person: f.person.trim(), amount: r2(parseFloat(f.amount)), borrowedOn: f.borrowedOn, promisedOn: f.promisedOn });
    if (!onCancel) setF(initial);
  };
  return (
    <form className="row" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
      <label className="f">
        <span>Who owes you?</span>
        <input required maxLength={60} value={f.person} onChange={set('person')} placeholder="e.g. Mark" />
      </label>
      <label className="f">
        <span>Amount ({sym()})</span>
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={f.amount}
          onChange={set('amount')}
          placeholder="0.00"
        />
      </label>
      <label className="f">
        <span>Date borrowed</span>
        <input required type="date" value={f.borrowedOn} onChange={set('borrowedOn')} />
      </label>
      <label className="f">
        <span>Promised pay date (optional)</span>
        <input type="date" value={f.promisedOn} onChange={set('promisedOn')} />
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

function RepaymentForm({ left, onSave, onCancel }) {
  const [f, setF] = useState({ amt: String(left), date: todayStr() });
  const a = parseFloat(f.amt);
  const bad = !(a > 0) || a > left;
  const submit = (e) => {
    e.preventDefault();
    if (!bad) onSave({ amt: r2(a), date: f.date });
  };
  return (
    <form className="row" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} style={{ marginTop: 8 }}>
      <label className="f">
        <span>Amount paid back ({sym()})</span>
        <input
          type="number"
          min="0.01"
          max={left}
          step="0.01"
          inputMode="decimal"
          value={f.amt}
          onChange={(e) => setF({ ...f, amt: e.target.value })}
          autoFocus
          aria-invalid={f.amt !== '' && bad}
        />
      </label>
      <label className="f">
        <span>Date</span>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </label>
      <button className="btn" type="submit" disabled={bad}>
        Save payment
      </button>
      <button className="btn ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
      {f.amt !== '' && a > left && (
        <span className="err" style={{ flexBasis: '100%' }}>
          Only {fmt(left)} is left to pay back.
        </span>
      )}
    </form>
  );
}

export function OwedCard({ list, onAdd, onEdit, onDelete, onPay, onRemovePayment }) {
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const today = todayStr();
  const overdue = list.filter(isLate);
  const sorted = [...list].sort(
    (a, b) =>
      Number(owedDone(a)) - Number(owedDone(b)) ||
      (a.promisedOn || '9999').localeCompare(b.promisedOn || '9999') ||
      a.borrowedOn.localeCompare(b.borrowedOn),
  );
  return (
    <section className="card" aria-label="Money owed to me">
      <h2>Money owed to me</h2>
      <div className="mstats">
        <div className="mstat good">
          <small>Still owed to me</small>
          <b>{fmt(sum(list, owedLeft))}</b>
        </div>
        <div className={'mstat' + (overdue.length ? ' over' : '')}>
          <small>Past promised date</small>
          <b>{overdue.length ? fmt(sum(overdue, owedLeft)) : 'None'}</b>
        </div>
      </div>
      <OwedForm initial={{ person: '', amount: '', borrowedOn: today, promisedOn: '' }} submitLabel="Add" onSave={onAdd} />
      <ul className="dlist">
        {!sorted.length && <li className="empty">Nobody owes you right now.</li>}
        {sorted.map((x) => {
          if (editing === x.id)
            return (
              <li className="dli" key={x.id}>
                <OwedForm
                  initial={{ person: x.person, amount: String(x.amount), borrowedOn: x.borrowedOn, promisedOn: x.promisedOn || '' }}
                  submitLabel="Save"
                  onSave={(v) => {
                    onEdit(x.id, v);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            );
          const rep = owedRepaid(x),
            left = owedLeft(x),
            done = owedDone(x);
          return (
            <li className={'dli' + (done ? ' done' : '')} key={x.id}>
              <div className="dtop">
                <div className="grow">
                  <b>{x.person}</b>
                  <span>
                    Borrowed {x.borrowedOn ? fmtDate(x.borrowedOn) : '(date unknown)'} ·{' '}
                    {x.promisedOn ? `Promised to pay ${fmtDate(x.promisedOn)}` : 'No pay date given'}
                  </span>
                </div>
                <span className="amt">{fmt(x.amount)}</span>
              </div>
              {rep > 0 && (
                <>
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Math.min(100, (rep / x.amount) * 100))}
                    aria-label={`Paid back by ${x.person}`}
                  >
                    <i style={{ width: Math.min(100, (rep / x.amount) * 100) + '%' }} />
                  </div>
                  <div className="wk-n">
                    Paid back {fmt(rep)} of {fmt(x.amount)}
                    {left > 0 ? ` · ${fmt(left)} to go` : ''}
                  </div>
                  <ul className="pays">
                    {x.payments.map((p) => (
                      <li key={p.id}>
                        {fmt(p.amt)}
                        {p.date ? ` on ${fmtDate(p.date)}` : ''}
                        <button
                          className="x"
                          type="button"
                          onClick={() => onRemovePayment(x, p)}
                          aria-label={`Remove ${fmt(p.amt)} payment from ${x.person}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {done && <span className="chip good">Paid back</span>}
              {isLate(x) && <span className="chip over">Past promised date</span>}
              {paying === x.id ? (
                <RepaymentForm
                  left={left}
                  onSave={(p) => {
                    onPay(x.id, p);
                    setPaying(null);
                  }}
                  onCancel={() => setPaying(null)}
                />
              ) : (
                <div className="acts">
                  {!done && (
                    <button className="btn ghost sm" type="button" onClick={() => setPaying(x.id)}>
                      Record a payment
                    </button>
                  )}
                  {(x.paid || !done) && (
                    <button className="btn ghost sm" type="button" onClick={() => onEdit(x.id, { paid: !x.paid })}>
                      {x.paid ? 'Mark unpaid' : 'Mark fully paid'}
                    </button>
                  )}
                  <button className="btn ghost sm" type="button" onClick={() => setEditing(x.id)} aria-label={`Edit ${x.person}`}>
                    Edit
                  </button>
                  <button className="btn ghost sm" type="button" onClick={() => onDelete(x)} aria-label={`Delete ${x.person}`}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {list.length > 0 && (
        <p className="hint">
          Use “Record a payment” when someone pays back part of what they owe. The rest stays on the list until it’s all paid.
        </p>
      )}
    </section>
  );
}
