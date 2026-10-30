import * as XLSX from 'xlsx';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Other'];
export const fmt = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n || 0);
export const peso = (n) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}
export function mondayOf(k) {
  const [y, w] = k.split('-W').map(Number);
  const j = new Date(Date.UTC(y, 0, 4));
  const n = j.getUTCDay() || 7;
  j.setUTCDate(j.getUTCDate() - n + 1 + (w - 1) * 7);
  return new Date(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const short = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
export const dateOf = (mon, i) => addDays(mon, i).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

export function group(items, k) {
  const g = {};
  items.forEach((i) => (g[i[k]] = (g[i[k]] || 0) + i.amt));
  return Object.entries(g).sort((a, b) => b[1] - a[1]);
}

// Everything the UI and exports need for one week
export function snap(w, key) {
  const mon = mondayOf(key), end = addDays(mon, 6), b = +w.budget || 0;
  const items = [...w.items].sort((a, c) => a.day - c.day || a.id - c.id);
  const spent = items.reduce((a, c) => a + c.amt, 0);
  return { mon, b, items, spent, rem: b - spent, label: `${short(mon)} – ${short(end)}, ${end.getFullYear()}` };
}

export function txtReport(s, key) {
  const L = ['WEEKLY BUDGET', `Week: ${s.label} (${key})`, ''];
  L.push('Budget:    ' + peso(s.b), 'Spent:     ' + peso(s.spent), s.rem < 0 ? 'Over budget by: ' + peso(-s.rem) : 'Remaining: ' + peso(s.rem), '', 'EXPENSES');
  if (!s.items.length) L.push('(none added)');
  DAYS.forEach((d, i) => {
    const day = s.items.filter((x) => x.day === i);
    if (!day.length) return;
    L.push('', `${d}, ${dateOf(s.mon, i)}`);
    day.forEach((x) => L.push(`  - ${x.name} [${x.cat}]: ${peso(x.amt)}`));
    L.push('  Day total: ' + peso(day.reduce((a, c) => a + c.amt, 0)));
  });
  const g = group(s.items, 'cat');
  if (g.length) { L.push('', 'BY CATEGORY'); g.forEach(([n, v]) => L.push('  ' + n.padEnd(12) + peso(v))); }
  L.push('', 'Total spent: ' + peso(s.spent), 'Exported: ' + new Date().toLocaleString('en-PH'));
  return L.join('\r\n');
}

export function downloadTxt(s, key) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txtReport(s, key)], { type: 'text/plain;charset=utf-8' }));
  a.download = `budget-${key}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadXlsx(s, key) {
  const n = s.items.length, PESO = '"₱"#,##0.00', cats = group(s.items, 'cat');
  const rows = [['Date', 'Day', 'Item', 'Category', 'Amount (PHP)']];
  s.items.forEach((x) => rows.push([dateOf(s.mon, x.day), DAYS[x.day], x.name, x.cat, x.amt]));
  rows.push([], ['', '', '', 'Total', s.spent]);
  const ex = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 2; r <= n + 1; r++) ex['E' + r].z = PESO;
  const tr = n + 3;
  ex['E' + tr] = n ? { t: 'n', v: s.spent, f: `SUM(E2:E${n + 1})`, z: PESO } : { t: 'n', v: 0, z: PESO };
  ex['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 30 }, { wch: 14 }, { wch: 16 }];
  const sm = XLSX.utils.aoa_to_sheet([
    ['Weekly Budget'], ['Week', s.label], [],
    ['Budget (PHP)', s.b], ['Spent (PHP)', s.spent],
    [s.rem < 0 ? 'Over budget by (PHP)' : 'Remaining (PHP)', Math.abs(s.rem)], [],
    ['Category', 'Spent (PHP)'], ...cats,
  ]);
  sm.B4.z = PESO;
  sm.B5 = { t: 'n', v: s.spent, f: n ? `SUM(Expenses!E2:E${n + 1})` : '0', z: PESO };
  sm.B6 = { t: 'n', v: Math.abs(s.rem), f: 'ABS(B4-B5)', z: PESO };
  cats.forEach((_, i) => (sm['B' + (9 + i)].z = PESO));
  sm['!cols'] = [{ wch: 22 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sm, 'Summary');
  XLSX.utils.book_append_sheet(wb, ex, 'Expenses');
  XLSX.writeFile(wb, `budget-${key}.xlsx`);
}

// Reads a .txt report exported by this app back into { key, budget, items }.
// Returns null when the text isn't one of our reports.
export function parseReport(text) {
  const key = text.match(/^Week:.*\((\d{4}-W\d{2})\)/m)?.[1];
  const wk = key ? +key.slice(-2) : 0;
  if (!key || wk < 1 || wk > 53) return null;
  const budget = parseFloat((text.match(/^Budget:\s*₱?\s*([\d,]+(?:\.\d+)?)/m)?.[1] || '0').replace(/,/g, '')) || 0;
  const items = [];
  let day = 0;
  text.split(/\r?\n/).forEach((line) => {
    const d = DAYS.indexOf(line.slice(0, 3));
    if (d >= 0 && line[3] === ',') { day = d; return; }
    const m = line.match(/^\s*-\s+(.+?)\s+\[([^\]]+)\]:\s*₱?\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return;
    const amt = parseFloat(m[3].replace(/,/g, ''));
    if (amt > 0) items.push({ id: Date.now() + items.length, name: m[1].slice(0, 60), cat: CATS.includes(m[2]) ? m[2] : 'Other', amt, day });
  });
  return { key, budget, items };
}
