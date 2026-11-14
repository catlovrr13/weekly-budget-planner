// Reading bank and e-wallet CSV exports. Every bank lays its file out differently, so this
// guesses which columns hold the date, description and amounts, and the user can correct it.
import { r2, isoDate } from './utils.js';

/** Splits CSV text into rows of cells. Handles quotes, "" escapes, CRLF, and comma/semicolon/tab separators. */
export function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstLines = text.split(/\r?\n/, 5).join('\n');
  const count = (ch) => firstLines.split(ch).length;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const GUESS = {
  date: /^(transaction |posting |value |txn )?date|^date|posted|^when/i,
  desc: /desc|detail|particular|narrat|merchant|remark|memo|payee|transaction$|^name|reference|purpose/i,
  amount: /^amount|amount$|^amt|^value$|^php/i,
  debit: /debit|withdraw|money out|paid out|outflow|^dr\b|spent|charge/i,
  credit: /credit|deposit|money in|received|inflow|^cr\b/i,
};

/** Finds the header row (banks often put account details above it) and guesses each column's job. */
export function guessLayout(rows) {
  let headerRow = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (r.some((c) => GUESS.date.test(c)) && r.some((c) => GUESS.amount.test(c) || GUESS.debit.test(c) || GUESS.credit.test(c))) {
      headerRow = i;
      break;
    }
  }
  const header = rows[headerRow] || [];
  const find = (re, skip = []) => header.findIndex((h, i) => re.test(h) && !skip.includes(i));
  const date = find(GUESS.date);
  const debit = find(GUESS.debit, [date]);
  const credit = find(GUESS.credit, [date, debit]);
  const amount = debit >= 0 && credit >= 0 ? -1 : find(GUESS.amount, [date, debit, credit]);
  const desc = find(GUESS.desc, [date, debit, credit, amount]);
  return { headerRow, header, date, desc, amount, debit, credit };
}

/** Reads money like "₱1,234.50", "-500", "(500.00)" or "1,000.00 DR". Returns NaN for blanks. */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/\bdr\b/i.test(s)) neg = true;
  if (/^-|-$/.test(s.replace(/[^\d.,-]/g, ''))) neg = true;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  return r2(neg ? -n : n);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const valid = (y, m, d) => {
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? isoDate(dt) : '';
};

/** Works out whether slash dates are month-first or day-first from the values themselves. */
export function guessDateOrder(values) {
  for (const v of values) {
    const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) return 'dmy';
    if (+m[2] > 12) return 'mdy';
  }
  return 'mdy';
}

/** Reads a date as YYYY-MM-DD. `order` ('mdy' or 'dmy') decides what 03/04/2026 means. Returns '' when unreadable. */
export function parseDate(raw, order = 'mdy') {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return order === 'dmy' ? valid(+m[3], +m[2], +m[1]) : valid(+m[3], +m[1], +m[2]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i); // Nov 14, 2026
  if (m && MONTHS.includes(m[1].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  m = s.match(/^(\d{1,2})[\s-]([a-z]{3})[a-z]*\.?[\s-],?\s*(\d{2,4})/i); // 14 Nov 2026, 14-Nov-26
  if (m && MONTHS.includes(m[2].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return '';
}

// Checked in order, so "grabfood" is Food before "grab" is Transport.
const KEYWORDS = [
  [
    'Food',
    /grab ?food|foodpanda|jollibee|mcdo|mcdonald|kfc|chowking|mang inasal|greenwich|starbucks|coffee|cafe|bakery|restaurant|resto|food|grocery|supermarket|puregold|savemore|7-?eleven|ministop|alfamart|dali|meal|pizza/i,
  ],
  [
    'Transport',
    /grab|angkas|joyride|move ?it|lrt|mrt|beep|jeep|bus|taxi|uber|petron|shell|caltex|seaoil|gas|fuel|toll|autosweep|easytrip|rfid|parking|lalamove/i,
  ],
  [
    'Bills',
    /meralco|maynilad|manila water|pldt|globe|smart|dito|converge|sky ?cable|internet|electric|water|load|postpaid|prepaid|rent|insurance|tuition|bill/i,
  ],
  ['Health', /mercury|watsons|southstar|rose pharmacy|pharma|drug|clinic|hospital|medical|dental|doctor|lab/i],
  ['Fun', /netflix|spotify|youtube|disney|hbo|steam|playstation|nintendo|cinema|movie|concert|game/i],
  ['Shopping', /lazada|shopee|zalora|sm store|sm supermalls|uniqlo|h&m|ayala|robinsons|mall|shop|store/i],
];
export function guessCategory(desc) {
  return KEYWORDS.find(([, re]) => re.test(desc))?.[0] || 'Other';
}

/**
 * Turns CSV rows into entries: { date, name, amt, kind: 'expense'|'income', cat }.
 * With one amount column, `sign` says which way spending goes: 'negative' (−500 is money out, the usual) or 'positive'.
 * Rows without a readable date or amount are counted in `skipped`.
 */
export function rowsToEntries(rows, layout, { order = 'mdy', sign = 'negative' } = {}) {
  const out = [];
  let skipped = 0;
  for (const r of rows.slice(layout.headerRow + 1)) {
    const date = parseDate(r[layout.date], order);
    let amt;
    if (layout.amount >= 0) {
      const v = parseAmount(r[layout.amount]);
      amt = sign === 'positive' ? -v : v;
    } else {
      const out_ = Math.abs(parseAmount(r[layout.debit]) || 0);
      const in_ = Math.abs(parseAmount(r[layout.credit]) || 0);
      amt = r2(in_ - out_);
    }
    if (!date || !Number.isFinite(amt) || amt === 0) {
      skipped++;
      continue;
    }
    const name = (layout.desc >= 0 ? r[layout.desc] : '').replace(/\s+/g, ' ').slice(0, 60) || (amt < 0 ? 'Expense' : 'Income');
    out.push({ date, name, amt: Math.abs(amt), kind: amt < 0 ? 'expense' : 'income', cat: amt < 0 ? guessCategory(name) : undefined });
  }
  return { entries: out, skipped };
}

/** Key used to spot rows that were already imported or typed in by hand. */
export const dupKey = (date, amt, name) => `${date}|${r2(amt)}|${String(name).trim().toLowerCase()}`;
