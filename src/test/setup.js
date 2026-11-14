import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ ships its own (disabled-by-default) localStorage global that hides jsdom's.
// Swap in a simple in-memory one whenever the real thing isn't usable.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const m = new Map();
  const storage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
}

// jsdom doesn't do layout or scrolling.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
