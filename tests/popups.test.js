import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportPopup, poiPopup, fmtValue, esc } from '../src/ui/popups.js';
import { buildReportHtml } from '../src/ui/report.js';

const mod = (over = {}) => ({ id: 'spaeti', name: 'Späti', category: 'X', unit: 'm', geometry: 'point', ...over });
const part = (module, over = {}) => ({
  module,
  settings: { mode: 'near', distance: 400, weight: 1, required: false, minCount: 1 },
  hit: { item: { tags: { name: '<b>Späti</b>', opening_hours: 'Mo-Su 10:00-02:00' }, lat: 1, lon: 1 }, dist: 123 },
  dist: 123,
  score: 1,
  satisfied: true,
  weight: 1,
  required: false,
  ...over,
});

test('reportPopup: Meter- und Minuten-Module, Escaping, Erklärung', () => {
  const target = mod({ id: 'target-a', name: '🚆 Arbeit', unit: 'min' });
  const html = reportPopup(
    {
      score: 0.8,
      parts: [part(mod()), part(target, { dist: 31, score: 0.45, satisfied: false, settings: { mode: 'near', distance: 25, weight: 2 } })],
    },
    { lat: 52.5, lng: 13.4 },
    { walk: true },
  );
  assert.match(html, /80 %/);
  assert.match(html, /123 m \(2 min\)/);
  assert.match(html, /31 min/);
  assert.match(html, /≤ 25 min/);
  assert.match(html, /Abzug:/);
  assert.ok(!html.includes('<b>Späti</b>'), 'OSM-Namen werden escaped');
});

test('reportPopup: Pflicht verletzt', () => {
  const html = reportPopup({ score: null, parts: [part(mod(), { required: true, satisfied: false, hit: null, dist: Infinity, score: 0 })] }, { lat: 0, lng: 0 });
  assert.match(html, /Ausgeschlossen durch: Späti/);
});

test('poiPopup + fmtValue + esc', () => {
  const html = poiPopup(mod(), { type: 'node', id: 5, tags: { name: 'A&B', opening_hours: '24/7', website: 'javascript:alert(1)' } }, new Date());
  assert.match(html, /A&amp;B/);
  assert.match(html, /node\/5/);
  assert.ok(!/javascript:/i.test(html), 'keine javascript:-Links aus OSM-Tags');
  assert.equal(fmtValue({ unit: 'min' }, 12.4), '12 min');
  assert.equal(fmtValue({ unit: 'm' }, 1234), '1.2 km');
  assert.equal(esc('"<x>'), '&quot;&lt;x&gt;');
});

test('Steckbrief-HTML', () => {
  const layers = new Map([['spaeti', { module: mod(), settings: {}, elements: [{ type: 'node', id: 1, lat: 52.5, lon: 13.4, tags: {} }] }]]);
  const html = buildReportHtml(
    { label: 'Teststr. 1', lat: 52.5, lon: 13.4, rent: 1000, size: 50 },
    { score: 1, parts: [part(mod())] },
    layers,
    { time: new Date(2026, 8, 28, 23), distMode: 'air' },
  );
  assert.match(html, /<!doctype html>/);
  assert.match(html, /20\.00 €\/m²/);
  assert.match(html, /Alle Kriterien voll erfüllt/);
  const evil = buildReportHtml({ label: 'x', lat: 0, lon: 0, url: 'javascript:alert(1)' }, { score: 1, parts: [] }, new Map(), { time: new Date(), distMode: 'air' });
  assert.ok(!/javascript:/i.test(evil));
});
