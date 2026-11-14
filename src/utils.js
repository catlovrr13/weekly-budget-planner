export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Debt', 'Other'];

// ---- Money ----
// Amounts are stored as plain numbers, but every sum is done in whole centavos so
// 0.1 + 0.2 never turns into 0.30000000000000004 (or a phantom "over by ₱0.00").
export const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const sum = (arr, f = (x) => x.amt) => arr.reduce((a, x) => a + Math.round((+f(x) || 0) * 100), 0) / 100;

export const CURRENCIES = [
  ['PHP', 'Philippine peso'],
  ['USD', 'US dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British pound'],
  ['JPY', 'Japanese yen'],
  ['SGD', 'Singapore dollar'],
  ['AUD', 'Australian dollar'],
  ['CAD', 'Canadian dollar'],
  ['HKD', 'Hong Kong dollar'],
  ['CNY', 'Chinese yuan'],
  ['KRW', 'South Korean won'],
  ['INR', 'Indian rupee'],
  ['MYR', 'Malaysian ringgit'],
  ['IDR', 'Indonesian rupiah'],
  ['THB', 'Thai baht'],
  ['VND', 'Vietnamese dong'],
  ['AED', 'UAE dirham'],
  ['SAR', 'Saudi riyal'],
];
let CUR = 'PHP';
const formatters = {};
const nf = () => (formatters[CUR] ||= new Intl.NumberFormat('en-PH', { style: 'currency', currency: CUR }));
export const setCurrency = (c) => {
  CUR = CURRENCIES.some(([k]) => k === c) ? c : 'PHP';
};
export const getCurrency = () => CUR;
export const sym = () =>
  nf()
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value || CUR;
export const fmt = (n) => nf().format(r2(n));
// Plain-text money for .txt reports: symbol + 2 decimals.
export const money = (n) => sym() + r2(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEY = String.raw`[^\d\s|-]*\s*([\d,]+(?:\.\d+)?)`; // any currency symbol, then the number

// Export and import scope: everything, just the week's expenses, or just the debt lists.
export const SCOPES = [
  ['all', 'Everything (expenses + debts)'],
  ['expenses', 'Expenses only'],
  ['debts', 'Debts only'],
];
const SCOPE_WORDS = { all: 'expenses, debts', expenses: 'expenses only', debts: 'debts only' };
const SUFFIX = { all: '', expenses: '-expenses', debts: '-debts' };
export const hasExpenses = (scope) => scope !== 'debts';
export const hasDebts = (scope) => scope !== 'expenses';

// ---- Weeks and dates ----
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
export const shiftWeek = (k, n) => weekKey(addDays(mondayOf(k), n * 7));
export const short = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
export const dateOf = (mon, i) => addDays(mon, i).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function group(items, k) {
  const g = {};
  items.forEach((i) => (g[i[k]] = (g[i[k]] || 0) + Math.round(i.amt * 100)));
  return Object.entries(g)
    .map(([n, c]) => [n, c / 100])
    .sort((a, b) => b[1] - a[1]);
}

// Everything the UI and exports need for one week. `carry` is last week's leftover
// (or overspending, as a negative number) when carry-over is turned on.
export function snap(w, key, carry = 0) {
  const mon = mondayOf(key),
    end = addDays(mon, 6),
    base = r2(Math.max(0, +w.budget || 0));
  const b = base > 0 ? r2(base + carry) : 0;
  const items = [...w.items].sort((a, c) => a.day - c.day);
  const spent = sum(items);
  return {
    mon,
    base,
    carry: base > 0 ? carry : 0,
    b,
    items,
    spent,
    rem: r2(b - spent),
    label: `${short(mon)} – ${short(end)}, ${end.getFullYear()}`,
  };
}

// Leftover carried into `key`: walks back through the unbroken run of budgeted weeks before it.
export function carryInto(weeks, key, on, limit = 104) {
  if (!on) return 0;
  const chain = [];
  for (let k = shiftWeek(key, -1); chain.length < limit; k = shiftWeek(k, -1)) {
    const w = weeks[k];
    if (!w || !(w.budget > 0)) break;
    chain.push(w);
  }
  let carry = 0;
  for (let i = chain.length - 1; i >= 0; i--) carry = r2(chain[i].budget + carry - sum(chain[i].items));
  return carry;
}

// ---- Debts and money owed to me ----
// Debts are matched by lender + purpose, so two debts to "Mom" stay separate.
export const debtKey = (lender, purpose = '') => `${String(lender).trim().toLowerCase()}\u0000${String(purpose).trim().toLowerCase()}`;
export function findDebt(debts, lender, purpose) {
  if (!lender) return undefined;
  if (purpose !== undefined) {
    const exact = debts.find((d) => debtKey(d.lender, d.purpose) === debtKey(lender, purpose));
    if (exact) return exact;
  }
  return debts.find((d) => d.lender.trim().toLowerCase() === lender.trim().toLowerCase());
}
export const owedRepaid = (o) => sum(o.payments || []);
export const owedLeft = (o) => (o.paid ? 0 : Math.max(0, r2(o.amount - owedRepaid(o))));
export const owedDone = (o) => owedLeft(o) === 0;

// ---- Text report escaping ----
// Characters that separate fields in the .txt report get a backslash in front of them,
// so names like "Snacks [work]" or "Ate Joy (cousin)" survive a round trip.
const SPECIAL = /[\\[\]():|→]/g;
export const esc = (s) => String(s).replace(SPECIAL, (c) => '\\' + c);
export const unesc = (s) => String(s).replace(/\\(.)/g, '$1');
const lenderTag = (d) => `${esc(d.lender)} (${esc(d.purpose)})`;

export function txtReport(s, key, extra = {}, scope = 'all') {
  const { debts = [], owed = [] } = extra;
  const wantEx = hasExpenses(scope),
    wantDebt = hasDebts(scope);
  const r = rateWeek(s, debts);
  const debtOf = (id) => debts.find((d) => d.id === id);
  // The lender rides along in the brackets so an exported payment can find its debt again on import.
  const tag = (x) => (x.debtId != null && debtOf(x.debtId) ? `${x.cat} → ${lenderTag(debtOf(x.debtId))}` : x.cat);
  const L = ['WEEKLY BUDGET', `Week: ${s.label} (${key})`, `Includes: ${SCOPE_WORDS[scope]}`, `Currency: ${getCurrency()}`, ''];
  if (wantEx) {
    L.push('Budget:    ' + money(s.base));
    if (s.carry) L.push((s.carry > 0 ? 'Carried in: +' : 'Carried in: -') + money(Math.abs(s.carry)));
    L.push('Spent:     ' + money(s.spent), s.rem < 0 ? 'Over budget by: ' + money(-s.rem) : 'Remaining: ' + money(s.rem));
    if (r) L.push(`Rating:    ${starText(r.stars)} ${r.label} (${r.score}/100)`);
    L.push('', 'EXPENSES');
    if (!s.items.length) L.push('(none added)');
    DAYS.forEach((d, i) => {
      const day = s.items.filter((x) => x.day === i);
      if (!day.length) return;
      L.push('', `${d}, ${dateOf(s.mon, i)}`);
      day.forEach((x) => L.push(`  - ${esc(x.name)} [${tag(x)}]: ${money(x.amt)}`));
      L.push('  Day total: ' + money(sum(day)));
    });
    const g = group(s.items, 'cat');
    if (g.length) {
      L.push('', 'BY CATEGORY');
      g.forEach(([n, v]) => L.push('  ' + n.padEnd(12) + money(v)));
    }
  }
  if (wantDebt) {
    const weekPaid = (id) => sum(s.items.filter((i) => i.debtId === id));
    L.push('', 'MONEY I OWE (balances as of export)');
    if (!debts.length) L.push('  (none listed)');
    debts.forEach((d) => {
      const w = weekPaid(d.id);
      L.push(
        `  - ${lenderTag(d)}: borrowed ${money(d.amount)} | paid ${money(d.paid)} | ${money(d.left)} left${wantEx && w ? ' | paid this week ' + money(w) : ''}`,
      );
    });
    if (debts.length) L.push('  Total still owed: ' + money(sum(debts, (d) => d.left)));
    L.push('', 'MONEY OWED TO ME');
    if (!owed.length) L.push('  (none listed)');
    owed.forEach((o) => {
      const rep = owedRepaid(o);
      L.push(
        `  - ${esc(o.person)}: ${money(o.amount)} | borrowed ${o.borrowedOn} | ${o.promisedOn ? 'promised ' + o.promisedOn : 'no pay date given'}${rep ? ' | repaid ' + money(rep) : ''}${o.paid ? ' | PAID BACK' : isLate(o) ? ' | PAST DUE' : ''}`,
      );
    });
    if (owed.length) L.push('  Total still owed to me: ' + money(sum(owed, owedLeft)));
  }
  L.push('');
  if (wantEx) L.push('Total spent: ' + money(s.spent));
  L.push('Exported: ' + new Date().toLocaleString('en-PH'));
  return L.join('\r\n');
}

export function downloadBlob(text, name, type = 'text/plain;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadTxt(s, key, extra, scope = 'all') {
  downloadBlob(txtReport(s, key, extra, scope), `budget-${key}${SUFFIX[scope]}.txt`);
}

// The Excel library is large, so it's only downloaded the first time someone exports to Excel.
export async function downloadXlsx(s, key, extra = {}, scope = 'all') {
  const XLSX = await import('xlsx');
  const FMT = `"${sym().replace(/"/g, '')}"#,##0.00`,
    { debts = [], owed = [] } = extra;
  const weekPaid = (id) => sum(s.items.filter((i) => i.debtId === id));
  const lenderOf = (id) => debts.find((d) => d.id === id)?.lender || '';
  const cur = getCurrency();
  const wb = XLSX.utils.book_new();
  if (hasExpenses(scope)) {
    const n = s.items.length,
      cats = group(s.items, 'cat'),
      r = rateWeek(s, debts);
    const rows = [['Date', 'Day', 'Item', 'Category', `Amount (${cur})`, 'Pays debt']];
    s.items.forEach((x) =>
      rows.push([dateOf(s.mon, x.day), DAYS[x.day], x.name, x.cat, x.amt, x.debtId != null ? lenderOf(x.debtId) : '']),
    );
    rows.push([], ['', '', '', 'Total', s.spent]);
    const ex = XLSX.utils.aoa_to_sheet(rows);
    for (let i = 2; i <= n + 1; i++) ex['E' + i].z = FMT;
    const tr = n + 3;
    ex['E' + tr] = n ? { t: 'n', v: s.spent, f: `SUM(E2:E${n + 1})`, z: FMT } : { t: 'n', v: 0, z: FMT };
    ex['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    const sm = XLSX.utils.aoa_to_sheet([
      ['Weekly Budget'],
      ['Week', s.label],
      ['Rating', r ? `${starText(r.stars)} ${r.label} (${r.score}/100)` : 'Not rated yet'],
      [s.carry ? `Budget incl. carry-over (${cur})` : `Budget (${cur})`, s.b],
      [`Spent (${cur})`, s.spent],
      [s.rem < 0 ? `Over budget by (${cur})` : `Remaining (${cur})`, Math.abs(s.rem)],
      [],
      ['Category', `Spent (${cur})`],
      ...cats,
    ]);
    sm.B4.z = FMT;
    sm.B5 = { t: 'n', v: s.spent, f: n ? `SUM(Expenses!E2:E${n + 1})` : '0', z: FMT };
    sm.B6 = { t: 'n', v: Math.abs(s.rem), f: 'ABS(B4-B5)', z: FMT };
    cats.forEach((_, i) => (sm['B' + (9 + i)].z = FMT));
    sm['!cols'] = [{ wch: 26 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, sm, 'Summary');
    XLSX.utils.book_append_sheet(wb, ex, 'Expenses');
  }
  if (hasDebts(scope)) {
    const dr = [['Lender', 'Purpose', `Amount borrowed (${cur})`, `Paid so far (${cur})`, `Left (${cur})`, `Paid this week (${cur})`]];
    debts.forEach((d) => dr.push([d.lender, d.purpose, d.amount, d.paid, d.left, weekPaid(d.id)]));
    const sums = [(d) => d.amount, (d) => d.paid, (d) => d.left, (d) => weekPaid(d.id)].map((f) => sum(debts, f));
    dr.push([], ['Total', '', ...sums]);
    const dn = debts.length,
      dsh = XLSX.utils.aoa_to_sheet(dr),
      cols = ['C', 'D', 'E', 'F'];
    debts.forEach((_, i) => cols.forEach((c) => (dsh[c + (i + 2)].z = FMT)));
    cols.forEach((c, i) => {
      dsh[c + (dn + 3)] = { t: 'n', v: sums[i], f: dn ? `SUM(${c}2:${c}${dn + 1})` : '0', z: FMT };
    });
    dsh['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];
    const status = (o) => (owedDone(o) ? 'Paid back' : isLate(o) ? 'Past due' : o.promisedOn ? 'Waiting' : 'Waiting (no pay date)');
    const orows = [['Person', `Amount (${cur})`, `Repaid (${cur})`, `Left (${cur})`, 'Date borrowed', 'Promised pay date', 'Status']];
    owed.forEach((o) =>
      orows.push([
        o.person,
        o.amount,
        owedRepaid(o),
        owedLeft(o),
        fmtDate(o.borrowedOn),
        o.promisedOn ? fmtDate(o.promisedOn) : '',
        status(o),
      ]),
    );
    const on = owed.length,
      stillOwed = sum(owed, owedLeft);
    orows.push([], ['Still owed to me', '', '', stillOwed]);
    const osh = XLSX.utils.aoa_to_sheet(orows);
    owed.forEach((_, i) => ['B', 'C', 'D'].forEach((c) => (osh[c + (i + 2)].z = FMT)));
    osh['D' + (on + 3)] = { t: 'n', v: stillOwed, f: on ? `SUM(D2:D${on + 1})` : '0', z: FMT };
    osh['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, dsh, 'Debts I owe');
    XLSX.utils.book_append_sheet(wb, osh, 'Owed to me');
  }
  XLSX.writeFile(wb, `budget-${key}${SUFFIX[scope]}.xlsx`);
}

const num = (str) => parseFloat(String(str ?? '0').replace(/,/g, '')) || 0;
// A run of escaped characters or anything except a backslash and the given stop characters.
const field = (stops) => String.raw`((?:\\.|[^\\${stops}])+?)`;
const ITEM_RE = new RegExp(String.raw`^\s*-\s+${field(String.raw`\[`)}\s+\[((?:\\.|[^\\\]])+)\]:\s*${MONEY}\s*$`);
const LENDER_RE = new RegExp(String.raw`^${field('(')}(?:\s+\(((?:\\.|[^\\)])*)\))?\s*$`);
const DEBT_RE = new RegExp(String.raw`^\s*-\s+${field('(')}\s+\(((?:\\.|[^\\)])*)\):\s*borrowed\s*${MONEY}`);
const OLD_DEBT_RE = new RegExp(String.raw`^\s*-\s+${field('(')}\s+\(((?:\\.|[^\\)])*)\):\s*${MONEY}\s*left of\s*${MONEY}`);
const OWED_RE = new RegExp(
  String.raw`^\s*-\s+${field(':')}:\s*${MONEY}\s*\|\s*borrowed\s*(\d{4}-\d{2}-\d{2})(?:\s*\|\s*promised\s*(\d{4}-\d{2}-\d{2}))?`,
);
const REPAID_RE = new RegExp(String.raw`\|\s*repaid\s*${MONEY}`);

// Reads a .txt report exported by this app back into
// { key, budget, items, debts, owed, has: { expenses, debts } }.
// Returns null when the text isn't one of our reports.
export function parseReport(text) {
  const key = text.match(/^Week:.*\((\d{4}-W\d{2})\)/m)?.[1];
  const wk = key ? +key.slice(-2) : 0;
  if (!key || wk < 1 || wk > 53) return null;
  const budget = num(text.match(new RegExp(String.raw`^Budget:\s*${MONEY}`, 'm'))?.[1]);
  const items = [],
    debts = [],
    owed = [];
  let day = 0,
    sec = 'head';
  text.split(/\r?\n/).forEach((line) => {
    if (/^EXPENSES\b/.test(line)) {
      sec = 'ex';
      return;
    }
    if (/^BY CATEGORY\b/.test(line)) {
      sec = 'cat';
      return;
    }
    if (/^MONEY I OWE\b/.test(line)) {
      sec = 'debt';
      return;
    }
    if (/^MONEY OWED TO ME\b/.test(line)) {
      sec = 'owed';
      return;
    }
    if (sec === 'ex') {
      const d = DAYS.indexOf(line.slice(0, 3));
      if (d >= 0 && line[3] === ',') {
        day = d;
        return;
      }
      const m = line.match(ITEM_RE);
      if (!m) return;
      const amt = num(m[3]);
      // Split the tag at the first unescaped arrow: "Debt → Lender (Purpose)".
      const arrow = m[2].search(/(?<!\\)→/);
      const cat = unesc(arrow < 0 ? m[2] : m[2].slice(0, arrow)).trim();
      const lm =
        arrow < 0
          ? null
          : m[2]
              .slice(arrow + 1)
              .trim()
              .match(LENDER_RE);
      const lender = lm ? unesc(lm[1]).trim() : '';
      const purpose = lm && lm[2] !== undefined ? unesc(lm[2]).trim() : undefined;
      if (amt > 0) items.push({ name: unesc(m[1]).slice(0, 60), cat: CATS.includes(cat) ? cat : 'Other', amt, day, lender, purpose });
    } else if (sec === 'debt') {
      // Current format first, then the older "₱x left of ₱y" one.
      const m = line.match(DEBT_RE);
      const o = m ? null : line.match(OLD_DEBT_RE);
      const amount = m ? num(m[3]) : o ? num(o[4]) : 0;
      const g = m || o;
      if (g && amount > 0) debts.push({ lender: unesc(g[1]).slice(0, 60), purpose: unesc(g[2]).slice(0, 80), amount });
    } else if (sec === 'owed') {
      const m = line.match(OWED_RE);
      if (m && num(m[2]) > 0) {
        const rep = num(line.match(REPAID_RE)?.[1]);
        owed.push({
          person: unesc(m[1]).slice(0, 60),
          amount: num(m[2]),
          borrowedOn: m[3],
          promisedOn: m[4] || '',
          paid: /\|\s*PAID BACK/.test(line),
          payments: rep > 0 ? [{ amt: rep, date: '' }] : [],
        });
      }
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
  const keys = [],
    d = new Date(y, mo, 1);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  while (d.getMonth() === mo) {
    keys.push(weekKey(d));
    d.setDate(d.getDate() + 7);
  }
  return keys;
}

// Dates for the debt lists are stored as plain YYYY-MM-DD strings.
export const todayStr = () => isoDate(new Date());
export const fmtDate = (str) => {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const isLate = (o) => !owedDone(o) && !!o.promisedOn && o.promisedOn < todayStr();

// ---- Colour contrast (WCAG) ----
const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
export const INK = '#4a2c36';
// Dark ink or white, whichever reads better on the accent colour.
export const onAccent = (hex) => (contrast(hex, INK) >= contrast(hex, '#ffffff') ? INK : '#ffffff');

// ---- Weekly rating (recalculated from the week's data every render) ----
export const starsFor = (score) => (score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1);
export const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const MOODS = {
  5: ['🌟', 'Budget superstar!'],
  4: ['😊', 'Doing great'],
  3: ['🙂', 'Not bad at all'],
  2: ['😅', 'A little tight'],
  1: ['🥺', 'Tough week, you’ve got this'],
};

// 70 pts budget control, 15 pts debt care, 15 pts spreading spending out. Needs a budget and some expenses.
export function rateWeek(s, debts = []) {
  if (!(s.b > 0) || !s.items.length) return null;
  const ratio = s.spent / s.b;
  const budgetPts = ratio <= 0.85 ? 70 : ratio <= 1 ? 70 - ((ratio - 0.85) / 0.15) * 20 : 40 - Math.min(40, (ratio - 1) * 130);
  const paid = sum(s.items.filter((i) => i.debtId != null));
  const owing = debts.some((d) => d.left > 0) || paid > 0;
  const debtPts = !owing || paid > 0 ? 15 : 5;
  const perDay = {};
  s.items.forEach((i) => (perDay[i.day] = (perDay[i.day] || 0) + i.amt));
  const share = s.spent > 0 ? Math.max(...Object.values(perDay)) / s.spent : 0;
  const spreadPts = s.items.length < 3 || share <= 0.4 ? 15 : share >= 0.8 ? 5 : 15 - ((share - 0.4) / 0.4) * 10;
  const score = Math.round(budgetPts + debtPts + spreadPts);
  const stars = starsFor(score);
  const notes = [
    ratio <= 0.85
      ? `Used ${Math.round(ratio * 100)}% of your budget with ${fmt(s.rem)} to spare`
      : ratio <= 1
        ? `Cutting it close: ${Math.round(ratio * 100)}% of your budget used`
        : `Over budget by ${fmt(-s.rem)}`,
    !owing ? 'No debts to worry about' : paid > 0 ? `Paid ${fmt(paid)} toward your debts` : 'No debt payment yet this week',
  ];
  if (s.items.length >= 3)
    notes.push(share > 0.6 ? `${Math.round(share * 100)}% of your spending landed on one day` : 'Spending was nicely spread out');
  return { score, stars, face: MOODS[stars][0], label: MOODS[stars][1], notes, paid };
}
