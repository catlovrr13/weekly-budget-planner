import { useState, useEffect } from 'react';
import { DAYS, CATS, fmt, sym, weekKey, addDays, short, group, r2, sum, mondayOf, rateWeek, starText } from '../utils.js';
import { categoryStatus } from '../features.js';
import { Bars } from './ui.jsx';

export function WeekPicker({ cur, setCur, s, rev, budget, onBudget }) {
  const go = (n) => setCur(weekKey(addDays(s.mon, n * 7)));
  return (
    <section className="card" aria-label="Week and budget">
      <div className="nav">
        <button className="btn ghost" type="button" onClick={() => go(-1)} aria-label="Previous week">
          ‹ Prev
        </button>
        <div className="f" style={{ flex: '1 1 170px' }}>
          <label htmlFor="week">Choose week</label>
          <input type="week" id="week" value={cur} onChange={(e) => e.target.value && setCur(e.target.value)} />
        </div>
        <button className="btn ghost" type="button" onClick={() => go(1)} aria-label="Next week">
          Next ›
        </button>
        <button className="btn ghost" type="button" onClick={() => setCur(weekKey(new Date()))}>
          This week
        </button>
      </div>
      <p className="range">{s.label}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="f">
          <label htmlFor="budget">Budget for this week ({sym()})</label>
          {/* key resets the field when the week changes; uncontrolled so decimals type naturally */}
          <input
            key={`${cur}:${rev}`}
            id="budget"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="e.g. 3,500"
            defaultValue={budget || ''}
            onChange={(e) => onBudget(Math.max(0, r2(parseFloat(e.target.value) || 0)))}
          />
        </div>
      </div>
      {s.carry !== 0 && (
        <p className="hint">
          {s.carry > 0 ? `+ ${fmt(s.carry)} left over from last week` : `− ${fmt(-s.carry)} overspent last week`}, so you have {fmt(s.b)} to
          spend this week.
        </p>
      )}
    </section>
  );
}

