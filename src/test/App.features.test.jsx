import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../App.jsx';
import { KEY } from '../data.js';
import { todayStr, weekKey } from '../utils.js';

const region = (name) => within(screen.getByRole('region', { name }));
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const saved = () => JSON.parse(localStorage.getItem(KEY));
const change = (el, value) => fireEvent.change(el, { target: { value } });

function addExpense(name, amt, extra = {}) {
  change(screen.getByLabelText('What did you buy?'), name);
  change(document.getElementById('amt'), String(amt));
  if (extra.cat) change(document.getElementById('cat'), extra.cat);
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
}

function addWallet(name, opening) {
  tab('Money');
  const w = region('Wallets');
  change(w.getByLabelText('Wallet name'), name);
  change(w.getByLabelText(/Starting balance/), String(opening));
  fireEvent.click(w.getByRole('button', { name: 'Add wallet' }));
}

describe('new features', () => {
  it('tracks wallet balances from expenses, income and transfers', () => {
    render(<App />);
    addWallet('GCash', 1000);
    addWallet('Cash', 0);
    tab('Expenses');
    change(document.getElementById('wallet'), saved().wallets[0].id);
    addExpense('Lunch', 200);
    expect(screen.getByText(/Money on hand: ₱800\.00/)).toBeTruthy();
    expect(screen.getByText(/· GCash/)).toBeTruthy();

    tab('Money');
    const w = region('Wallets');
    change(w.getByLabelText(/^Amount/), '300');
    fireEvent.click(w.getByRole('button', { name: 'Move money' }));
    expect(w.getByText('₱500.00')).toBeTruthy();
    expect(w.getByText('₱300.00')).toBeTruthy();

    const inc = region('Income');
    change(inc.getByLabelText('Where’s it from?'), 'Allowance');
    change(inc.getByLabelText(/^Amount/), '1500');
    change(inc.getByLabelText('Received in'), saved().wallets[1].id);
    fireEvent.click(inc.getByRole('button', { name: 'Add income' }));
    expect(w.getByText('₱1,800.00')).toBeTruthy();
    tab('Expenses');
    expect(screen.getByText(/Income this week: ₱1,500\.00/)).toBeTruthy();
  });

  it('repeats weekly income', () => {
    render(<App />);
    tab('Money');
    const inc = region('Income');
    change(inc.getByLabelText('Where’s it from?'), 'Allowance');
    change(inc.getByLabelText(/^Amount/), '1000');
    fireEvent.click(inc.getByLabelText('Every week'));
    fireEvent.click(inc.getByRole('button', { name: 'Add income' }));
    tab('Expenses');
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText(/Income this week: ₱1,000\.00/)).toBeTruthy();
  });

  it('warns before and after going over a category limit', () => {
    render(<App />);
    const lim = region('Category limits');
    fireEvent.click(lim.getByRole('button', { name: 'Set limits' }));
    change(lim.getByLabelText(/^Food/), '100');
    fireEvent.click(lim.getByRole('button', { name: 'Save limits' }));
    change(screen.getByLabelText('What did you buy?'), 'Pizza');
    change(document.getElementById('amt'), '150');
    expect(screen.getByText(/This puts Food over its ₱100\.00 limit/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByText(/Over the limit: Food \(₱150\.00 of ₱100\.00\)/)).toBeTruthy();
    expect(lim.getByText('Over by ₱50.00')).toBeTruthy();
  });

  it('plans a savings goal', () => {
    render(<App />);
    tab('Money');
    const g = region('Savings goals');
    change(g.getByLabelText('What are you saving for?'), 'Phone');
    change(g.getByLabelText(/^Target \(/), '1000');
    fireEvent.click(g.getByRole('button', { name: 'Add goal' }));
    fireEvent.click(g.getByRole('button', { name: 'Add money' }));
    change(g.getByLabelText(/Amount saved/), '250');
    fireEvent.click(g.getByRole('button', { name: 'Add to goal' }));
    expect(g.getByText('Saved ₱250.00 of ₱1,000.00')).toBeTruthy();
    expect(saved().goals[0].contributions[0].amt).toBe(250);
  });

  it('shows a bill on the week it’s due and records it as paid', () => {
    render(<App />);
    tab('Money');
    const b = region('Bills');
    change(b.getByLabelText('Bill'), 'Meralco');
    change(b.getByLabelText(/^Amount/), '2300');
    change(b.getByLabelText('Next due date'), todayStr());
    fireEvent.click(b.getByRole('button', { name: 'Add bill' }));
    tab('Expenses');
    const due = region('Bills due');
    fireEvent.click(due.getByRole('button', { name: /Mark Meralco/ }));
    expect(due.getByText('✓ Paid')).toBeTruthy();
    expect(region('Expenses').getByText('Meralco')).toBeTruthy();
    expect(saved().weeks[weekKey(new Date())].items[0]).toMatchObject({ amt: 2300, cat: 'Bills', billDue: todayStr() });
  });

  it('imports a CSV statement, skipping rows already added, and can undo it', async () => {
    render(<App />);
    addExpense('Jollibee', 250);
    const today = todayStr();
    const csv = `Date,Description,Amount\n${today},Jollibee,-250.00\n${today},GrabFood,-180\n${today},Cash in,500\n`;
    tab('Backup');
    const card = region('Import a statement');
    fireEvent.change(card.getByLabelText('Choose a .csv file'), {
      target: { files: [new File([csv], 'gcash.csv', { type: 'text/csv' })] },
    });
    expect(await card.findByText(/Found 3 transactions/)).toBeTruthy();
    expect(card.getByText(/already added\?/)).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Import 2 transactions' }));
    const wk = saved().weeks[weekKey(new Date())];
    expect(wk.items.map((i) => [i.name, i.cat])).toEqual([
      ['Jollibee', 'Food'],
      ['GrabFood', 'Food'],
    ]);
    expect(wk.income[0]).toMatchObject({ name: 'Cash in', amt: 500 });
    expect(saved().csvPrefs).toMatchObject({ date: 'Date', desc: 'Description', amount: 'Amount' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(saved().weeks[weekKey(new Date())].items).toHaveLength(1);
  });

  it('shows spending trends as a chart or a table, and the year in review', () => {
    render(<App />);
    addExpense('Rice', 300);
    addExpense('Bus', 50, { cat: 'Transport' });
    tab('Reports');
    const t = region('Spending trends');
    expect(t.getByRole('group', { name: /last 12 weeks/ })).toBeTruthy();
    expect(within(t.getByRole('list', { name: 'Categories' })).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(t.getByRole('button', { name: '8 weeks' }));
    fireEvent.click(t.getByRole('button', { name: 'Show as table' }));
    expect(t.getAllByRole('row')).toHaveLength(9);
    const y = region('Year in review');
    expect(y.getByText(/Biggest expense: Rice/)).toBeTruthy();
  });

  it('offers install instructions', () => {
    render(<App />);
    tab('Backup');
    expect(region('Install the app').getByText(/install icon in the address bar/)).toBeTruthy();
  });
});
