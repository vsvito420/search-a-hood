import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenLite, parseOpeningHours } from '../src/core/oh-lite.js';

// 2026-09-28 ist ein Montag
const at = (day, hh, mm = 0) => new Date(2026, 8, 28 + ((day + 6) % 7), hh, mm);
const [SU, MO, TU, WE, TH, FR, SA] = [0, 1, 2, 3, 4, 5, 6];

test('Hilfsfunktion at() liefert den richtigen Wochentag', () => {
  for (const d of [SU, MO, TU, WE, TH, FR, SA]) assert.equal(at(d, 12).getDay(), d);
});

test('Standard-Ladenöffnung', () => {
  const v = 'Mo-Fr 08:00-20:00; Sa 09:00-18:00; Su off';
  assert.equal(isOpenLite(v, at(MO, 7, 59)), false);
  assert.equal(isOpenLite(v, at(MO, 8)), true);
  assert.equal(isOpenLite(v, at(FR, 19, 59)), true);
  assert.equal(isOpenLite(v, at(FR, 20)), false);
  assert.equal(isOpenLite(v, at(SA, 17)), true);
  assert.equal(isOpenLite(v, at(SU, 12)), false);
});

test('Späti über Mitternacht, Wochenende länger', () => {
  const v = 'Mo-Th 10:00-01:00; Fr-Sa 10:00-04:00; Su 12:00-00:00';
  assert.equal(isOpenLite(v, at(TU, 0, 30)), true, 'Mo-Nacht läuft in den Di');
  assert.equal(isOpenLite(v, at(SA, 3, 30)), true, 'Fr-Nacht läuft in den Sa');
  assert.equal(isOpenLite(v, at(SU, 3, 30)), true, 'Sa-Nacht läuft in den So');
  assert.equal(isOpenLite(v, at(SU, 5)), false);
  assert.equal(isOpenLite(v, at(SU, 23, 59)), true);
  assert.equal(isOpenLite(v, at(MO, 0, 30)), false, 'So endet um 00:00');
});

test('Mittagspause, Tageslisten, Wraparound Sa-Mo', () => {
  const v = 'Mo,We,Fr 09:00-12:00,14:00-18:00; Sa-Mo 10:00-11:00';
  assert.equal(isOpenLite(v, at(WE, 13)), false);
  assert.equal(isOpenLite(v, at(WE, 15)), true);
  assert.equal(isOpenLite(v, at(MO, 9, 30)), false, 'spätere Regel Sa-Mo überschreibt Mo');
  assert.equal(isOpenLite(v, at(SU, 10, 30)), true);
});

test('Spätere Regel überschreibt, Komma ergänzt', () => {
  assert.equal(isOpenLite('Mo-Fr 08:00-20:00; We 08:00-12:00', at(WE, 15)), false);
  assert.equal(isOpenLite('Mo-Fr 08:00-12:00, We 14:00-18:00', at(WE, 15)), true);
  assert.equal(isOpenLite('Mo-Fr 08:00-12:00, We 14:00-18:00', at(WE, 10)), true);
});

test('Sonderfälle', () => {
  assert.equal(isOpenLite('24/7', at(SU, 3)), true);
  assert.equal(isOpenLite('08:00-22:00', at(SU, 21)), true, 'ohne Tage = täglich');
  assert.equal(isOpenLite('Mo-Sa', at(SA, 23)), true, 'ohne Zeit = ganztags');
  assert.equal(isOpenLite('Fr 18:00+', at(FR, 23)), true);
  assert.equal(isOpenLite('Mo-Su 00:00-24:00', at(TH, 23, 59)), true);
  assert.equal(isOpenLite('Mo-Fr 09:00-18:00; PH off', at(MO, 10)), true, 'PH ignoriert');
  assert.equal(isOpenLite('Mo-Fr 09:00-18:00 "nach Vereinbarung"', at(MO, 10)), true);
});

test('Unbekanntes → null statt falscher Antwort', () => {
  for (const v of ['Jan-Mar Mo-Fr 08:00-12:00', 'sunrise-sunset', 'Mo[1] 10:00-12:00', 'week 1-26 Mo 08:00-10:00', 'nach Absprache', '']) {
    assert.equal(parseOpeningHours(v), null, v);
    assert.equal(isOpenLite(v, at(MO, 10)), null, v);
  }
});