export function Summary({ s, cur, income = 0, hand = null, overCats = [] }) {
  const over = s.rem < 0;
  const pct = s.b > 0 ? Math.min(100, (s.spent / s.b) * 100) : s.spent > 0 ? 100 : 0;
  const now = new Date();
  const left = weekKey(now) === cur ? 7 - ((now.getDay() + 6) % 7) : s.mon > now ? 7 : 0;
  return (
    <section className="card" aria-label="Summary">
      <div className="stats">
        <div className="stat">
          <small>Budget{s.carry ? ' (with carry-over)' : ''}</small>
          <b>{fmt(s.b)}</b>
        </div>
        <div className="stat">
          <small>Spent</small>
          <b>{fmt(s.spent)}</b>
        </div>
        <div className={'stat rem' + (over ? ' neg' : '')}>
          <small>{over ? 'Over budget by' : 'Remaining'}</small>
          <b>{fmt(Math.abs(s.rem))}</b>
        </div>
      </div>
      <div
        className={'bar' + (over ? ' over' : '')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Budget used"
      >
        <i style={{ width: pct + '%' }} />
      </div>
      <div className="sub" style={{ margin: 0 }}>
        {s.b > 0 ? Math.round((s.spent / s.b) * 100) + '% of your budget used' : 'Enter a budget to start tracking.'}
      </div>
      {over && (
        <div className="alert" role="alert">
          You’re over budget by {fmt(-s.rem)}.
        </div>
      )}
      {!over && s.b > 0 && left > 0 && (
        <div className="ok">
          You can spend about {fmt(s.rem / left)} a day for the {left} day{left > 1 ? 's' : ''} left.
        </div>
      )}
      {overCats.length > 0 && (
        <div className="alert soft" role="status">
          Over the limit: {overCats.map((c) => `${c.cat} (${fmt(c.spent)} of ${fmt(c.limit)})`).join(', ')}.
        </div>
      )}
      {(income > 0 || hand !== null) && (
        <div className="ok">
          {income > 0 ? `Income this week: ${fmt(income)}. ` : ''}
          {hand !== null ? `Money on hand: ${fmt(hand)}.` : ''}
        </div>
      )}
      {hand !== null && !over && s.b > 0 && s.rem > hand && (
        <div className="alert soft" role="status">
          Your budget still has {fmt(s.rem)} left, but you only have {fmt(hand)} on hand.
        </div>
      )}
    </section>
  );
}

export function RatingCard({ s, debts }) {
  const r = rateWeek(s, debts);
  const now = new Date();
  const live = s.mon <= now && addDays(s.mon, 7) > now;
  if (!r)
    return (
      <section className="card rating" aria-label="Weekly rating">
        <div className="face" aria-hidden="true">
          🌸
        </div>
        <div className="rbody">
          <b className="rl">Your weekly rating</b>
          <p className="sub" style={{ margin: 0 }}>
            Set a budget and add a few expenses to see how you’re doing this week.
          </p>
        </div>
      </section>
    );
  return (
    <section className="card rating" aria-label="Weekly rating">
      <div className="face" aria-hidden="true">
        {r.face}
      </div>
      <div className="rbody">
        <div className="stars" role="img" aria-label={`${r.stars} out of 5 stars`}>
          {starText(r.stars)}
        </div>
        <b className="rl">{r.label}</b>
        <span className="score">
          {r.score}/100{live ? ' so far' : ''}
        </span>
        <ul className="why">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Add or edit one expense. `idp` prefixes the field ids so the edit form and the add form never clash.
 * onSave(values, repeatWeekly)
 */
export function ExpenseForm({ cur, s, debts = [], wallets = [], limits = {}, onSave, onCancel, initial, idp = '' }) {
  const editing = !!initial;
  const todayIdx = weekKey(new Date()) === cur ? (new Date().getDay() + 6) % 7 : 0;
  const [f, setF] = useState(() =>
    initial
      ? {
          name: initial.name,
          amt: String(initial.amt),
          cat: initial.cat,
          day: initial.day,
          debt: initial.debtId != null ? String(initial.debtId) : '',
          wallet: initial.walletId != null ? String(initial.walletId) : '',
          repeat: false,
        }
      : { name: '', amt: '', cat: CATS[0], day: todayIdx, debt: '', wallet: wallets[0] ? String(wallets[0].id) : '', repeat: false },
  );
  const [err, setErr] = useState({});
  useEffect(() => {
    if (!editing) setF((x) => ({ ...x, day: todayIdx }));
  }, [cur, todayIdx, editing]);

  const id = (k) => idp + k;
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((x) => ({ ...x, [k]: v }));
    setErr({});
  };
  const a = parseFloat(f.amt);
  const after = r2(s.rem + (initial?.amt || 0) - (a > 0 ? a : 0));
  const dbt = debts.find((d) => String(d.id) === f.debt);
  const room = dbt ? r2(dbt.left + (initial && String(initial.debtId) === f.debt ? initial.amt : 0)) : 0;
  const tooMuch = !!dbt && a > room;
  const catNow = dbt ? 'Debt' : f.cat;
  const limit = limits[catNow];
  const catAfter = r2(sum(s.items.filter((i) => i.cat === catNow && i.id !== initial?.id)) + (a > 0 ? a : 0));
  const wal = wallets.find((w) => String(w.id) === f.wallet);
  const walRoom = wal ? r2(wal.balance + (initial && String(initial.walletId) === f.wallet ? initial.amt : 0)) : 0;
  const warnings =
    (limit && a > 0 && catAfter > limit ? ` This puts ${catNow} over its ${fmt(limit)} limit.` : '') +
    (wal && wal.kind !== 'card' && a > walRoom ? ` That’s more than the ${fmt(walRoom)} in ${wal.name}.` : '');
  const pickDebt = (e) => {
    const v = e.target.value,
      d = debts.find((x) => String(x.id) === v);
    setF((x) => ({
      ...x,
      debt: v,
      cat: d ? 'Debt' : x.cat,
      repeat: d ? false : x.repeat,
      name: d && !x.name.trim() ? `Payment to ${d.lender}` : x.name,
    }));
  };
  const focus = (k) => document.getElementById(id(k))?.focus();

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) {
      setErr({ name: 'Add a name for this expense.' });
      return focus('name');
    }
    if (!(a > 0)) {
      setErr({ amt: 'Enter an amount above zero.' });
      return focus('amt');
    }
    if (tooMuch) {
      setErr({ amt: `That’s more than the ${fmt(room)} left on this debt.` });
      return focus('amt');
    }
    onSave(
      {
        name: f.name.trim(),
        amt: r2(a),
        cat: dbt ? 'Debt' : f.cat,
        day: +f.day,
        ...(dbt ? { debtId: dbt.id } : {}),
        ...(wal ? { walletId: wal.id } : {}),
      },
      !dbt && f.repeat,
    );
    if (!editing) {
      setF((x) => ({ ...x, name: '', amt: '', debt: '', repeat: false }));
      focus('name');
    }
  };

  const preview =
    a > 0 &&
    (tooMuch
      ? `That’s more than the ${fmt(room)} left on this debt.`
      : (after < 0
          ? `${editing ? 'With this change' : 'Adding this'} would put you over budget by ${fmt(-after)}.`
          : `After this, you’ll have ${fmt(after)} left.`) +
        (dbt ? ` ${dbt.lender}’s debt will drop to ${fmt(r2(room - a))}.` : '') +
        warnings);

  return (
    <>
      <form className="row" onSubmit={submit} noValidate onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
        <div className="f" style={{ flex: '2 1 180px' }}>
          <label htmlFor={id('name')}>What did you buy?</label>
          <input
            id={id('name')}
            value={f.name}
            onChange={set('name')}
            placeholder="e.g. Groceries"
            maxLength={60}
            aria-invalid={!!err.name}
            aria-describedby={err.name ? id('name-err') : undefined}
          />
          {err.name && (
            <span className="err" id={id('name-err')}>
              {err.name}
            </span>
          )}
        </div>
        <div className="f">
          <label htmlFor={id('amt')}>Amount ({sym()})</label>
          <input
            id={id('amt')}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={f.amt}
            onChange={set('amt')}
            aria-invalid={!!err.amt}
            aria-describedby={err.amt ? id('amt-err') : undefined}
          />
          {err.amt && (
            <span className="err" id={id('amt-err')}>
              {err.amt}
            </span>
          )}
        </div>
        <div className="f">
          <label htmlFor={id('cat')}>Category</label>
          <select id={id('cat')} value={dbt ? 'Debt' : f.cat} onChange={set('cat')} disabled={!!dbt}>
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={id('day')}>Day</label>
          <select id={id('day')} value={f.day} onChange={set('day')}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}, {short(addDays(s.mon, i))}
              </option>
            ))}
          </select>
        </div>
        {debts.length > 0 && (
          <div className="f" style={{ flex: '2 1 220px' }}>
            <label htmlFor={id('debt')}>This pays off a debt (optional)</label>
            <select id={id('debt')} value={f.debt} onChange={pickDebt}>
              <option value="">No, regular expense</option>
              {debts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.lender}
                  {d.purpose ? ` (${d.purpose})` : ''}: {fmt(d.left)} left
                </option>
              ))}
            </select>
          </div>
        )}
        {wallets.length > 0 && (
          <div className="f">
            <label htmlFor={id('wallet')}>Paid from</label>
            <select id={id('wallet')} value={f.wallet} onChange={set('wallet')}>
              <option value="">Not tracked</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({fmt(w.balance)})
                </option>
              ))}
            </select>
          </div>
        )}
        {!editing && !dbt && (
          <label className="chk" htmlFor={id('repeat')}>
            <input type="checkbox" id={id('repeat')} checked={f.repeat} onChange={set('repeat')} /> Repeat every week
          </label>
        )}
        <button className="btn" type="submit" id={id('add')}>
          {editing ? 'Save' : 'Add expense'}
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
      <div className={'preview' + (a > 0 && (after < 0 || tooMuch) ? ' bad' : '')} aria-live="polite">
        {preview}
      </div>
    </>
  );
}

