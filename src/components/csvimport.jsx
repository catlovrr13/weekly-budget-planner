import { useState, useMemo } from 'react';
import { CATS, fmt, fmtDate, readText } from '../utils.js';
import { parseCsv, guessLayout, guessDateOrder, rowsToEntries, dupKey } from '../csv.js';
import { dateOfEntry } from '../features.js';
import { plural } from './ui.jsx';

const MAX_ROWS = 300;

function ColumnSelect({ id, label, header, value, onChange }) {
  return (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(+e.target.value)}>
        <option value={-1}>(none)</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Imports a bank or e-wallet statement saved as CSV. Guesses the layout; every guess can be corrected. */
export function CsvImportCard({ weeks, wallets, prefs, onImport }) {
  const [file, setFile] = useState(null); // { name, rows }
  const [layout, setLayout] = useState(null);
  const [opts, setOpts] = useState({ order: 'mdy', sign: 'negative', wallet: '' });
  const [picks, setPicks] = useState({}); // row index -> { off: bool, cat }
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const existing = useMemo(() => {
    const keys = new Set();
    for (const [k, w] of Object.entries(weeks))
      for (const i of [...w.items, ...(w.income || [])]) keys.add(dupKey(dateOfEntry(k, i.day), i.amt, i.name));
    return keys;
  }, [weeks]);

  const parsed = useMemo(() => (file && layout ? rowsToEntries(file.rows, layout, opts) : null), [file, layout, opts]);
  const entries = useMemo(
    () => (parsed ? parsed.entries.slice(0, MAX_ROWS).map((e, i) => ({ ...e, i, dup: existing.has(dupKey(e.date, e.amt, e.name)) })) : []),
    [parsed, existing],
  );
  const isOn = (e) => (picks[e.i]?.off !== undefined ? !picks[e.i].off : !e.dup);
  const catOf = (e) => picks[e.i]?.cat || e.cat;
  const chosen = entries.filter(isOn);

  const pick = async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    setMsg('');
    setErr('');
    if (!f) return;
    if (f.size > 5e6) return setErr('That file is too large (5 MB max).');
    let rows;
    try {
      rows = parseCsv(await readText(f));
    } catch {
      return setErr('Couldn’t read that file.');
    }
    if (rows.length < 2) return setErr('That file doesn’t look like a CSV with transactions in it.');
    const guess = guessLayout(rows);
    // Reuse the columns picked last time when this file has the same headers.
    const at = (name) => (name ? guess.header.indexOf(name) : -1);
    const remembered =
      ['date', 'desc', 'amount', 'debit', 'credit'].every((k) => !prefs[k] || at(prefs[k]) >= 0) && prefs.date && at(prefs.date) >= 0;
    const lay = remembered
      ? { ...guess, date: at(prefs.date), desc: at(prefs.desc), amount: at(prefs.amount), debit: at(prefs.debit), credit: at(prefs.credit) }
      : guess;
    const dates = rows.slice(lay.headerRow + 1, lay.headerRow + 60).map((r) => r[lay.date]);
    setFile({ name: f.name, rows });
    setLayout(lay);
    setOpts({
      order: remembered && prefs.order ? prefs.order : guessDateOrder(dates),
      sign: remembered && prefs.sign ? prefs.sign : 'negative',
      wallet: wallets.some((w) => String(w.id) === prefs.wallet) ? prefs.wallet : '',
    });
    setPicks({});
  };
  const setCol = (k) => (v) => {
    setLayout({ ...layout, [k]: v });
    setPicks({});
  };
  const close = () => {
    setFile(null);
    setLayout(null);
    setPicks({});
  };

  const run = () => {
    const wal = wallets.find((w) => String(w.id) === opts.wallet);
    const name = (i) => (i >= 0 ? layout.header[i] : '');
    // The column choices are saved together with the import, so Undo takes back both.
    onImport(
      chosen.map((e) => ({
        date: e.date,
        name: e.name,
        amt: e.amt,
        kind: e.kind,
        ...(e.kind === 'expense' ? { cat: catOf(e) } : {}),
        ...(wal ? { walletId: wal.id } : {}),
      })),
      {
        date: name(layout.date),
        desc: name(layout.desc),
        amount: name(layout.amount),
        debit: name(layout.debit),
        credit: name(layout.credit),
        order: opts.order,
        sign: opts.sign,
        wallet: opts.wallet,
      },
    );
    setMsg(`Imported ${plural(chosen.length, 'transaction')}.`);
    close();
  };

  const single = layout && layout.amount >= 0;
  const noAmount = layout && layout.amount < 0 && layout.debit < 0 && layout.credit < 0;

  return (
    <section className="card" aria-label="Import a statement">
      <h2>Import a bank or e-wallet statement</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Load a CSV export of your transactions instead of typing them in. Money out becomes expenses and money in becomes income. You’ll see
        everything before it’s added, and you can undo right after.
      </p>
      <label htmlFor="csvfile">Choose a .csv file</label>
      <input id="csvfile" type="file" accept=".csv,text/csv" onChange={pick} />
      <p className="hint">
        GCash and Maya usually email statements as PDF. To use one here, save it as CSV first (for example, by opening it in Excel or Google
        Sheets and downloading as .csv). Most online banking sites can export CSV directly.
      </p>
      {err && (
        <div className="preview bad" role="alert">
          {err}
        </div>
      )}
      {msg && (
        <div className="preview" role="status">
          {msg}
        </div>
      )}
      {file && layout && (
        <>
          <h3 className="fname">{file.name}</h3>
          <p className="hint" style={{ marginTop: 4 }}>
            Check that each box points at the right column.
          </p>
          <div className="row">
            <ColumnSelect id="csv-date" label="Date" header={layout.header} value={layout.date} onChange={setCol('date')} />
            <ColumnSelect id="csv-desc" label="Description" header={layout.header} value={layout.desc} onChange={setCol('desc')} />
            <ColumnSelect
              id="csv-amount"
              label="Amount (one column)"
              header={layout.header}
              value={layout.amount}
              onChange={setCol('amount')}
            />
            <ColumnSelect id="csv-debit" label="Money out" header={layout.header} value={layout.debit} onChange={setCol('debit')} />
            <ColumnSelect id="csv-credit" label="Money in" header={layout.header} value={layout.credit} onChange={setCol('credit')} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="f">
              <label htmlFor="csv-order">Dates like 03/04/2026 mean</label>
              <select id="csv-order" value={opts.order} onChange={(e) => setOpts({ ...opts, order: e.target.value })}>
                <option value="mdy">Month/Day (March 4)</option>
                <option value="dmy">Day/Month (3 April)</option>
              </select>
            </div>
            {single && (
              <div className="f">
                <label htmlFor="csv-sign">In the amount column</label>
                <select id="csv-sign" value={opts.sign} onChange={(e) => setOpts({ ...opts, sign: e.target.value })}>
                  <option value="negative">Spending is negative (−500)</option>
                  <option value="positive">Spending is positive (500)</option>
                </select>
              </div>
            )}
            {wallets.length > 0 && (
              <div className="f">
                <label htmlFor="csv-wallet">Which wallet is this?</label>
                <select id="csv-wallet" value={opts.wallet} onChange={(e) => setOpts({ ...opts, wallet: e.target.value })}>
                  <option value="">Not tracked</option>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {layout.date < 0 || noAmount ? (
            <div className="preview bad" role="alert">
              Pick the date column and either an amount column or money out / money in columns.
            </div>
          ) : (
            <>
              <div className="preview" role="status">
                Found {plural(parsed.entries.length, 'transaction')}
                {parsed.skipped ? `, skipped ${plural(parsed.skipped, 'row')} without a date or amount` : ''}
                {entries.some((e) => e.dup) ? `. Ones that look already added are unticked.` : '.'}
                {parsed.entries.length > MAX_ROWS
                  ? ` Showing the first ${MAX_ROWS}; import those, then load the file again for the rest.`
                  : ''}
              </div>
              <div className="tbl-wrap">
                <table className="tbl csv">
                  <caption className="sr">Transactions to import</caption>
                  <thead>
                    <tr>
                      <th scope="col">Add</th>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Category</th>
                      <th scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.i} className={isOn(e) ? '' : 'off'}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isOn(e)}
                            aria-label={`Add ${e.name} on ${fmtDate(e.date)}`}
                            onChange={(ev) => setPicks({ ...picks, [e.i]: { ...picks[e.i], off: !ev.target.checked } })}
                          />
                        </td>
                        <td>{fmtDate(e.date)}</td>
                        <td>
                          {e.name}
                          {e.dup && <span className="chip none"> already added?</span>}
                        </td>
                        <td>
                          {e.kind === 'income' ? (
                            'Income'
                          ) : (
                            <select
                              value={catOf(e)}
                              aria-label={`Category for ${e.name}`}
                              onChange={(ev) => setPicks({ ...picks, [e.i]: { ...picks[e.i], cat: ev.target.value } })}
                            >
                              {CATS.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className={e.kind === 'income' ? 'pos' : ''}>
                          {e.kind === 'income' ? '+' : '−'}
                          {fmt(e.amt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={run} disabled={!chosen.length || layout.date < 0 || noAmount}>
              Import {plural(chosen.length, 'transaction')}
            </button>
            <button className="btn ghost" type="button" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  );
}
