// localStorage-Wrapper: darf fehlschlagen (Private Mode, blockierte Cookies) – dann eben ohne Persistenz.
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`sah:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sah:${key}`, JSON.stringify(value));
    } catch {
      /* egal */
    }
  },
};