export function AddExpenseCard(props) {
  return (
    <section className="card" aria-label="Add expense">
      <h2>Add an expense</h2>
      <ExpenseForm {...props} />
    </section>
  );
}

export function ExpenseList({ s, cur, debts, lenders, wallets = [], limits = {}, onEdit, onDelete, onClear }) {
  const walletNames = Object.fromEntries(wallets.map((w) => [w.id, w.name]));
  const [editing, setEditing] = useState(null);
  const done = (id) => {
    setEditing(null);
    setTimeout(() => document.getElementById('edit-btn-' + id)?.focus(), 0);
  };
  return (
    <section className="card" aria-label="Expenses">
      <div className="lhead">
        <h2>This week’s expenses</h2>
        {s.items.length > 0 && (
          <button className="btn ghost sm" type="button" onClick={onClear}>
            Clear week
          </button>
        )}
      </div>
      <ul>
        {!s.items.length && <li className="empty">No expenses yet for this week.</li>}
        {s.items.map((i) =>
          editing === i.id ? (
            <li className="item editing" key={i.id}>
              <div className="grow">
                <ExpenseForm
                  cur={cur}
                  s={s}
                  idp="edit-"
                  initial={i}
                  debts={debts.filter((d) => d.left > 0 || d.id === i.debtId)}
                  wallets={wallets}
                  limits={limits}
                  onSave={(v) => {
                    onEdit(i.id, v);
                    done(i.id);
                  }}
                  onCancel={() => done(i.id)}
                />
              </div>
            </li>
          ) : (
            <li className="item" key={i.id}>
              <div className="grow">
                <b>{i.name}</b>
                <span>
                  {DAYS[i.day]}, {short(addDays(s.mon, i.day))}
                  {i.debtId != null && lenders[i.debtId] ? ` · pays ${lenders[i.debtId]}` : ''}
                  {i.recurringId != null ? ' · repeats weekly' : ''}
                  {i.walletId != null && walletNames[i.walletId] ? ` · ${walletNames[i.walletId]}` : ''}
                  {i.billId != null ? ' · bill' : ''}
                </span>
              </div>
              <span className="tag">{i.cat}</span>
              <span className="amt">{fmt(i.amt)}</span>
              <button
                className="btn ghost sm"
                type="button"
                id={'edit-btn-' + i.id}
                onClick={() => setEditing(i.id)}
                aria-label={`Edit ${i.name}`}
              >
                Edit
              </button>
              <button className="x" type="button" onClick={() => onDelete(i)} aria-label={`Delete ${i.name}`}>
                ✕
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

export function RecurringCard({ rules, cur, onStop, onRemove }) {
  if (!rules.length) return null;
  return (
    <section className="card" aria-label="Recurring expenses and income">
      <h2>Recurring expenses and income</h2>
      <p className="sub" style={{ marginBottom: 8 }}>
        These are added to every week from the week you set them up. Deleting one week’s copy doesn’t stop the others.
      </p>
      <ul className="dlist" style={{ marginTop: 0 }}>
        {rules.map((r) => (
          <li className="dli" key={r.id}>
            <div className="dtop">
              <div className="grow">
                <b>{r.name}</b>
                <span>
                  {r.kind === 'income' ? 'Income' : r.cat} · every {DAYS[r.day]} · since week of {short(mondayOf(r.start))}
                  {r.end ? ` · stopped after week of ${short(mondayOf(r.end))}` : ''}
                </span>
              </div>
              <span className="amt">{fmt(r.amt)}</span>
            </div>
            <div className="acts">
              {!r.end || r.end > cur ? (
                <button className="btn ghost sm" type="button" onClick={() => onStop(r)}>
                  Stop after this week
                </button>
              ) : (
                <button className="btn ghost sm" type="button" onClick={() => onRemove(r)}>
                  Remove from list
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CategoryLimitsCard({ items, limits, onSave }) {
  const [draft, setDraft] = useState(null);
  const rows = categoryStatus(items, limits);
  const start = () => setDraft(Object.fromEntries(CATS.map((c) => [c, limits[c] ? String(limits[c]) : ''])));
  const save = (e) => {
    e.preventDefault();
    onSave(Object.fromEntries(CATS.map((c) => [c, r2(parseFloat(draft[c]))]).filter(([, v]) => v > 0)));
    setDraft(null);
  };
  return (
    <section className="card" aria-label="Category limits">
      <div className="lhead">
        <h2>Category limits</h2>
        {!draft && (
          <button className="btn ghost sm" type="button" onClick={start}>
            {rows.length ? 'Edit limits' : 'Set limits'}
          </button>
        )}
      </div>
      {draft ? (
        <form onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}>
          <p className="sub" style={{ marginBottom: 10 }}>
            Weekly limit for each category. Leave a box empty for no limit.
          </p>
          <div className="limits">
            {CATS.map((c) => (
              <label className="f" key={c}>
                <span>
                  {c} ({sym()} per week)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={draft[c]}
                  onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
                  placeholder="No limit"
                />
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="submit">
              Save limits
            </button>
            <button className="btn ghost" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : rows.length ? (
        <ul>
          {rows.map((r) => (
            <li className="lim" key={r.cat}>
              <div className="dtop">
                <b>{r.cat}</b>
                <span className={'chip ' + (r.over ? 'over' : 'good')}>{r.over ? `Over by ${fmt(-r.left)}` : `${fmt(r.left)} left`}</span>
              </div>
              <div
                className={'bar' + (r.over ? ' over' : '')}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(100, r.pct))}
                aria-label={`${r.cat} limit used`}
              >
                <i style={{ width: Math.min(100, r.pct) + '%' }} />
              </div>
              <div className="wk-n">
                {fmt(r.spent)} of {fmt(r.limit)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ marginTop: 0 }}>
          Set a weekly limit for a category, like Food {fmt(1500)}, to get a warning before you overspend in it.
        </p>
      )}
    </section>
  );
}

export function Breakdown({ s }) {
  const perDay = DAYS.map((d, i) => [d, r2(s.items.filter((x) => x.day === i).reduce((a, c) => a + c.amt, 0))]);
  return (
    <section className="card" aria-label="Breakdown">
      <h2>Where it went</h2>
      <Bars rows={group(s.items, 'cat')} max={s.spent} />
      <h2 style={{ marginTop: 18 }}>Day by day</h2>
      <Bars rows={perDay} max={Math.max(...perDay.map((r) => r[1]), 1)} />
    </section>
  );
}
