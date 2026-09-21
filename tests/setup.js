// Preloaded via `node --test --import ./tests/setup.js`: the core modules
// under test use the browser's global `localStorage`, which Node doesn't
// provide. This is a plain in-memory stand-in, good enough for unit tests.
class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
  clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
