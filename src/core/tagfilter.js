// Parser + Matcher für Overpass-QL-Tag-Filter, damit eine kombinierte Abfrage
// lokal wieder auf die einzelnen Module verteilt werden kann.
//
// Unterstützt:  [k]  [!k]  [k=v]  [k!=v]  [k~"re"]  [k!~"re"]  [k~"re",i]  ["k:x"="v w"]
// Mehrere Klauseln hintereinander werden UND-verknüpft: [a=b][c~"d"]

const CLAUSE = /\[\s*(!)?\s*("(?:[^"\\]|\\.)*"|[^\]=!~\s"]+)\s*(?:(!=|!~|=|~)\s*("(?:[^"\\]|\\.)*"|[^\],\s"]+)\s*(,\s*i)?)?\s*\]/y;

const unquote = (s) => (s.startsWith('"') ? JSON.parse(s) : s);

/**
 * @param {string} selector z. B. '[highway~"^(motorway|trunk)$"][access!=private]'
 * @returns {{key:string, op:string, value?:string|RegExp}[]}
 */
export function parseSelector(selector) {
  const s = selector.trim();
  const clauses = [];
  CLAUSE.lastIndex = 0;
  let pos = 0;
  while (pos < s.length) {
    CLAUSE.lastIndex = pos;
    const m = CLAUSE.exec(s);
    if (!m) throw new SyntaxError(`Ungültiger Tag-Filter bei Zeichen ${pos}: ${s}`);
    const [, neg, rawKey, op, rawVal, ci] = m;
    const key = unquote(rawKey);
    if (neg && op) throw new SyntaxError(`"!" nur ohne Wert erlaubt: ${m[0]}`);
    if (!op) clauses.push({ key, op: neg ? 'absent' : 'present' });
    else {
      const value = unquote(rawVal);
      const isRe = op === '~' || op === '!~';
      clauses.push({ key, op, value: isRe ? new RegExp(value, ci ? 'i' : '') : value });
    }
    pos = CLAUSE.lastIndex;
    while (s[pos] === ' ') pos++;
  }
  if (!clauses.length) throw new SyntaxError(`Leerer Tag-Filter: ${selector}`);
  return clauses;
}

/** Prüft Tags gegen geparste Klauseln (Overpass-Semantik: "!=" und "!~" matchen auch fehlende Keys). */
export function matchClauses(tags, clauses) {
  for (const c of clauses) {
    const v = tags[c.key];
    switch (c.op) {
      case 'present':
        if (v === undefined) return false;
        break;
      case 'absent':
        if (v !== undefined) return false;
        break;
      case '=':
        if (v !== c.value) return false;
        break;
      case '!=':
        if (v === c.value) return false;
        break;
      case '~':
        if (v === undefined || !c.value.test(v)) return false;
        break;
      case '!~':
        if (v !== undefined && c.value.test(v)) return false;
        break;
    }
  }
  return true;
}

const cache = new Map();

/** Kompiliert (mit Cache) eine Liste von Selektoren zu einer ODER-Funktion. */
export function compileSelectors(selectors) {
  const key = selectors.join('\u0000');
  let fn = cache.get(key);
  if (!fn) {
    const parsed = selectors.map(parseSelector);
    fn = (tags) => parsed.some((cl) => matchClauses(tags || {}, cl));
    cache.set(key, fn);
  }
  return fn;
}

/** true, wenn der Selektor gültig ist – für Eingaben aus der UI. */
export function isValidSelector(selector) {
  try {
    parseSelector(selector);
    return true;
  } catch {
    return false;
  }
}
