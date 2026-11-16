// Install before importing the normal game. Its settings and telemetry receive
// this page's empty, in-memory storage; the browser's real storage is never read or written.
export function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return [...data.keys()][i] ?? null; },
    getItem(key) { return data.get(String(key)) ?? null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); },
  };
}

export function installTemporaryStorage(target = globalThis) {
  for (const key of ['localStorage', 'sessionStorage']) {
    const store = memoryStorage();
    Object.defineProperty(target, key, { configurable: true, get: () => store });
  }
}
