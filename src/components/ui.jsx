import { fmt } from '../utils.js';

export function Tabs({ tabs, tab, setTab }) {
  const move = (e) => {
    const i = tabs.findIndex(([id]) => id === tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1 + tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const [next] = tabs[to % tabs.length];
    setTab(next);
    document.getElementById('tab-' + next)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Sections" onKeyDown={move}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          id={'tab-' + id}
          className={'tab' + (tab === id ? ' on' : '')}
          role="tab"
          type="button"
          aria-selected={tab === id}
          aria-controls={'panel-' + id}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => setTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Every tab's panel stays in the page (hidden when not selected), so aria-controls always points somewhere
// and half-typed forms survive switching tabs.
export function Panel({ id, tab, children }) {
  return (
    <section id={'panel-' + id} role="tabpanel" aria-labelledby={'tab-' + id} tabIndex={-1} hidden={tab !== id}>
      {children}
    </section>
  );
}

export function Toast({ toast, onUndo, onClose }) {
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          <button className="btn sm" type="button" onClick={onUndo}>
            Undo
          </button>
          <button className="x" type="button" onClick={onClose} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function Bars({ rows, max }) {
  if (!rows.length) return <div className="empty">Nothing to show yet.</div>;
  return rows.map(([n, v]) => (
    <div className="mini" key={n}>
      <span className="n">{n}</span>
      <span className="t">
        <i style={{ width: (max ? (v / max) * 100 : 0) + '%' }} />
      </span>
      <span className="v">{fmt(v)}</span>
    </div>
  ));
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
