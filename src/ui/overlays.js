/* global L */
import { esc } from './popups.js';

/**
 * Overlay-Verwaltung: WMS-Dienste (Behörden-Geodaten) und XYZ-Kacheln über die Karte legen.
 * WMS-Layer lassen sich live per GetCapabilities auflisten und per GetFeatureInfo am Klickpunkt abfragen.
 */
export const BUILTIN_OVERLAYS = [
  {
    id: 'breitbandatlas',
    name: 'Breitbandatlas (BNetzA)',
    type: 'wms',
    url: 'https://wms.prod.k8s.gigabit-grundbuch.online/WMS/Breitbandatlas_v2',
    layers: '',
    description:
      'Offizielle Breitband- & Mobilfunkversorgung (Gigabit-Grundbuch). „Layer abrufen“ klicken und z. B. einen FTTH/1000-Mbit-Layer wählen. Klick auf die Karte fragt die Versorgung am Punkt ab.',
    attribution: '© Bundesnetzagentur / Gigabit-Grundbuch',
    featureInfo: true,
  },
  {
    id: 'basemapde',
    name: 'basemap.de (BKG) grau',
    type: 'wms',
    url: 'https://sgx.geodatenzentrum.de/wms_basemapde',
    layers: 'de_basemapde_web_raster_grau',
    description: 'Amtliche Grundkarte – gut als ruhiger Hintergrund für die Heatmap.',
    attribution: '© GeoBasis-DE / BKG',
  },
  {
    id: 'openrailwaymap',
    name: 'OpenRailwayMap',
    type: 'xyz',
    url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    description: 'Gleise, Bahnhöfe, Güterstrecken – wo es nachts rumpeln könnte.',
    attribution: '© OpenRailwayMap (CC-BY-SA)',
  },
];

/** Liest die Layer aus einem WMS-GetCapabilities-Dokument (nur benannte Layer). */
export function parseCapabilities(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Kein gültiges XML');
  const out = [];
  for (const layer of doc.getElementsByTagName('Layer')) {
    const name = [...layer.children].find((c) => c.localName === 'Name')?.textContent?.trim();
    const title = [...layer.children].find((c) => c.localName === 'Title')?.textContent?.trim();
    const queryable = layer.getAttribute('queryable') === '1';
    if (name) out.push({ name, title: title || name, queryable });
  }
  return out;
}

const capsUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities`;

export class OverlayManager {
  /**
   * @param {L.Map} map
   * @param {{get:Function,set:Function}} store
   * @param {(msg:string, err?:boolean)=>void} setStatus
   */
  constructor(map, store, setStatus) {
    this.map = map;
    this.store = store;
    this.setStatus = setStatus;
    this.custom = store.get('overlays:custom', []);
    this.state = store.get('overlays:state', {}); // id -> {on, opacity, layers}
    this.leaflet = new Map();
  }

  get all() {
    return [...BUILTIN_OVERLAYS, ...this.custom.map((o) => ({ ...o, custom: true }))];
  }

  #save() {
    this.store.set('overlays:custom', this.custom);
    this.store.set('overlays:state', this.state);
  }

  #cfg(o) {
    return (this.state[o.id] ||= { on: false, opacity: 0.6, layers: o.layers || '' });
  }

  enable(id, on = true) {
    const o = this.all.find((x) => x.id === id);
    if (!o) return;
    this.#cfg(o).on = on;
    this.#save();
    this.#apply(o);
  }

  #apply(o) {
    const cfg = this.#cfg(o);
    this.leaflet.get(o.id)?.remove();
    this.leaflet.delete(o.id);
    if (!cfg.on) return;
    if (o.type === 'wms' && !cfg.layers) {
      this.setStatus(`${o.name}: erst „Layer abrufen“ und einen Layer wählen.`, true);
      return;
    }
    const layer =
      o.type === 'wms'
        ? L.tileLayer.wms(o.url, {
            layers: cfg.layers,
            format: 'image/png',
            transparent: true,
            version: '1.3.0',
            opacity: cfg.opacity,
            attribution: o.attribution,
            maxZoom: 20,
          })
        : L.tileLayer(o.url, { opacity: cfg.opacity, attribution: o.attribution, maxZoom: 19 });
    layer.on('tileerror', () => this.setStatus(`${o.name}: Kacheln konnten nicht geladen werden.`, true));
    layer.addTo(this.map);
    this.leaflet.set(o.id, layer);
  }

  applyAll() {
    for (const o of this.all) this.#apply(o);
  }

  async fetchLayers(o) {
    const res = await fetch(capsUrl(o.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseCapabilities(await res.text());
  }

  /**
   * GetFeatureInfo für alle aktiven, abfragbaren WMS-Overlays am Punkt.
   * @returns {Promise<{name:string, html:string}[]>}
   */
  async featureInfo(latlng) {
    const out = [];
    for (const o of this.all) {
      const cfg = this.#cfg(o);
      if (!cfg.on || o.type !== 'wms' || !cfg.layers || !(o.featureInfo || o.custom)) continue;
      const size = this.map.getSize();
      const b = this.map.getBounds();
      const sw = L.CRS.EPSG3857.project(b.getSouthWest());
      const ne = L.CRS.EPSG3857.project(b.getNorthEast());
      const pt = this.map.latLngToContainerPoint(latlng).round();
      const params = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.3.0',
        REQUEST: 'GetFeatureInfo',
        LAYERS: cfg.layers,
        QUERY_LAYERS: cfg.layers,
        CRS: 'EPSG:3857',
        BBOX: [sw.x, sw.y, ne.x, ne.y].join(','),
        WIDTH: size.x,
        HEIGHT: size.y,
        I: pt.x,
        J: pt.y,
        INFO_FORMAT: 'text/plain',
        FEATURE_COUNT: '5',
      });
      try {
        const res = await fetch(`${o.url}${o.url.includes('?') ? '&' : '?'}${params}`, { signal: AbortSignal.timeout(10_000) });
        const text = (await res.text()).trim();
        if (res.ok && text && !/ServiceException/.test(text)) {
          out.push({ name: o.name, html: `<pre class="fi">${esc(text.slice(0, 1500))}</pre>` });
        }
      } catch (e) {
        out.push({ name: o.name, html: `<small>Abfrage nicht möglich (${esc(e.message)}) – evtl. CORS-gesperrt.</small>` });
      }
    }
    return out;
  }

  addCustom({ name, url, layers, type }) {
    const id = `ov-${Date.now().toString(36)}`;
    this.custom.push({ id, name, url, layers, type, attribution: new URL(url.replace('{s}', 'a')).host });
    this.state[id] = { on: true, opacity: 0.6, layers };
    this.#save();
    return id;
  }

  remove(id) {
    this.leaflet.get(id)?.remove();
    this.leaflet.delete(id);
    this.custom = this.custom.filter((o) => o.id !== id);
    delete this.state[id];
    this.#save();
  }

  /** Zeichnet die Overlay-Liste. */
  render(root) {
    root.innerHTML = '';
    for (const o of this.all) {
      const cfg = this.#cfg(o);
      const el = document.createElement('div');
      el.className = `module${cfg.on ? ' on' : ''}`;
      el.style.setProperty('--mcolor', '#546e7a');
      el.innerHTML = `
        <div class="head">
          <label><input type="checkbox" ${cfg.on ? 'checked' : ''} data-a="on" /><span>${esc(o.name)}</span></label>
          <small class="count">${o.type.toUpperCase()}</small>
          ${o.custom ? '<button class="del" type="button" title="Entfernen" data-a="del">✕</button>' : ''}
        </div>
        <div class="opts">
          ${o.description ? `<p class="desc">${esc(o.description)}</p>` : ''}
          <label>Deckkraft <input type="range" min="0.1" max="1" step="0.05" value="${cfg.opacity}" data-a="opacity" /></label>
          ${
            o.type === 'wms'
              ? `<label class="grow">Layer <input type="text" value="${esc(cfg.layers)}" placeholder="layer1,layer2" data-a="layers" /></label>
                 <button type="button" data-a="caps">Layer abrufen</button>
                 <select data-a="pick" hidden></select>`
              : ''
          }
        </div>`;
      const q = (a) => el.querySelector(`[data-a="${a}"]`);
      q('on').addEventListener('change', (e) => {
        cfg.on = e.target.checked;
        el.classList.toggle('on', cfg.on);
        this.#save();
        this.#apply(o);
      });
      q('opacity').addEventListener('input', (e) => {
        cfg.opacity = +e.target.value;
        this.leaflet.get(o.id)?.setOpacity(cfg.opacity);
        this.#save();
      });
      q('del')?.addEventListener('click', () => {
        this.remove(o.id);
        this.render(root);
      });
      if (o.type === 'wms') {
        const setLayers = (v) => {
          cfg.layers = v.trim();
          q('layers').value = cfg.layers;
          this.#save();
          this.#apply(o);
        };
        q('layers').addEventListener('change', (e) => setLayers(e.target.value));
        q('caps').addEventListener('click', async () => {
          this.setStatus(`Lade Layer von ${o.name} …`);
          try {
            const list = await this.fetchLayers(o);
            const sel = q('pick');
            sel.innerHTML = `<option value="">– ${list.length} Layer –</option>${list
              .map((l) => `<option value="${esc(l.name)}">${esc(l.title)}${l.queryable ? ' ⓘ' : ''}</option>`)
              .join('')}`;
            sel.hidden = false;
            sel.onchange = () => sel.value && setLayers(sel.value);
            this.setStatus(`${list.length} Layer gefunden. ⓘ = am Punkt abfragbar.`);
          } catch (e) {
            this.setStatus(`GetCapabilities fehlgeschlagen (${e.message}). Layer-Namen ggf. manuell eintragen.`, true);
          }
        });
      }
      root.append(el);
    }
  }
}
