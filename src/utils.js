import * as XLSX from 'xlsx';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Debt', 'Other'];
export const fmt = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n || 0);
export const peso = (n) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Export and import scope: everything, just the week's expenses, or just the debt lists.
export const SCOPES = [['all', 'Everything (expenses + debts)'], ['expenses', 'Expenses only'], ['debts', 'Debts only']];
const SCOPE_WORDS = { all: 'expenses, debts', expenses: 'expenses only', debts: 'debts only' };
const SUFFIX = { all: '', expenses: '-expenses', debts: '-debts' };
export const hasExpenses = (scope) => scope !== 'debts';
export const hasDebts = (scope) => scope !== 'expenses';

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

export function txtReport(s, key, extra = {}, scope = 'all') {
  const { debts = [], owed = [] } = extra;
  const wantEx = hasExpenses(scope), wantDebt = hasDebts(scope);
  const r = rateWeek(s, debts);
  const lenderOf = (id) => debts.find((d) => d.id === id)?.lender;
  // The lender rides along in the brackets so an exported payment can find its debt again on import.
  const tag = (x) => (x.debtId && lenderOf(x.debtId) ? `${x.cat} → ${lenderOf(x.debtId)}` : x.cat);
  const L = ['WEEKLY BUDGET', `Week: ${s.label} (${key})`, `Includes: ${SCOPE_WORDS[scope]}`, ''];
  if (wantEx) {
    L.push('Budget:    ' + peso(s.b), 'Spent:     ' + peso(s.spent), s.rem < 0 ? 'Over budget by: ' + peso(-s.rem) : 'Remaining: ' + peso(s.rem));
    if (r) L.push(`Rating:    ${starText(r.stars)} ${r.label} (${r.score}/100)`);
    L.push('', 'EXPENSES');
    if (!s.items.length) L.push('(none added)');
    DAYS.forEach((d, i) => {
      const day = s.items.filter((x) => x.day === i);
      if (!day.length) return;
      L.push('', `${d}, ${dateOf(s.mon, i)}`);
      day.forEach((x) => L.push(`  - ${x.name} [${tag(x)}]: ${peso(x.amt)}`));
      L.push('  Day total: ' + peso(day.reduce((a, c) => a + c.amt, 0)));
    });
    const g = group(s.items, 'cat');
    if (g.length) { L.push('', 'BY CATEGORY'); g.forEach(([n, v]) => L.push('  ' + n.padEnd(12) + peso(v))); }
  }
  if (wantDebt) {
    const weekPaid = (id) => s.items.filter((i) => i.debtId === id).reduce((a, i) => a + i.amt, 0);
    L.push('', 'MONEY I OWE (balances as of export)');
    if (!debts.length) L.push('  (none listed)');
    debts.forEach((d) => {
      const w = weekPaid(d.id);
      L.push(`  - ${d.lender} (${d.purpose}): borrowed ${peso(d.amount)} | paid ${peso(d.paid)} | ${peso(d.left)} left${wantEx && w ? ' | paid this week ' + peso(w) : ''}`);
    });
    if (debts.length) L.push('  Total still owed: ' + peso(debts.reduce((a, d) => a + d.left, 0)));
    L.push('', 'MONEY OWED TO ME');
    if (!owed.length) L.push('  (none listed)');
    owed.forEach((o) => L.push(`  - ${o.person}: ${peso(o.amount)} | borrowed ${o.borrowedOn} | ${o.promisedOn ? 'promised ' + o.promisedOn : 'no pay date given'}${o.paid ? ' | PAID BACK' : isLate(o) ? ' | PAST DUE' : ''}`));
    if (owed.length) L.push('  Total still owed to me: ' + peso(owed.filter((o) => !o.paid).reduce((a, o) => a + o.amount, 0)));
  }
  L.push('');
  if (wantEx) L.push('Total spent: ' + peso(s.spent));
  L.push('Exported: ' + new Date().toLocaleString('en-PH'));
  return L.join('\r\n');
}

