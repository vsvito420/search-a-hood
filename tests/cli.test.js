import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cli = (...args) => spawnSync(process.execPath, ['bin/search-a-hood.mjs', ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

test('CLI: help, modules, presets', () => {
  assert.match(cli('--help').stdout, /score <adresse\|lat,lon>/);
  assert.match(cli('modules').stdout, /bubatz\s+Bubatz-Zone/);
  assert.match(cli('presets').stdout, /informatiker/);
});

test('CLI: Fehler werden sauber gemeldet (ohne Netz)', () => {
  let r = cli('score', '52.5,13.4', '-p', 'gibtsnicht');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unbekanntes Preset/);
  r = cli('score', '52.5,13.4', '-m', 'spaeti', '-s', 'kaputt');
  assert.match(r.stderr, /Ungültiges --set/);
  r = cli('frobnicate');
  assert.match(r.stderr, /Unbekannter Befehl/);
});
