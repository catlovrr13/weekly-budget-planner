import { useState, useMemo } from 'react';
import { CATS, fmt, fmtShort, short, sum, starText, fmtDate, mondayOf, isoDate, addDays } from '../utils.js';
import { weeklyTrend, yearReview, yearsWithData, dateOfEntry } from '../features.js';
import { Bars } from './ui.jsx';

// Each category keeps the same colour everywhere (validated palette order; see styles.css --series-N).
const SLOT = { Food: 1, Transport: 2, Bills: 3, Shopping: 4, Health: 5, Fun: 6, Debt: 7, Other: 8 };
const color = (c) => `var(--series-${SLOT[c]})`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

/**
 * Bar chart in plain HTML: one column per bar, each column a stack of segments.
 * Every column is focusable and shows its tooltip on hover or focus.
 * cols: [{ key, label, title, segs: [{ name, value, color }], total }]
 */
function BarChart({ cols, label, directLabel }) {
  const max = niceMax(Math.max(...cols.map((c) => c.total), 0));
  const ticks = [max / 2, max];
  return (
    <div className="chart" role="group" aria-label={label}>
      <div className="plot">
        {ticks.map((t) => (
          <div className="gl" key={t} style={{ bottom: (t / max) * 100 + '%' }} aria-hidden="true">
            <span>{fmtShort(t)}</span>
          </div>
        ))}
        <div className="cols">
          {cols.map((c, i) => (
            <div
              className={'col' + (i < cols.length / 3 ? ' tl' : i >= (cols.length * 2) / 3 ? ' tr' : '')}
              key={c.key}
              tabIndex={0}
              aria-label={`${c.title}: ${fmt(c.total)}${c.segs.length > 1 ? '. ' + c.segs.map((s) => `${s.name} ${fmt(s.value)}`).join(', ') : ''}`}
            >
              {directLabel === i && c.total > 0 && (
                <span className="dl" style={{ bottom: `calc(${(c.total / max) * 100}% + 4px)` }} aria-hidden="true">
                  {fmtShort(c.total)}
                </span>
              )}
              <div className="stack" style={{ height: (c.total / max) * 100 + '%' }} aria-hidden="true">
                {c.segs.map((s) => (
                  <i key={s.name} style={{ flexGrow: s.value, background: s.color }} />
                ))}
              </div>
              <div className="tip" role="tooltip" aria-hidden="true">
                <b>{c.title}</b>
                <div className="tip-total">{fmt(c.total)}</div>
                {c.segs.length > 1 &&
                  [...c.segs].reverse().map((s) => (
                    <div className="tip-row" key={s.name}>
                      <span className="key" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <span>{fmt(s.value)}</span>
                    </div>
                  ))}
                {c.note && <div className="tip-note">{c.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="xl" aria-hidden="true">
        {cols.map((c, i) => (
          <span key={c.key} className={cols.length > 8 && i % 2 ? 'odd' : ''}>
            {c.short ? (
              <>
                <span className="lg">{c.label}</span>
                <span className="sm">{c.short}</span>
              </>
            ) : (
              c.label
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function Legend({ cats }) {
  return (
    <ul className="legend" aria-label="Categories">
      {cats.map((c) => (
        <li key={c}>
          <span className="key" style={{ background: color(c) }} />
          {c}
        </li>
      ))}
    </ul>
  );
}

export function TrendsCard({ weeks, endKey, openWeek }) {
  const [n, setN] = useState(12);
  const [table, setTable] = useState(false);
  const data = useMemo(() => weeklyTrend(weeks, endKey, n), [weeks, endKey, n]);
  const used = CATS.filter((c) => data.some((w) => w.byCat[c] > 0));
  const active = data.filter((w) => w.total > 0);
  const avg = active.length ? sum(active, (w) => w.total) / active.length : 0;
  const top = active.reduce((a, w) => (!a || w.total > a.total ? w : a), null);
  const cols = data.map((w) => ({
    key: w.key,
    label: short(w.mon),
    short: `${w.mon.getMonth() + 1}/${w.mon.getDate()}`,
    title: `Week of ${short(w.mon)}`,
    total: w.total,
    segs: CATS.filter((c) => w.byCat[c] > 0).map((c) => ({ name: c, value: w.byCat[c], color: color(c) })),
  }));
  return (
    <section className="card" aria-label="Spending trends">
      <div className="lhead">
        <h2>Spending by week</h2>
        <div className="seg" role="group" aria-label="How many weeks">
          {[8, 12].map((v) => (
            <button
              key={v}
              type="button"
              className={'btn ghost sm' + (n === v ? ' on' : '')}
              aria-pressed={n === v}
              onClick={() => setN(v)}
            >
              {v} weeks
            </button>
          ))}
        </div>
      </div>
      {!active.length ? (
        <p className="empty">No spending in these weeks yet.</p>
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 10 }}>
            Average {fmt(avg)} a week · highest {fmt(top.total)} in the week of {short(top.mon)}
          </p>
          <Legend cats={used} />
          {table ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr">Spending per category for each week</caption>
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    {used.map((c) => (
                      <th scope="col" key={c}>
                        {c}
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((w) => (
                    <tr key={w.key}>
                      <th scope="row">
                        <button type="button" className="linkish" onClick={() => openWeek(w.key)}>
                          {short(w.mon)}
                        </button>
                      </th>
                      {used.map((c) => (
                        <td key={c}>{w.byCat[c] ? fmt(w.byCat[c]) : '–'}</td>
                      ))}
                      <td>
                        <b>{fmt(w.total)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <BarChart cols={cols} label={`Spending by category, last ${n} weeks`} directLabel={cols.length - 1} />
          )}
          <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setTable(!table)}>
            {table ? 'Show as chart' : 'Show as table'}
          </button>
        </>
      )}
    </section>
  );
}

export function YearReviewCard({ db, debtRows, openWeek }) {
  const years = yearsWithData(db);
  const [year, setYear] = useState(years[0]);
  const [table, setTable] = useState(false);
  const r = useMemo(() => yearReview(db, year, debtRows), [db, year, debtRows]);
  const i = years.indexOf(year);
  const cols = r.months.map((m, k) => ({
    key: MONTHS[k],
    label: MONTHS[k][0],
    title: `${MONTHS[k]} ${year}`,
    total: m.spent,
    segs: m.spent > 0 ? [{ name: 'Spent', value: m.spent, color: 'var(--series-1)' }] : [],
    note: m.income > 0 ? `Income ${fmt(m.income)}` : '',
  }));
  const empty = !r.spent && !r.income;
  return (
    <section className="card" aria-label="Year in review">
      <div className="mh">
        <button
          className="btn ghost"
          type="button"
          onClick={() => setYear(years[i + 1])}
          disabled={i >= years.length - 1}
          aria-label="Previous year"
        >
          ‹
        </button>
        <h2 aria-live="polite">{year} in review</h2>
        <button className="btn ghost" type="button" onClick={() => setYear(years[i - 1])} disabled={i <= 0} aria-label="Next year">
          ›
        </button>
      </div>
      {empty ? (
        <p className="empty">Nothing recorded in {year}.</p>
      ) : (
        <>
          <div className="mstats">
            <div className="mstat">
              <small>Spent</small>
              <b>{fmt(r.spent)}</b>
            </div>
            {r.income > 0 && (
              <div className="mstat good">
                <small>Income</small>
                <b>{fmt(r.income)}</b>
              </div>
            )}
            {r.income > 0 && (
              <div className={'mstat' + (r.income >= r.spent ? ' good' : ' over')}>
                <small>{r.income >= r.spent ? 'Earned more than spent' : 'Spent more than earned'}</small>
                <b>{fmt(Math.abs(r.income - r.spent))}</b>
              </div>
            )}
            <div className="mstat">
              <small>Average week</small>
              <b>{fmt(r.avgWeek)}</b>
            </div>
            <div className="mstat">
              <small>Weeks within budget</small>
              <b>{r.budgeted ? `${r.within} of ${r.budgeted}` : 'No budgets set'}</b>
            </div>
            {r.debtPaid > 0 && (
              <div className="mstat good">
                <small>Paid toward debts</small>
                <b>{fmt(r.debtPaid)}</b>
              </div>
            )}
            {r.saved > 0 && (
              <div className="mstat good">
                <small>Saved toward goals</small>
                <b>{fmt(r.saved)}</b>
              </div>
            )}
          </div>
          <h3 className="sec">Spent each month</h3>
          {table ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr">Spending and income per month in {year}</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Spent</th>
                    <th scope="col">Income</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m, k) => (
                    <tr key={k}>
                      <th scope="row">{MONTHS[k]}</th>
                      <td>{fmt(m.spent)}</td>
                      <td>{m.income ? fmt(m.income) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <BarChart cols={cols} label={`Spending per month in ${year}`} />
          )}
          <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setTable(!table)}>
            {table ? 'Show as chart' : 'Show as table'}
          </button>
          <h3 className="sec">Top categories</h3>
          <Bars rows={r.byCat.slice(0, 5)} max={r.byCat[0]?.[1] || 0} />
          {(r.biggest || r.best) && <h3 className="sec">Highlights</h3>}
          {r.biggest && (
            <div className="exp">
              <span>
                Biggest expense: {r.biggest.name}, {fmtDate(dateOfEntry(r.biggest.key, r.biggest.day))}
              </span>
              <b>{fmt(r.biggest.amt)}</b>
            </div>
          )}
          {r.best && (
            <button type="button" className="exp hl" onClick={() => openWeek(r.best.key)}>
              <span>
                Best week: {short(mondayOf(r.best.key))} – {fmtDate(isoDate(addDays(mondayOf(r.best.key), 6)))}
              </span>
              <b>
                <span role="img" aria-label={`${r.best.stars} out of 5 stars`}>
                  {starText(r.best.stars)}
                </span>{' '}
                {r.best.score}
              </b>
            </button>
          )}
        </>
      )}
    </section>
  );
}
