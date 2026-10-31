// Controlli sul sito statico: pagina di download, pagina 404, service worker e pubblicazione dell'APK.
// Esegui: node test_site.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

// href e src locali di una pagina (esclude indirizzi esterni, ancore e l'APK, che pubblica la CI)
function localRefs(html) {
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^(https?:|mailto:|#)/.test(u) && !/\.apk$/.test(u));
}

t('download: il pulsante scarica thaimer.apk e il file ha quel nome', () => {
  const html = read('download.html');
  assert.ok(/<a [^>]*id="dl"[^>]*href="thaimer\.apk"/.test(html), 'il link punta a thaimer.apk');
  assert.ok(/<a [^>]*id="dl"[^>]*download="thaimer\.apk"/.test(html), 'il file salvato si chiama thaimer.apk');
  assert.ok(html.includes('<html lang="it">') && html.includes('<title>Scarica Thaimer per Android</title>'));
});

t('download: tutti i collegamenti locali esistono', () => {
  const html = read('download.html');
  for (const u of localRefs(html)) {
    const file = u === './' ? 'index.html' : u.split('#')[0];
    assert.ok(fs.existsSync(path.join(ROOT, file)), 'manca ' + u);
  }
});

t('download: se il file manca la pagina lo dice (la HEAD controlla anche che non sia una pagina web)', () => {
  const html = read('download.html');
  assert.ok(html.includes("method: 'HEAD'") && html.includes("indexOf('text/html')"));
  assert.ok(!/innerHTML/.test(html), 'testo solo con textContent');
});

t('404: percorsi assoluti, perché la pagina esce a qualunque indirizzo', () => {
  const html = read('404.html');
  for (const u of localRefs(html)) assert.ok(u.startsWith('/'), 'percorso relativo nella 404: ' + u);
  for (const u of localRefs(html)) {
    const file = u === '/' ? 'index.html' : u.slice(1);
    assert.ok(fs.existsSync(path.join(ROOT, file)), 'manca ' + u);
  }
});

t('service worker: l\'APK non passa mai dalla cache, il resto sì', () => {
  const listeners = {};
  vm.runInNewContext(read('sw.js'), {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: 'https://thaimer.pherio.net' }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve(), put() {} }), match: () => Promise.resolve(undefined), keys: () => Promise.resolve([]), delete: () => Promise.resolve() },
    fetch: () => Promise.resolve({ ok: true, clone() { return this; } }),
    URL,
  });
  const run = (u) => {
    let responded = false;
    listeners.fetch({ request: { method: 'GET', url: u }, respondWith: () => { responded = true; } });
    return responded;
  };
  assert.strictEqual(run('https://thaimer.pherio.net/thaimer.apk'), false, 'APK: il service worker non interviene');
  assert.strictEqual(run('https://thaimer.pherio.net/thaimer.apk?x=1'), false);
  assert.strictEqual(run('https://thaimer.pherio.net/download'), true, 'la pagina di download resta offline');
  assert.strictEqual(run('https://thaimer.pherio.net/app.js'), true);
});

t('pubblicazione: solo da main, solo con la chiave vera, senza far ripartire la CI', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'android.yml'), 'utf8');
  assert.ok(yml.includes("'!public/thaimer.apk'"), 'il commit dell\'APK non lancia un\'altra compilazione');
  assert.ok(yml.includes('refs/heads/main') && yml.includes('"$HAS_KEY" != "true"'), 'controlli prima di pubblicare');
  assert.ok(yml.includes('cp android/app/build/outputs/apk/release/app-release.apk public/thaimer.apk'), 'copia l\'APK di rilascio, non quello di debug');
  assert.ok(!yml.includes('[skip ci]'), '[skip ci] farebbe saltare anche la pubblicazione su Cloudflare Pages');
});

console.log('\n' + passed + ' test del sito superati');
