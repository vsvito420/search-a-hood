// End-to-End-Smoke-Test im echten Browser.
//   npm start &   node tests/e2e/smoke.mjs [screenshot.png]
// Env: BASE_URL (default http://localhost:8080), OVERPASS_VIA_CURL=1 leitet Overpass-Anfragen
// über curl + Mirror um (nützlich hinter Proxies, die CORS-Header entfernen).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const MIRROR = process.env.OVERPASS_MIRROR || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const shot = process.argv[2];
const errors = [];

const browser = await chromium.launch(process.env.HTTPS_PROXY ? { args: [`--proxy-server=${process.env.HTTPS_PROXY}`] } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));

if (process.env.OVERPASS_VIA_CURL) {
  await page.route(/\/api\/interpreter/, async (route) => {
    const body = route.request().postData() || '';
    const data = new URLSearchParams(body).get('data');
    if (process.env.DEBUG) console.log('  overpass ←', data.slice(0, 160));
    try {
      const out = execFileSync('curl', ['-s', '-m', '90', '--data-urlencode', `data@-`, MIRROR], { input: data, maxBuffer: 256 << 20 });
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: out });
    } catch (e) {
      await route.fulfill({ status: 502, headers: { 'access-control-allow-origin': '*' }, body: String(e) });
    }
  });
}

// DOM-Klicks statt Maus-Simulation: robuster, wenn Kacheln/Netz die Seite beschäftigen.
const click = (sel) => page.locator(sel).first().evaluate((el) => el.click());

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  const r = await fn();
  console.log(r ?? 'ok');
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.searchAHood);
await page.evaluate(() => window.searchAHood.map.setView([52.4986, 13.418], 16));

await step('Preset laden', () => click('text=Bubatz-freundlich'));
await step('Analyse', async () => {
  await click('#analyze-btn');
  const tick = setInterval(async () => console.log('  …', await page.textContent('#status').catch(() => '')), 15000);
  await page.waitForFunction(() => /Zellen|fehlgeschlagen/.test(document.querySelector('#status').textContent), null, { timeout: 240_000 }).finally(() => clearInterval(tick));
  return page.textContent('#status');
});
await step('Trefferzahlen', () =>
  page.$$eval('[data-count-for]', (els) => els.filter((e) => e.textContent).map((e) => `${e.dataset.countFor}=${e.textContent}`).join(' ')),
);
await step('Top-Lage öffnen', async () => {
  await click('#top-list li');
  await page.waitForSelector('.leaflet-popup-content');
  return (await page.textContent('.leaflet-popup-content')).replace(/\s+/g, ' ').slice(0, 200);
});
if (shot) await page.waitForTimeout(1500), await page.screenshot({ path: shot });
await browser.close();

if (errors.length) {
  console.error('Seitenfehler:', errors);
  process.exit(1);
}
