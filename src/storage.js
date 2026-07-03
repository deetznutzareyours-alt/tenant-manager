// Polyfills window.storage using the browser's localStorage, matching the
// { get, set, delete, list } shape App.jsx already calls. App.jsx itself
// needs ZERO changes — this file is the only thing that makes it work
// outside the Claude artifact sandbox.
//
// LIMITATION: localStorage is per-browser, per-device, ~5-10MB total, and is
// wiped if the user clears site data. There is no cloud backup and no sync
// across devices. Fine for a single-device MVP; not fine as the long-term
// system of record for a lending business.

const DB_KEY = 'tenant-mgmt::db';

function readAll() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeAll(store) {
  localStorage.setItem(DB_KEY, JSON.stringify(store));
}

const storage = {
  async get(key) {
    const store = readAll();
    if (!(key in store)) throw new Error('key not found: ' + key);
    return { key, value: store[key] };
  },
  async set(key, value) {
    const store = readAll();
    store[key] = value;
    writeAll(store);
    return { key, value };
  },
  async delete(key) {
    const store = readAll();
    const existed = key in store;
    delete store[key];
    writeAll(store);
    return { key, deleted: existed };
  },
  async list(prefix) {
    const store = readAll();
    const keys = Object.keys(store).filter((k) => !prefix || k.startsWith(prefix));
    return { keys };
  },
};

if (typeof window !== 'undefined') {
  window.storage = storage;
}

export default storage;