export function downloadTxt(s, key, extra, scope = 'all') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txtReport(s, key, extra, scope)], { type: 'text/plain;charset=utf-8' }));
  a.download = `budget-${key}${SUFFIX[scope]}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadXlsx(s, key, extra = {}, scope = 'all') {
  const PESO = '"₱"#,##0.00', { debts = [], owed = [] } = extra;
  const weekPaid = (id) => s.items.filter((i) => i.debtId === id).reduce((a, i) => a + i.amt, 0);
  const lenderOf = (id) => debts.find((d) => d.id === id)?.lender || '';
  const wb = XLSX.utils.book_new();
  if (hasExpenses(scope)) {
    const n = s.items.length, cats = group(s.items, 'cat'), r = rateWeek(s, debts);
    const rows = [['Date', 'Day', 'Item', 'Category', 'Amount (PHP)', 'Pays debt']];
    s.items.forEach((x) => rows.push([dateOf(s.mon, x.day), DAYS[x.day], x.name, x.cat, x.amt, x.debtId ? lenderOf(x.debtId) : '']));
    rows.push([], ['', '', '', 'Total', s.spent]);
    const ex = XLSX.utils.aoa_to_sheet(rows);
    for (let i = 2; i <= n + 1; i++) ex['E' + i].z = PESO;
    const tr = n + 3;
    ex['E' + tr] = n ? { t: 'n', v: s.spent, f: `SUM(E2:E${n + 1})`, z: PESO } : { t: 'n', v: 0, z: PESO };
    ex['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    const sm = XLSX.utils.aoa_to_sheet([
      ['Weekly Budget'], ['Week', s.label], ['Rating', r ? `${starText(r.stars)} ${r.label} (${r.score}/100)` : 'Not rated yet'],
      ['Budget (PHP)', s.b], ['Spent (PHP)', s.spent],
      [s.rem < 0 ? 'Over budget by (PHP)' : 'Remaining (PHP)', Math.abs(s.rem)], [],
      ['Category', 'Spent (PHP)'], ...cats,
    ]);
    sm.B4.z = PESO;
    sm.B5 = { t: 'n', v: s.spent, f: n ? `SUM(Expenses!E2:E${n + 1})` : '0', z: PESO };
    sm.B6 = { t: 'n', v: Math.abs(s.rem), f: 'ABS(B4-B5)', z: PESO };
    cats.forEach((_, i) => (sm['B' + (9 + i)].z = PESO));
    sm['!cols'] = [{ wch: 22 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, sm, 'Summary');
    XLSX.utils.book_append_sheet(wb, ex, 'Expenses');
  }
  if (hasDebts(scope)) {
    const dr = [['Lender', 'Purpose', 'Amount borrowed (PHP)', 'Paid so far (PHP)', 'Left (PHP)', 'Paid this week (PHP)']];
    debts.forEach((d) => dr.push([d.lender, d.purpose, d.amount, d.paid, d.left, weekPaid(d.id)]));
    const sums = [(d) => d.amount, (d) => d.paid, (d) => d.left, (d) => weekPaid(d.id)].map((f) => debts.reduce((a, d) => a + f(d), 0));
    dr.push([], ['Total', '', ...sums]);
    const dn = debts.length, dsh = XLSX.utils.aoa_to_sheet(dr), money = ['C', 'D', 'E', 'F'];
    debts.forEach((_, i) => money.forEach((c) => (dsh[c + (i + 2)].z = PESO)));
    money.forEach((c, i) => { dsh[c + (dn + 3)] = { t: 'n', v: sums[i], f: dn ? `SUM(${c}2:${c}${dn + 1})` : '0', z: PESO }; });
    dsh['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];
    const status = (o) => (o.paid ? 'Paid back' : isLate(o) ? 'Past due' : o.promisedOn ? 'Waiting' : 'Waiting (no pay date)');
    const orows = [['Person', 'Amount (PHP)', 'Date borrowed', 'Promised pay date', 'Status']];
    owed.forEach((o) => orows.push([o.person, o.amount, fmtDate(o.borrowedOn), o.promisedOn ? fmtDate(o.promisedOn) : '', status(o)]));
    const on = owed.length, stillOwed = owed.filter((o) => !o.paid).reduce((a, o) => a + o.amount, 0);
    orows.push([], ['Still owed to me', stillOwed]);
    const osh = XLSX.utils.aoa_to_sheet(orows);
    owed.forEach((_, i) => (osh['B' + (i + 2)].z = PESO));
    osh['B' + (on + 3)] = { t: 'n', v: stillOwed, f: on ? `SUMIF(E2:E${on + 1},"<>Paid back",B2:B${on + 1})` : '0', z: PESO };
    osh['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, dsh, 'Debts I owe');
    XLSX.utils.book_append_sheet(wb, osh, 'Owed to me');
  }
  XLSX.writeFile(wb, `budget-${key}${SUFFIX[scope]}.xlsx`);
}

const num = (str) => parseFloat(String(str ?? '0').replace(/,/g, '')) || 0;

// Reads a .txt report exported by this app back into
// { key, budget, items, debts, owed, has: { expenses, debts } }.
// Returns null when the text isn't one of our reports.
export function parseReport(text) {
  const key = text.match(/^Week:.*\((\d{4}-W\d{2})\)/m)?.[1];
  const wk = key ? +key.slice(-2) : 0;
  if (!key || wk < 1 || wk > 53) return null;
  const budget = num(text.match(/^Budget:\s*₱?\s*([\d,]+(?:\.\d+)?)/m)?.[1]);
  const items = [], debts = [], owed = [];
  let day = 0, sec = 'head';
  text.split(/\r?\n/).forEach((line) => {
    if (/^EXPENSES\b/.test(line)) { sec = 'ex'; return; }
    if (/^BY CATEGORY\b/.test(line)) { sec = 'cat'; return; }
    if (/^MONEY I OWE\b/.test(line)) { sec = 'debt'; return; }
    if (/^MONEY OWED TO ME\b/.test(line)) { sec = 'owed'; return; }
    if (sec === 'ex') {
      const d = DAYS.indexOf(line.slice(0, 3));
      if (d >= 0 && line[3] === ',') { day = d; return; }
      const m = line.match(/^\s*-\s+(.+?)\s+\[([^\]]+)\]:\s*₱?\s*([\d,]+(?:\.\d+)?)\s*$/);
      if (!m) return;
      const amt = num(m[3]), arrow = m[2].indexOf('→');
      const cat = (arrow < 0 ? m[2] : m[2].slice(0, arrow)).trim();
      const lender = arrow < 0 ? '' : m[2].slice(arrow + 1).trim();
      if (amt > 0) items.push({ name: m[1].slice(0, 60), cat: CATS.includes(cat) ? cat : 'Other', amt, day, lender });
    } else if (sec === 'debt') {
      // Current format first, then the older "₱x left of ₱y" one.
      const m = line.match(/^\s*-\s+(.+?)\s+\((.*?)\):\s*borrowed\s*₱?\s*([\d,]+(?:\.\d+)?)/)
        || line.match(/^\s*-\s+(.+?)\s+\((.*?)\):\s*₱?\s*[\d,.]+\s*left of\s*₱?\s*([\d,]+(?:\.\d+)?)/);
      if (m && num(m[3]) > 0) debts.push({ lender: m[1].slice(0, 60), purpose: m[2].slice(0, 80), amount: num(m[3]) });
    } else if (sec === 'owed') {
      const m = line.match(/^\s*-\s+(.+?):\s*₱?\s*([\d,]+(?:\.\d+)?)\s*\|\s*borrowed\s*(\d{4}-\d{2}-\d{2})(?:\s*\|\s*promised\s*(\d{4}-\d{2}-\d{2}))?/);
      if (m && num(m[2]) > 0) owed.push({ person: m[1].slice(0, 60), amount: num(m[2]), borrowedOn: m[3], promisedOn: m[4] || '', paid: /\|\s*PAID BACK/.test(line) });
    }
  });
  const inc = text.match(/^Includes:\s*(.+)$/m)?.[1] || '';
  const has = {
    // Reports made before scopes existed have no "Includes" line but always carry both sections.
    expenses: inc ? /expenses/i.test(inc) : /^EXPENSES\b/m.test(text),
    debts: (inc ? /debts/i.test(inc) : /^MONEY I OWE\b/m.test(text)) && !!(debts.length || owed.length),
  };
  return { key, budget, items, debts, owed, has };
}

// Builds a mailto: link with the report as the message body.
// Mail apps cap link length, so a long report is trimmed (the .txt download always has everything).
export function mailtoLink(to, s, key, extra, scope = 'all') {
  const subject = scope === 'debts' ? 'My debts and loans' : `Weekly Budget: ${s.label}`;
  let body = txtReport(s, key, extra, scope);
  let trimmed = false;
  while (encodeURIComponent(body).length > 1700) {
    trimmed = true;
    body = body.slice(0, Math.floor(body.length * 0.9));
    body = body.slice(0, body.lastIndexOf('\n') + 1);
  }
  if (trimmed) body += '\r\n…(shortened to fit. Download the .txt for the full report.)';
  return { trimmed, href: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}

// A week belongs to the month its Thursday falls in, so every week is counted exactly once.
export function monthOfWeek(key) {
  const th = addDays(mondayOf(key), 3);
  return { y: th.getFullYear(), mo: th.getMonth() };
}
export function weekKeysOfMonth(y, mo) {
  const keys = [], d = new Date(y, mo, 1);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  while (d.getMonth() === mo) { keys.push(weekKey(d)); d.setDate(d.getDate() + 7); }
  return keys;
}

// Dates for the debt lists are stored as plain YYYY-MM-DD strings.
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDate = (str) => {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const isLate = (o) => !o.paid && !!o.promisedOn && o.promisedOn < todayStr();

// ---- Weekly rating (recalculated from the week's data every render) ----
export const starsFor = (score) => (score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1);
export const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const MOODS = { 5: ['🌟', 'Budget superstar!'], 4: ['😊', 'Doing great'], 3: ['🙂', 'Not bad at all'], 2: ['😅', 'A little tight'], 1: ['🥺', 'Tough week, you’ve got this'] };

// 70 pts budget control, 15 pts debt care, 15 pts spreading spending out. Needs a budget and some expenses.
export function rateWeek(s, debts = []) {
  if (!(s.b > 0) || !s.items.length) return null;
  const ratio = s.spent / s.b;
  const budgetPts = ratio <= 0.85 ? 70 : ratio <= 1 ? 70 - ((ratio - 0.85) / 0.15) * 20 : 40 - Math.min(40, (ratio - 1) * 130);
  const paid = s.items.filter((i) => i.debtId).reduce((a, i) => a + i.amt, 0);
  const owing = debts.some((d) => d.left > 0) || paid > 0;
  const debtPts = !owing || paid > 0 ? 15 : 5;
  const perDay = {};
  s.items.forEach((i) => (perDay[i.day] = (perDay[i.day] || 0) + i.amt));
  const share = Math.max(...Object.values(perDay)) / s.spent;
  const spreadPts = s.items.length < 3 || share <= 0.4 ? 15 : share >= 0.8 ? 5 : 15 - ((share - 0.4) / 0.4) * 10;
  const score = Math.round(budgetPts + debtPts + spreadPts);
  const stars = starsFor(score);
  const notes = [
    ratio <= 0.85 ? `Used ${Math.round(ratio * 100)}% of your budget with ${fmt(s.rem)} to spare`
      : ratio <= 1 ? `Cutting it close: ${Math.round(ratio * 100)}% of your budget used`
      : `Over budget by ${fmt(-s.rem)}`,
    !owing ? 'No debts to worry about' : paid > 0 ? `Paid ${fmt(paid)} toward your debts` : 'No debt payment yet this week',
  ];
  if (s.items.length >= 3) notes.push(share > 0.6 ? `${Math.round(share * 100)}% of your spending landed on one day` : 'Spending was nicely spread out');
  return { score, stars, face: MOODS[stars][0], label: MOODS[stars][1], notes, paid };
}
