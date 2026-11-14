import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../App.jsx';
import { KEY } from '../data.js';
import { weekKey, addDays } from '../utils.js';

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const stat = (name) => within(screen.getByRole('region', { name: 'Summary' })).getByText(name).nextSibling.textContent;
const saved = () => JSON.parse(localStorage.getItem(KEY));

function addExpense(name, amt) {
  type('What did you buy?', name);
  fireEvent.change(document.getElementById('amt'), { target: { value: String(amt) } });
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
}

describe('App', () => {
  it('adds expenses, updates the totals and saves', () => {
    render(<App />);
    type(/Budget for this week/, '1000');
    addExpense('Rice', 0.1);
    addExpense('Eggs', 0.2);
    expect(stat('Spent')).toMatch(/₱0\.30/);
    expect(stat('Remaining')).toMatch(/₱999\.70/);
    const wk = saved().weeks[weekKey(new Date())];
    expect(wk.budget).toBe(1000);
    expect(wk.items.map((i) => i.name)).toEqual(['Rice', 'Eggs']);
  });

  it('shows a message instead of silently ignoring a bad expense', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByText('Add a name for this expense.')).toBeTruthy();
    expect(screen.getByLabelText('What did you buy?').getAttribute('aria-invalid')).toBe('true');
  });

  it('can undo a delete', () => {
    render(<App />);
    addExpense('Coffee', 120);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Coffee' }));
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText('Deleted “Coffee”.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Coffee')).toBeTruthy();
  });

  it('can undo clearing the week, and the button lives on the Expenses tab', () => {
    render(<App />);
    addExpense('Apples', 1);
    addExpense('Bananas', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Clear week' }));
    expect(screen.getByText('No expenses yet for this week.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Apples')).toBeTruthy();
    expect(screen.getByText('Bananas')).toBeTruthy();
  });

  it('edits an expense', () => {
    render(<App />);
    addExpense('Taxi', 200);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Taxi' }));
    fireEvent.change(document.getElementById('edit-name'), { target: { value: 'Grab' } });
    fireEvent.change(document.getElementById('edit-amt'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByText('Taxi')).toBeNull();
    expect(screen.getByText('Grab')).toBeTruthy();
    expect(stat('Spent')).toMatch(/₱250\.00/);
  });

  it('repeats an expense every week from now on', () => {
    render(<App />);
    type('What did you buy?', 'Netflix');
    fireEvent.change(document.getElementById('amt'), { target: { value: '549' } });
    fireEvent.click(screen.getByLabelText('Repeat every week'));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getAllByText('Netflix').length).toBeGreaterThan(0);
    expect(saved().weeks[weekKey(addDays(new Date(), 7))].items[0].name).toBe('Netflix');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText('No expenses yet for this week.')).toBeTruthy();
  });

  it('links a debt payment and keeps the balance right', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Debt' }));
    fireEvent.change(screen.getByLabelText('Who did you borrow from?'), { target: { value: 'Mom' } });
    fireEvent.change(screen.getByLabelText('What was it for?'), { target: { value: 'Rent' } });
    fireEvent.change(screen.getByLabelText(/Amount borrowed/), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add debt' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
    fireEvent.change(screen.getByLabelText('This pays off a debt (optional)'), { target: { value: saved().debts[0].id } });
    fireEvent.change(document.getElementById('amt'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(screen.getByText('Payment to Mom')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Debt' }));
    expect(screen.getByText('₱700.00 left')).toBeTruthy();
  });

  it('records a partial repayment from someone who owes you', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Debt' }));
    fireEvent.change(screen.getByLabelText('Who owes you?'), { target: { value: 'Mark' } });
    fireEvent.change(within(screen.getByRole('region', { name: 'Money owed to me' })).getByLabelText(/^Amount \(/), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a payment' }));
    fireEvent.change(screen.getByLabelText(/Amount paid back/), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    expect(screen.getByText(/Paid back ₱200\.00 of ₱500\.00 · ₱300\.00 to go/)).toBeTruthy();
    expect(saved().owed[0].payments[0].amt).toBe(200);
  });

  it('moves between tabs with arrow, Home and End keys, and every tab has a panel', () => {
    render(<App />);
    const list = screen.getByRole('tablist');
    for (const t of screen.getAllByRole('tab')) expect(document.getElementById(t.getAttribute('aria-controls'))).toBeTruthy();
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Backup' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Expenses' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Expenses' }).getAttribute('aria-selected')).toBe('true');
  });

  it('warns, and keeps the old copy, when saved data is unreadable', () => {
    localStorage.setItem(KEY, '{broken');
    render(<App />);
    expect(screen.getByText(/couldn’t be read/)).toBeTruthy();
    const kept = Object.keys(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), 1]))).filter(
      (k) => k.includes(':backup:unreadable'),
    );
    expect(kept).toHaveLength(1);
  });

  it('carries leftover budget into the next week when turned on', () => {
    render(<App />);
    type(/Budget for this week/, '1000');
    addExpense('Food', 400);
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    fireEvent.click(screen.getByLabelText(/Carry each week’s leftover/));
    fireEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    type(/Budget for this week/, '1000');
    expect(screen.getByText(/\+ ₱600\.00 left over from last week/)).toBeTruthy();
    expect(stat('Remaining')).toMatch(/₱1,600\.00/);
  });

  it('switches currency', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Backup' }));
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    expect(screen.getByLabelText(/Budget for this week \(\$\)/)).toBeTruthy();
  });

  it('finds expenses across weeks', () => {
    render(<App />);
    addExpense('Jollibee', 150);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    addExpense('Jollibee again', 99);
    addExpense('Bus', 20);
    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    fireEvent.change(screen.getByLabelText('Search by name or lender'), { target: { value: 'jolli' } });
    expect(screen.getByText(/2 expenses found, totalling ₱249\.00/)).toBeTruthy();
  });
});
