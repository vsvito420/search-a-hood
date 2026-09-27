// End-to-End-Smoke-Test im echten Browser (Playwright).
//   npm start &   node tests/e2e/smoke.mjs [screenshot-prefix]
// Env: BASE_URL (default http://localhost:8080), OVERPASS_VIA_CURL=1 leitet Overpass-Anfragen
// über curl + Mirror um (nützlich hinter Proxies, die CORS-Header entfernen).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const MIRROR = process.env.OVERPASS_MIRROR || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const shot = process.argv[2];
const errors = [];

const browser = await chromium.launch(process.env.HTTPS_PROXY ? { args: [`--proxy-server=${process.env.HTTPS_PROXY}`] } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));

if (process.env.OVERPASS_VIA_CURL) {
  await page.route(/\/api\/interpreter/, async (route) => {
    const data = new URLSearchParams(route.request().postData() || '').get('data');
    if (process.env.DEBUG) console.log('  overpass ←', data.slice(0, 120));
    try {
      const out = execFileSync('curl', ['-s', '-m', '150', '--data-urlencode', 'data@-', MIRROR], { input: data, maxBuffer: 512 << 20 });
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: out });
    } catch (e) {
      await route.fulfill({ status: 502, headers: { 'access-control-allow-origin': '*' }, body: String(e) });
    }
  });
}

// DOM-Klicks statt Maus-Simulation: robuster, wenn Kacheln/Netz die Seite beschäftigen.
const click = (sel) => page.locator(sel).first().evaluate((el) => el.click());
const status = () => page.textContent('#status');
const waitStatus = (re, timeout = 300_000) =>
  page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#status').textContent), re.source, { timeout });
const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  const t0 = Date.now();
  const r = await fn();
  console.log(`${r ?? 'ok'}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
};
const snap = async (name) => shot && (await page.waitForTimeout(1200), await page.screenshot({ path: `${shot}-${name}.png` }));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.searchAHood);
await page.evaluate(() => window.searchAHood.map.setView([52.4986, 13.418], 16));

await step('Preset Informatiker', () => click('text=Informatiker'));
await step('Analyse (Luftlinie)', async () => {
  await click('#analyze-btn');
  await waitStatus(/Zellen|fehlgeschlagen/);
  return status();
});
await step('Trefferzahlen', () =>
  page.$$eval('[data-count-for]', (els) => els.filter((e) => e.textContent).map((e) => `${e.dataset.countFor}=${e.textContent}`).join(' ')),
);
await step('Top-Lage → Report', async () => {
  await click('#top-list li');
  await page.waitForSelector('.leaflet-popup-content .score');
  return (await page.textContent('.leaflet-popup-content .score')).trim();
});
await snap('1-luftlinie');

await step('Einzelansicht + relative Skala', async () => {
  await page.evaluate(() => void window.searchAHood.map.closePopup());
  await click('[data-tab="criteria"]');
  await click('.module.on .eye');
  await waitStatus(/Einzelansicht/);
  await click('#relative');
  const legend = `${await page.textContent('#legend-lo')}–${await page.textContent('#legend-hi')}`;
  const s = await status();
  await click('.module.on .eye.active');
  await waitStatus(/^(?!◉)/);
  await click('#relative');
  return `${s.split('·')[0].trim()} · Legende ${legend}`;
});

await step('Fußwege-Modus', async () => {
  await page.evaluate(() => void window.searchAHood.map.closePopup());
  await click('#dist-mode [data-mode="walk"]');
  await waitStatus(/Fußwege \(|nicht verfügbar/);
  return status();
});
await snap('2-fusswege');

await step('Kandidaten via Koordinaten', async () => {
  await click('[data-tab="candidates"]');
  await page.fill('#cand-input', '52.4990, 13.4175 | 1150 | 62 | https://example.org/1\n52.5010, 13.4230 | 890 | 48\n52.4970, 13.4120 | 1400 | 80');
  await click('#cand-add');
  await page.waitForFunction(() => document.querySelectorAll('#cand-table tbody tr').length === 3);
  return page.$$eval('#cand-table tbody tr', (rows) => rows.map((r) => r.children[2].textContent.trim()).join(' | '));
});
await snap('3-kandidaten');

await step('Isochrone', async () => {
  await page.evaluate(() => {
    const { map } = window.searchAHood;
    map.fire('click', { latlng: L.latLng(52.4986, 13.418), originalEvent: new MouseEvent('click') });
  });
  await click('[data-act="iso"]');
  await waitStatus(/Isochrone:|nicht verfügbar|Kein Weg/);
  return status();
});
await snap('4-isochrone');

await step('Steckbrief', async () => {
  await page.evaluate(() => {
    const { map } = window.searchAHood;
    map.fire('click', { latlng: L.latLng(52.4990, 13.4175), originalEvent: new MouseEvent('click') });
  });
  const [report] = await Promise.all([ctx.waitForEvent('page'), click('[data-act="report"]')]);
  await report.waitForLoadState('domcontentloaded');
  const txt = `${await report.textContent('.score')} · ${await report.locator('tbody tr').count()} Kriterien`;
  if (shot) await report.screenshot({ path: `${shot}-5-steckbrief.png`, fullPage: true });
  await report.close();
  return txt.replace(/\s+/g, ' ');
});

await step('Mind. 3 Supermärkte', async () => {
  await page.evaluate(() => void window.searchAHood.map.closePopup());
  await click('[data-tab="criteria"]');
  const card = page.locator('.module.on', { hasText: 'Supermarkt' });
  await card.locator('[data-k="minCount"]').fill('3');
  await card.locator('[data-k="minCount"]').dispatchEvent('change');
  await page.waitForTimeout(800);
  const s = await status();
  await card.locator('[data-k="minCount"]').fill('1');
  await card.locator('[data-k="minCount"]').dispatchEvent('change');
  return s.split('·').slice(0, 2).join('·').trim();
});

await step('Wochen-Zeitraffer', async () => {
  await click('#timeline-btn');
  const times = [];
  for (const h of [3, 27, 99, 123]) {
    const t0 = Date.now();
    await page.$eval('#tl-range', (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input'));
    }, h);
    await page.waitForFunction((lbl) => document.querySelector('#tl-label').textContent === lbl, ['Mo 03:00', 'Di 03:00', 'Fr 03:00', 'Sa 03:00'][times.length]);
    await page.waitForTimeout(50);
    const spaeti = await page.textContent('[data-count-for="spaeti"]');
    times.push(`${await page.textContent('#tl-label')}: Späti ${spaeti} (${Date.now() - t0} ms)`);
  }
  await snap('6-zeitraffer');
  await click('#tl-close');
  return times.join(' | ');
});

await step('Befehlspalette', async () => {
  await page.keyboard.press('Control+K');
  await page.fill('#palette-input', 'bubatz');
  return page.textContent('#palette-list li.sel');
});
await page.keyboard.press('Escape');

await step('Permalink', async () => {
  await click('[data-tab="dev"]');
  await click('#permalink-btn');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  return `${link.length} Zeichen`;
});

await browser.close();
if (errors.length) {
  console.error('Seitenfehler:', errors);
  process.exit(1);
}
console.log('✔ E2E ok');
