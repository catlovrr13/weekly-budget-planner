import { useState, useMemo } from 'react';
import {
  SCOPES,
  CURRENCIES,
  hasExpenses,
  hasDebts,
  downloadTxt,
  downloadXlsx,
  downloadBlob,
  parseReport,
  txtReport,
  mailtoLink,
  todayStr,
  fmtDate,
  contrast,
  onAccent,
} from '../utils.js';
import { backupJson, parseBackup } from '../data.js';
import { plural } from './ui.jsx';

function ScopeField({ id, value, onChange }) {
  return (
    <div className="f" style={{ flex: '1 1 220px' }}>
      <label htmlFor={id}>What to include</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {SCOPES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BackupCard({ db, onBackedUp }) {
  const days = db.lastBackup ? Math.floor((new Date(todayStr()) - new Date(db.lastBackup)) / 864e5) : null;
  const hasData = Object.keys(db.weeks).length > 0 || db.debts.length > 0 || db.owed.length > 0;
  const stale = hasData && (days === null || days >= 14);
  const download = () => {
    downloadBlob(backupJson(db), `budget-backup-${todayStr()}.json`, 'application/json');
    onBackedUp(todayStr());
  };
  return (
    <section className="card" aria-label="Full backup">
      <h2>Full backup</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Your data lives only in this browser. A full backup saves every week, debt, recurring expense and setting in one file, so you can
        restore it here or move it to another device.
      </p>
      {stale && (
        <div className="alert soft">
          {days === null ? 'You haven’t made a full backup yet.' : `Your last full backup was ${days} days ago.`}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="button" onClick={download}>
          Download full backup (.json)
        </button>
      </div>
      {db.lastBackup && (
        <p className="hint">Last backup: {fmtDate(db.lastBackup)}. To restore, choose the .json file under “Import a file” below.</p>
      )}
    </section>
  );
}

export function ExportCard({ s, cur, extra, scope, setScope }) {
  const [msg, setMsg] = useState('');
  const excel = async () => {
    setMsg('');
    try {
      await downloadXlsx(s, cur, extra, scope);
    } catch {
      setMsg('Couldn’t create the Excel file. Check your connection and try again, or use Download .txt.');
    }
  };
  const what = hasExpenses(scope)
    ? hasDebts(scope)
      ? 'this week’s budget and expenses, plus both debt lists'
      : 'this week’s budget, summary and every expense'
    : 'what you owe and what people owe you';
  return (
    <section className="card" aria-label="Export">
      <h2>Export this week</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Saves {what}.
      </p>
      <div className="row">
        <ScopeField id="exscope" value={scope} onChange={setScope} />
        <button className="btn" type="button" onClick={() => downloadTxt(s, cur, extra, scope)}>
          Download .txt
        </button>
        <button className="btn" type="button" onClick={excel}>
          Download Excel (.xlsx)
        </button>
      </div>
      {msg && (
        <div className="preview bad" role="alert">
          {msg}
        </div>
      )}
      <p className="hint">The .txt can be loaded back in below. The .xlsx is for reading in Excel.</p>
    </section>
  );
}

export function EmailCard({ email, setEmail, s, cur, extra, scope }) {
  const [msg, setMsg] = useState('');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = () => {
    if (!valid) {
      setMsg('Enter a valid email address first.');
      document.getElementById('email')?.focus();
      return;
    }
    const { href, trimmed } = mailtoLink(email.trim(), s, cur, extra, scope);
    setMsg(
      trimmed
        ? 'Your email app should open. The message was shortened to fit, so use Download .txt for the full report.'
        : 'Your email app should open with the summary ready to send.',
    );
    window.location.href = href;
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txtReport(s, cur, extra, scope));
      setMsg('Summary copied. Paste it anywhere.');
    } catch {
      setMsg('Couldn’t copy here. Try Download .txt instead.');
    }
  };

  return (
    <section className="card" aria-label="Email summary">
      <h2>Email or copy</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Sends the same thing you picked above. Opens your email app with it filled in.
      </p>
      <div className="row">
        <div className="f" style={{ flex: '2 1 220px' }}>
          <label htmlFor="email">Your email address</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            aria-invalid={msg.startsWith('Enter')}
            onChange={(e) => {
              setEmail(e.target.value);
              setMsg('');
            }}
          />
        </div>
        <button className="btn" type="button" onClick={send}>
          Email summary
        </button>
        <button className="btn ghost" type="button" onClick={copy}>
          Copy summary
        </button>
      </div>
      <div className={'preview' + (msg.startsWith('Enter') ? ' bad' : '')} role="status">
        {msg}
      </div>
    </section>
  );
}

export function ImportCard({ onLoad, onRestore }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const isJson = !!file && (/\.json$/i.test(file.name) || file.text.trimStart().startsWith('{'));
  const backup = useMemo(() => (file && isJson ? parseBackup(file.text) : null), [file, isJson]);
  const p = useMemo(() => (file && !isJson ? parseReport(file.text) : null), [file, isJson]);

  const pick = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMsg('');
    if (!/\.(txt|json)$/i.test(f.name) && !['text/plain', 'application/json'].includes(f.type)) {
      setFile(null);
      return setErr('Please choose a .txt report or a .json backup.');
    }
    if (f.size > 5e6) {
      setFile(null);
      return setErr('That file is too large (5 MB max).');
    }
    try {
      setFile({ name: f.name, text: await f.text() });
      setErr('');
    } catch {
      setFile(null);
      setErr('Couldn’t read that file. Please try again.');
    }
  };

  const inside =
    p &&
    [
      p.has.expenses ? plural(p.items.length, 'expense') + ` in week ${p.key}` : null,
      p.has.debts ? plural(p.debts.length, 'debt') + ' you owe' : null,
      p.has.debts ? plural(p.owed.length, 'person', 'people') + ' who owe you' : null,
    ]
      .filter(Boolean)
      .join(', ');

  const run = (scope) => {
    onLoad(p, scope);
    const done = [
      hasExpenses(scope) ? `${plural(p.items.length, 'expense')} into week ${p.key}` : null,
      hasDebts(scope) ? 'your debt lists' : null,
    ]
      .filter(Boolean)
      .join(' and ');
    setMsg(`Loaded ${done}.`);
  };
  const restore = () => {
    onRestore(backup);
    setMsg('Backup restored.');
  };

  return (
    <section className="card" aria-label="Import">
      <h2>Import a file</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        Choose a full backup (.json) to restore everything, or a .txt report to read it and load back all or part of it. You can undo right
        after loading.
      </p>
      <label htmlFor="txtfile">Choose a .json or .txt file</label>
      <input id="txtfile" type="file" accept=".txt,.json,text/plain,application/json" onChange={pick} />
      {err && (
        <div className="preview bad" role="alert">
          {err}
        </div>
      )}
      {file && (
        <>
          <h3 className="fname">{file.name}</h3>
          {isJson ? (
            <div className={backup ? 'ok' : 'preview bad'} style={{ marginTop: 4 }}>
              {backup
                ? `Full backup with ${plural(Object.keys(backup.weeks).length, 'week')}, ${plural(backup.debts.length, 'debt')}, ${plural(backup.owed.length, 'person', 'people')} who owe you and ${plural(backup.recurring.length, 'recurring expense')}. Restoring replaces everything in the app.`
                : 'This isn’t a backup from this app, so it can’t be restored.'}
            </div>
          ) : (
            <>
              <div className="ok" style={{ marginTop: 4 }}>
                {p
                  ? `This is a Weekly Budget report: ${inside || 'nothing that can be loaded'}.`
                  : 'This isn’t a Weekly Budget report, so you can read it here but not load it.'}
              </div>
              <pre className="txtview" tabIndex={0} aria-label="File contents">
                {file.text || '(This file is empty.)'}
              </pre>
            </>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            {backup && (
              <button className="btn" type="button" onClick={restore}>
                Restore this backup
              </button>
            )}
            {p?.has.expenses && p?.has.debts && (
              <button className="btn" type="button" onClick={() => run('all')}>
                Load everything
              </button>
            )}
            {p?.has.expenses && (
              <button className="btn ghost" type="button" onClick={() => run('expenses')}>
                Load expenses only
              </button>
            )}
            {p?.has.debts && (
              <button className="btn ghost" type="button" onClick={() => run('debts')}>
                Load debts only
              </button>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setFile(null);
                setMsg('');
              }}
            >
              Close
            </button>
          </div>
          {msg && (
            <div className="preview" role="status">
              {msg}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const SWATCHES = [
  ['Blush', '#f4a6bd'],
  ['Rose', '#ee86a5'],
  ['Peach pink', '#f8b4b0'],
  ['Mauve', '#d9a0c0'],
  ['Petal', '#fbc8d8'],
];

export function SettingsPanel({ db, setDb }) {
  const set = (k) => (v) => setDb((d) => ({ ...d, [k]: v }));
  const ratio = contrast(db.accent, onAccent(db.accent));
  return (
    <section className="card" aria-label="Settings">
      <h2>Settings</h2>
      <div className="sw" role="group" aria-label="Accent colour">
        {SWATCHES.map(([n, c]) => (
          <button
            key={c}
            type="button"
            className="c"
            style={{ background: c }}
            title={n}
            aria-label={n}
            aria-pressed={db.accent === c}
            onClick={() => set('accent')(c)}
          />
        ))}
        <label htmlFor="pick" style={{ marginLeft: 6 }}>
          Custom
        </label>
        <input type="color" id="pick" value={db.accent} onChange={(e) => set('accent')(e.target.value)} />
      </div>
      {ratio < 4.5 && (
        <p className="err" role="status" style={{ marginTop: 8 }}>
          Text on this colour is hard to read (contrast {ratio.toFixed(1)}:1, aim for at least 4.5:1). Try a lighter or darker shade.
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="f" style={{ flex: '0 1 200px' }}>
          <label htmlFor="mode">Light or dark</label>
          <select id="mode" value={db.mode} onChange={(e) => set('mode')(e.target.value)}>
            <option value="auto">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="f" style={{ flex: '0 1 240px' }}>
          <label htmlFor="currency">Currency</label>
          <select id="currency" value={db.currency} onChange={(e) => set('currency')(e.target.value)}>
            {CURRENCIES.map(([c, n]) => (
              <option key={c} value={c}>
                {c} · {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="chk" htmlFor="carry" style={{ marginTop: 14 }}>
        <input type="checkbox" id="carry" checked={db.carryOver} onChange={(e) => set('carryOver')(e.target.checked)} />
        Carry each week’s leftover (or overspending) into the next week’s budget
      </label>
      <p className="hint">Changing the currency only changes the symbol. Amounts you’ve already entered aren’t converted.</p>
    </section>
  );
}
