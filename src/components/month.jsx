import { useState, useEffect, useMemo } from 'react';
import {
  DAYS,
  CATS,
  fmt,
  addDays,
  short,
  snap,
  sum,
  monthOfWeek,
  weekKeysOfMonth,
  fmtDate,
  todayStr,
  isoDate,
  mondayOf,
  rateWeek,
  starsFor,
  starText,
  owedLeft,
  owedDone,
} from '../utils.js';
import { EMPTY } from '../data.js';
import { plural } from './ui.jsx';

function weekStatus(s, now) {
  const past = addDays(s.mon, 7) <= now,
    started = s.mon <= now;
  if (!s.b && !s.items.length) return { cls: 'none', text: 'Nothing recorded' };
  if (!s.b) return { cls: 'none', text: `No budget set · spent ${fmt(s.spent)}` };
  if (s.rem < 0) return { cls: 'over', text: `Over by ${fmt(-s.rem)}` };
  if (past) return { cls: 'good', text: `${fmt(s.rem)} left over` };
  if (started) return { cls: 'good', text: `${fmt(s.rem)} left so far` };
  return { cls: 'none', text: `Planned: ${fmt(s.b)}` };
}

export function MonthPanel({ weeks: allWeeks, debtRows, owed, cur, carryOver, openWeek }) {
  const [m, setM] = useState(() => monthOfWeek(cur));
  useEffect(() => setM(monthOfWeek(cur)), [cur]);
  const shift = (n) =>
    setM(({ y, mo }) => {
      const d = new Date(y, mo + n, 1);
      return { y: d.getFullYear(), mo: d.getMonth() };
    });
  const now = new Date(),
    today = todayStr();
  // Month totals look at each week's own budget (no carry-over), so leftovers aren't counted twice.
  const weeks = weekKeysOfMonth(m.y, m.mo).map((key) => {
    const s = snap(allWeeks[key] || EMPTY, key);
    return { key, s, r: rateWeek(s, debtRows), debtPaid: sum(s.items.filter((i) => i.debtId != null)) };
  });
  const tracked = weeks.filter((w) => w.s.b > 0);
  const started = tracked.filter((w) => w.s.mon <= now);
  const leftPast = sum(
    tracked.filter((w) => addDays(w.s.mon, 7) <= now && w.s.rem > 0),
    (w) => w.s.rem,
  );
  const overTotal = sum(
    tracked.filter((w) => w.s.rem < 0),
    (w) => -w.s.rem,
  );
  const onTrack = started.filter((w) => w.s.rem >= 0).length;
  const rated = weeks.filter((w) => w.r);
  const avg = rated.length ? Math.round(rated.reduce((a, w) => a + w.r.score, 0) / rated.length) : null;
  const debtPaidMonth = sum(weeks, (w) => w.debtPaid);
  const incomeMonth = sum(weeks, (w) => sum(allWeeks[w.key]?.income || []));
  const spentMonth = sum(weeks, (w) => w.s.spent);
  const debtLeft = sum(debtRows, (d) => d.left);
  const owedTotal = sum(owed, owedLeft);
  const prefix = `${m.y}-${String(m.mo + 1).padStart(2, '0')}`;
  const expected = owed
    .filter((o) => !owedDone(o) && o.promisedOn && o.promisedOn.startsWith(prefix))
    .sort((a, b) => a.promisedOn.localeCompare(b.promisedOn));
  const title = new Date(m.y, m.mo, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  return (
    <section className="card" aria-label="Month overview">
      <div className="mh">
        <button className="btn ghost" type="button" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2 aria-live="polite">{title}</h2>
        <button className="btn ghost" type="button" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mstats">
        <div className="mstat good">
          <small>Left from past weeks</small>
          <b>{fmt(leftPast)}</b>
        </div>
        <div className={'mstat' + (overTotal > 0 ? ' over' : '')}>
          <small>Went over by</small>
          <b>{fmt(overTotal)}</b>
        </div>
        <div className="mstat">
          <small>Weeks within budget</small>
          <b>{started.length ? `${onTrack} of ${started.length}` : 'None tracked yet'}</b>
        </div>
        {incomeMonth > 0 && (
          <div className={'mstat' + (incomeMonth >= spentMonth ? ' good' : ' over')}>
            <small>Income · spent</small>
            <b>
              {fmt(incomeMonth)} · {fmt(spentMonth)}
            </b>
          </div>
        )}
      </div>
      <h3 className="sec">Debts and loans</h3>
      <div className="mstats">
        <div className="mstat good">
          <small>Paid toward debts</small>
          <b>{fmt(debtPaidMonth)}</b>
        </div>
        <div className={'mstat' + (debtLeft > 0 ? ' over' : ' good')}>
          <small>Debts still owed</small>
          <b>{fmt(debtLeft)}</b>
        </div>
        <div className="mstat good">
          <small>Owed to me</small>
          <b>{fmt(owedTotal)}</b>
        </div>
        <div className="mstat">
          <small>Average rating</small>
          <b>{avg === null ? 'Not rated yet' : `${starText(starsFor(avg))} ${avg}`}</b>
        </div>
      </div>
      {expected.length > 0 && (
        <>
          <h3 className="sec">Expected this month</h3>
          {expected.map((o) => (
            <div className={'exp' + (o.promisedOn < today ? ' late' : '')} key={o.id}>
              <span>
                {o.person} · {fmtDate(o.promisedOn)}
                {o.promisedOn < today ? ' (past)' : ''}
              </span>
              <b>{fmt(owedLeft(o))}</b>
            </div>
          ))}
        </>
      )}
      <h3 className="sec">Weeks</h3>
      <div className="wklist">
        {weeks.map(({ key, s, r, debtPaid }) => {
          const st = weekStatus(s, now);
          return (
            <button
              key={key}
              type="button"
              className={'wk' + (key === cur ? ' sel' : '')}
              onClick={() => openWeek(key)}
              aria-current={key === cur ? 'true' : undefined}
            >
              <div className="wk-h">
                <b>
                  {short(s.mon)} – {short(addDays(s.mon, 6))}
                </b>
                <span className={'chip ' + st.cls}>{st.text}</span>
              </div>
              <div className="strip" aria-hidden="true">
                {DAYS.map((d, i) => {
                  const day = addDays(s.mon, i);
                  const cls = 'dy' + (day.getMonth() !== m.mo ? ' out' : '') + (day.toDateString() === now.toDateString() ? ' today' : '');
                  return (
                    <span key={d} className={cls}>
                      {day.getDate()}
                      {s.items.some((x) => x.day === i) && <i />}
                    </span>
                  );
                })}
              </div>
              {s.b > 0 && (
                <div className="wk-n">
                  Budget {fmt(s.b)} · Spent {fmt(s.spent)}
                </div>
              )}
              {(r || debtPaid > 0) && (
                <div className="wk-n">
                  {r && (
                    <span className="mstars" role="img" aria-label={`${r.stars} out of 5 stars`}>
                      {starText(r.stars)}
                    </span>
                  )}
                  {r && debtPaid > 0 && ' · '}
                  {debtPaid > 0 && `Paid ${fmt(debtPaid)} to debts`}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="cap">
        Tap a week to open it on the Expenses tab. Dots mark days with expenses. Weeks are grouped by the month their Thursday falls in.
        {carryOver ? ' Totals here use each week’s own budget, without carry-over.' : ''}
      </p>
    </section>
  );
}

const MAX_SHOWN = 100;

export function SearchCard({ weeks, lenders, openWeek }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const active = !!(q.trim() || cat || from || to);
  const hits = useMemo(() => {
    if (!active) return [];
    const needle = q.trim().toLowerCase();
    const out = [];
    for (const [key, w] of Object.entries(weeks)) {
      const mon = mondayOf(key);
      for (const i of w.items) {
        const date = isoDate(addDays(mon, i.day));
        if ((from && date < from) || (to && date > to) || (cat && i.cat !== cat)) continue;
        const lender = i.debtId != null ? lenders[i.debtId] || '' : '';
        if (needle && !i.name.toLowerCase().includes(needle) && !lender.toLowerCase().includes(needle)) continue;
        out.push({ ...i, key, date, lender });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [weeks, lenders, q, cat, from, to, active]);
  const reset = () => {
    setQ('');
    setCat('');
    setFrom('');
    setTo('');
  };

  return (
    <section className="card" aria-label="Search expenses">
      <h2>Find expenses</h2>
      <div className="row">
        <div className="f" style={{ flex: '2 1 200px' }}>
          <label htmlFor="sq">Search by name or lender</label>
          <input id="sq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Grab" />
        </div>
        <div className="f">
          <label htmlFor="scat">Category</label>
          <select id="scat" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="sfrom">From</label>
          <input id="sfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="sto">To</label>
          <input id="sto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {active && (
          <button className="btn ghost" type="button" onClick={reset}>
            Clear
          </button>
        )}
      </div>
      <div className="preview" role="status">
        {active && (hits.length ? `${plural(hits.length, 'expense')} found, totalling ${fmt(sum(hits))}.` : 'No expenses match.')}
      </div>
      {hits.length > 0 && (
        <ul className="hits">
          {hits.slice(0, MAX_SHOWN).map((h) => (
            <li key={h.id}>
              <button type="button" className="hit" onClick={() => openWeek(h.key)}>
                <span className="grow">
                  <b>{h.name}</b>
                  <span>
                    {fmtDate(h.date)}
                    {h.lender ? ` · pays ${h.lender}` : ''}
                  </span>
                </span>
                <span className="tag">{h.cat}</span>
                <span className="amt">{fmt(h.amt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hits.length > MAX_SHOWN && <p className="hint">Showing the latest {MAX_SHOWN}. Narrow the search to see older ones.</p>}
    </section>
  );
}
