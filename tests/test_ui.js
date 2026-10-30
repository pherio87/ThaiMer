// Smoke test dell'interfaccia in jsdom, con orologio, audio e voce simulati.
// Esegui: node test_ui.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const coreSrc = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let passed = 0;
let blobCount = 0;
const pending = []; // test che restituiscono una Promise: si attendono tutti prima del riepilogo
const t = (name, fn) => {
  const r = fn();
  const done = () => { passed++; console.log('ok  -', name); };
  if (r && typeof r.then === 'function') pending.push(r.then(done));
  else done();
};

function boot(opts = {}) {
  // ---- orologio finto ----
  const clock = { now: 1_700_000_000_000, timers: new Map(), nextId: 1 };
  const rec = { beeps: [], spoken: [], vibes: [], session: [], toasts: [], played: 0, plays: [], pauses: [], utts: [], loads: [], native: [], listeners: [], swRegs: 0, shares: [] };

  const dom = new JSDOM(html, {
    url: 'https://gym.example/' + (opts.hash || ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.TextEncoder = TextEncoder; // presenti in tutti i browser reali, assenti in jsdom
      w.TextDecoder = TextDecoder;
      w.Date.now = () => clock.now;
      w.setInterval = (fn, ms) => { const id = clock.nextId++; clock.timers.set(id, { fn, ms, next: clock.now + ms, every: true }); return id; };
      w.setTimeout = (fn, ms) => { const id = clock.nextId++; clock.timers.set(id, { fn, ms, next: clock.now + (ms || 0), every: false }); return id; };
      w.clearInterval = w.clearTimeout = (id) => clock.timers.delete(id);

      class Node_ { constructor() { this.frequency = { setValueAtTime: (v) => { this._f = v; }, linearRampToValueAtTime() {} }; this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 1 }; }
        connect(x) { return x; } disconnect() {} start(when) { this._when = when; rec.beeps.push({ when, freq: this._f }); } stop() { this._stopped = true; } }
      w.AudioContext = class {
        constructor() { this.state = 'running'; this.destination = {}; }
        get currentTime() { return (clock.now - 1_700_000_000_000) / 1000; }
        createOscillator() { return new Node_(); } createGain() { return new Node_(); }
        resume() { return Promise.resolve(); } addEventListener() {}
      };
      w.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      w.speechSynthesis = { speak: (u) => { rec.spoken.push(u.text); rec.utts.push(u); }, cancel() {}, getVoices: () => [] };
      // app Android: il bridge di Capacitor che l'APK inietta nella pagina, con il plugin ThaimerNative registrato
      if (opts.native) {
        w.Capacitor = {
          isNativePlatform: () => true,
          nativePromise: (plugin, method, o) => { rec.native.push({ plugin, method, o, at: clock.now }); return Promise.resolve({}); },
          nativeCallback: (plugin, method, o, cb) => { rec.listeners.push({ plugin, method, o, cb }); },
        };
      }
      Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => { rec.swRegs++; return Promise.resolve(); } } });
      Object.defineProperty(w.navigator, 'share', { value: (d) => { rec.shares.push(d); return Promise.resolve(); } });
      Object.defineProperty(w.navigator, 'vibrate', { value: (p) => { rec.vibes.push(p); return true; } });
      Object.defineProperty(w.navigator, 'audioSession', { value: { set type(v) { rec.session.push(v); } } });
      w.HTMLMediaElement.prototype.play = function () { rec.played++; rec.plays.push({ src: this.src, at: clock.now, loop: this.loop }); return Promise.resolve(); };
      w.HTMLMediaElement.prototype.load = function () { rec.loads.push({ loop: this.loop, src: this.getAttribute('src') }); };
      w.HTMLMediaElement.prototype.pause = function () { rec.pauses.push({ loop: this.loop, at: clock.now }); };
      w.URL.createObjectURL = () => 'blob:' + (++blobCount) + '';
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.confirm = () => true;
      w.scrollTo = () => {};
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {} }));
      const store = {};
      Object.defineProperty(w, 'localStorage', { value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] } });
      if (opts.settings) store['gymtimer.settings.v1'] = JSON.stringify(opts.settings);
    },
  });
  const w = dom.window;
  w.eval(coreSrc);
  w.eval(appSrc);

  // fa avanzare il tempo simulato eseguendo i timer in ordine
  const advance = (ms) => {
    const end = clock.now + ms;
    for (;;) {
      let nextId = null, nextT = Infinity;
      for (const [id, tm] of clock.timers) if (tm.next < nextT) { nextT = tm.next; nextId = id; }
      if (nextId === null || nextT > end) break;
      clock.now = Math.max(clock.now, nextT);
      const tm = clock.timers.get(nextId);
      if (tm.every) tm.next += tm.ms; else clock.timers.delete(nextId);
      tm.fn();
    }
    clock.now = end;
  };
  const q = (s) => w.document.querySelector(s);
  return { w, q, advance, rec, clock };
}

// ---------------------------------------------------------------------------
t('home: mostra i 6 allenamenti di esempio con durata', () => {
  const { q, w } = boot();
  const cards = w.document.querySelectorAll('#list .card');
  assert.strictEqual(cards.length, 6);
  assert.ok(q('#list').textContent.includes('Tabata'));
  assert.ok(q('#list').textContent.includes('4:00'));
});

t('Tabata: i suoni vengono programmati ai secondi giusti e la voce annuncia le fasi', () => {
  const { q, advance, rec } = boot();
  const tabata = [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata'));
  tabata.click();
  assert.strictEqual(q('#run').hidden, false);
  assert.strictEqual(q('#run-clock').textContent, '0:10', 'prima dell\'avvio mostra la preparazione');
  assert.strictEqual(q('#run-phase').textContent, 'PRONTO');

  q('#run-toggle').click(); // avvio
  advance(100);
  assert.strictEqual(q('#run-phase').textContent, 'PREPARATI');
  assert.deepStrictEqual(rec.spoken, ['Preparati']);

  // il tempo con il quale arriva ogni beep (in secondi dal via)
  const times = rec.beeps.map((b) => Math.round(b.when * 100) / 100);
  // tick 7,8,9 (fine preparazione) + suono "go" a 10 (2 note: 10 e 10.19) + tick 27,28,29 ...
  for (const s of [7, 8, 9, 10, 27, 28, 29, 30]) assert.ok(times.some((x) => Math.abs(x - s) < 0.02), 'beep a ' + s + 's, trovati: ' + times.slice(0, 14).join(','));
  assert.ok(!times.some((x) => x < 6.9), 'nessun suono prima del conto alla rovescia');

  advance(10_000); // → 10.1 s: primo lavoro
  assert.strictEqual(q('#run-phase').textContent, 'LAVORO');
  assert.ok(rec.spoken.includes('Round 1'));
  assert.strictEqual(q('#run-round').textContent, 'Round 1/8');
  assert.strictEqual(q('#run-clock').textContent, '0:20');

  advance(20_000); // → 30.1 s: primo riposo
  assert.strictEqual(q('#run-phase').textContent, 'RIPOSO');
  assert.strictEqual(q('#run-clock').textContent, '0:10');
  assert.ok(rec.spoken.includes('Riposo'));
  assert.ok(rec.vibes.length >= 3);
});

t('il display del conto alla rovescia coincide con i beep (3-2-1)', () => {
  const { q, advance } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(7050); // il primo beep scatta a 7 s
  assert.strictEqual(q('#run-clock').textContent, '0:03');
  advance(1000);
  assert.strictEqual(q('#run-clock').textContent, '0:02');
  advance(1000);
  assert.strictEqual(q('#run-clock').textContent, '0:01');
});

t('pausa e ripresa: il tempo si ferma, nessun suono arriva da pausa, poi riprende dal punto giusto', () => {
  const { q, advance, rec } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(15_000); // 15 s: dentro il primo lavoro (rimangono 15 s)
  assert.strictEqual(q('#run-clock').textContent, '0:15');
  q('#run-toggle').click(); // pausa
  const clockAtPause = q('#run-clock').textContent;
  const beepsAtPause = rec.beeps.length;
  advance(60_000);
  assert.strictEqual(q('#run-clock').textContent, clockAtPause, 'fermo durante la pausa');
  assert.strictEqual(rec.beeps.length, beepsAtPause, 'nessun beep nuovo in pausa');
  q('#run-toggle').click(); // riprende
  advance(11_000);
  assert.strictEqual(q('#run-clock').textContent, '0:04');
  // i beep 3-2-1 del primo lavoro (a 27,28,29 s) non devono essere duplicati dopo la ripresa
  const afterResume = rec.beeps.slice(beepsAtPause).map((b) => Math.round(b.when * 100) / 100);
  const at27 = afterResume.filter((x) => x > 26.9 && x < 27.1 + 60).length; // dopo la pausa (+60 s) i tempi assoluti slittano
  assert.ok(at27 >= 1, 'i beep vengono riprogrammati dopo la ripresa');
});

t('avanti / indietro tra le fasi', () => {
  const { q, advance } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(12_000);
  assert.strictEqual(q('#run-phase').textContent, 'LAVORO');
  q('#run-next-btn').click(); // → riposo
  advance(50);
  assert.strictEqual(q('#run-phase').textContent, 'RIPOSO');
  q('#run-prev').click(); // sono nei primi 2 s del riposo → torna al lavoro
  advance(50);
  assert.strictEqual(q('#run-phase').textContent, 'LAVORO');
  advance(5000);
  q('#run-prev').click(); // oltre 2 s → riparte la stessa fase
  advance(50);
  assert.strictEqual(q('#run-clock').textContent, '0:20');
});

t('fine allenamento: stato «COMPLETATO», fanfara programmata, schermo rilasciato', () => {
  const { q, advance, rec } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(1000);
  q('#run-next-btn').click(); // salta la preparazione
  advance(240_000);
  assert.strictEqual(q('#run-phase').textContent, 'COMPLETATO');
  assert.ok(rec.spoken.includes('Allenamento completato. Ottimo lavoro!'));
  assert.ok(rec.beeps.length > 30);
  advance(5000);
  assert.ok(rec.session.includes('auto'), 'sessione audio ripristinata');
});

t('modalità «Abbassa la musica»: audioSession passa a transient solo intorno ai suoni', () => {
  const { q, advance, rec } = boot({ settings: { audioMode: 'duck' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(12_000);
  assert.ok(rec.session.includes('transient'), 'transient richiesto');
  assert.ok(rec.session.includes('ambient'), 'ripristinato ad ambient');
  assert.strictEqual(rec.session[rec.session.length - 1], 'ambient');
});

t('modalità «Abbassa la musica (Android)»: suoni come clip <audio>, anticipate di 150 ms, nessun Web Audio', () => {
  const { q, advance, rec, clock } = boot({ settings: { audioMode: 'clip' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  const t0 = clock.now;
  q('#run-toggle').click();
  advance(11_000);
  assert.strictEqual(rec.beeps.length, 0, 'nessun oscillatore Web Audio');
  const beepPlays = rec.plays.filter((p) => !p.loop);
  const off = beepPlays.map((p) => Math.round(((p.at - t0) / 1000) * 100) / 100);
  // beep a 7, 8, 9 s e «go» a 10 s → partono 0,15 s prima, quindi a 6,85 / 7,85 / 8,85 / 9,85
  for (const s of [6.85, 7.85, 8.85, 9.85]) assert.ok(off.some((x) => Math.abs(x - s) <= 0.11), 'clip a ' + s + ' s, trovati: ' + off.join(','));
  const srcs = beepPlays.map((p) => p.src);
  assert.strictEqual(srcs[0], srcs[1], 'i tick usano la stessa clip');
  assert.notStrictEqual(srcs[0], srcs[3], 'il suono «via» è una clip diversa');
  q('#run-toggle').click(); // pausa: nessuna clip in coda deve partire
  const n = rec.plays.length;
  advance(30_000);
  assert.strictEqual(rec.plays.length, n);
});

t('abbassamento continuo: da 0,5 s prima del conto alla rovescia fino a 0,5 s dopo l ultimo suono', () => {
  const { q, advance, rec, clock } = boot({ settings: { audioMode: 'clip' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  const t0 = clock.now;
  q('#run-toggle').click();
  advance(14_000);
  const hold = rec.plays.filter((p) => p.loop);
  assert.strictEqual(hold.length, 1, 'il clip di tenuta parte una sola volta per tutto il 3-2-1 + via');
  assert.ok(Math.abs((hold[0].at - t0) / 1000 - 6.5) <= 0.11, 'parte a 6,5 s: ' + (hold[0].at - t0) / 1000);
  const off = rec.pauses.filter((p) => p.loop).map((p) => (p.at - t0) / 1000);
  assert.ok(off.length >= 1 && off[0] > 10.6, 'non si ferma tra un bip e l altro né prima della fine del «via» + 0,5 s: ' + off.join(','));
});

t('abbassamento: se la voce non segnala mai la fine, la musica risale comunque', () => {
  const { q, advance, rec, clock } = boot({ settings: { audioMode: 'clip' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  const t0 = clock.now;
  q('#run-toggle').click();
  advance(10_200);
  rec.utts[rec.utts.length - 1].onstart(); // inizia a parlare, onend non arriverà mai
  advance(20_000);
  const off = rec.pauses.filter((p) => p.loop).map((p) => (p.at - t0) / 1000);
  assert.ok(off.length >= 1 && off[0] < 18, 'il clip di tenuta si ferma comunque: ' + off.join(','));
  assert.ok(rec.loads.some((l) => l.loop && l.src === null), 'a fine finestra l elemento viene svuotato, non solo messo in pausa');
});

t('abbassamento continuo (duck): un solo transient per tutto il conto alla rovescia', () => {
  const { q, advance, rec } = boot({ settings: { audioMode: 'duck' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(10_300);
  const i = rec.session.indexOf('transient');
  assert.ok(i >= 0, 'transient richiesto');
  assert.ok(!rec.session.slice(i).includes('ambient'), 'nessun rialzo tra i bip: ' + rec.session.join(','));
});

t('modalità «Background garantito»: avvia l\'audio di mantenimento', () => {
  const { q, advance, rec } = boot({ settings: { audioMode: 'bg' } });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(200);
  assert.ok(rec.played >= 1);
  assert.ok(rec.session.includes('playback'));
});

t('editor: crea un allenamento, salva, appare in home e il totale si aggiorna', () => {
  const { q, w } = boot();
  q('#btn-new').click();
  assert.strictEqual(q('#editor').hidden, false);
  const f = q('#ed-form');
  f.elements.name.value = 'Mio circuito';
  f.elements.work.value = '45';
  f.elements.rest.value = '15';
  f.elements.rounds.value = '4';
  f.elements.prepare.value = '5';
  f.elements.warmup.value = '0';
  f.elements.sets.value = '1';
  f.elements.setRest.value = '0';
  f.elements.cooldown.value = '0';
  f.elements.exercises.value = 'Squat\nPlank';
  f.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.ok(q('#ed-total').textContent.includes('3:50'), q('#ed-total').textContent); // 5 + 4*45 + 3*15 = 230 s
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.strictEqual(q('#home').hidden, false);
  assert.ok(q('#list').textContent.includes('Mio circuito'));
  assert.strictEqual(w.document.querySelectorAll('#list .card').length, 7);
});

t('play/pausa: l\'icona segue lo stato', () => {
  const { q, advance } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  const hidden = (id) => q(id).hasAttribute('hidden');
  assert.ok(!hidden('#ico-play') && hidden('#ico-pause'), 'pronto: play');
  q('#run-toggle').click();
  advance(300);
  assert.ok(hidden('#ico-play') && !hidden('#ico-pause'), 'in corso: pausa');
  q('#run-toggle').click();
  assert.ok(!hidden('#ico-play') && hidden('#ico-pause'), 'in pausa: play');
});

t('loop: dall\'editor, nasconde i campi inutili e l\'allenamento non finisce dopo 1 ora', () => {
  const { q, w, advance } = boot();
  q('#btn-new').click();
  const f = q('#ed-form');
  f.elements.name.value = 'Senza fine';
  f.elements.work.value = '40';
  f.elements.rest.value = '20';
  f.elements.loop.checked = true;
  f.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.ok(q('[data-key="rounds"]').hidden && q('[data-key="cooldown"]').hidden);
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const card = [...q('#list').querySelectorAll('.card')].find((c) => c.textContent.includes('Senza fine'));
  assert.ok(card.textContent.includes('∞'));
  card.querySelector('.card-main').click();
  q('#run-toggle').click();
  advance(3600 * 1000);
  assert.notStrictEqual(q('#run-phase').textContent, 'COMPLETATO');
  assert.ok(!q('#run-round').textContent.includes('/'), q('#run-round').textContent);
});

t('impostazioni: si aprono anche durante l\'allenamento, che continua', () => {
  const { q, w, advance } = boot();
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
  advance(2000);
  assert.ok(q('#run-settings svg'), 'icona presente');
  q('#run-settings').click();
  assert.ok(q('#settings').hasAttribute('open'));
  q('#set-volume').value = '0.5';
  q('#set-volume').dispatchEvent(new w.Event('input'));
  q('#settings').removeAttribute('open');
  q('#settings').dispatchEvent(new w.Event('close'));
  advance(10_000);
  assert.strictEqual(q('#run-phase').textContent, 'LAVORO', 'il timer non si è fermato');
});

t('importa da link condiviso: mostra la conferma e aggiunge l\'allenamento senza eseguire HTML', () => {
  const Core = require(path.join(ROOT, 'core.js'));
  const shared = Core.sanitizeWorkout({ name: '<b onmouseover=alert(1)>Boxe</b>', work: 120, rest: 30, rounds: 3 });
  const { q, w } = boot({ hash: '#w=' + Core.encodeShare(shared) });
  assert.ok(q('#import').hasAttribute('open'));
  assert.ok(q('#imp-text').textContent.includes('Boxe'));
  assert.strictEqual(q('#imp-text').querySelector('b'), null, 'testo, non HTML');
  assert.strictEqual(w.location.hash, '', 'hash ripulito');
  const dlg = q('#import');
  dlg.returnValue = 'yes';
  dlg.dispatchEvent(new w.Event('close'));
  assert.strictEqual(w.document.querySelectorAll('#list .card').length, 7);
  assert.strictEqual(q('#list').querySelector('b'), null, 'nessun HTML iniettato nella lista');
});

t('link non valido: nessun crash, avviso all\'utente', () => {
  const { q, w } = boot({ hash: '#w=%%%' });
  assert.strictEqual(w.document.querySelectorAll('#list .card').length, 6);
  const { q: q2 } = boot({ hash: '#w=AAAA' });
  assert.ok(q2('#toast').textContent.includes('non valido'));
});

t('impostazioni: le modifiche vengono salvate', () => {
  const { q, w } = boot();
  const sel = q('#set-countdown');
  sel.value = '5';
  sel.dispatchEvent(new w.Event('change'));
  const mode = w.document.querySelector('input[name="audioMode"][value="duck"]');
  mode.checked = true;
  mode.dispatchEvent(new w.Event('change'));
  const saved = JSON.parse(w.localStorage.getItem('gymtimer.settings.v1'));
  assert.strictEqual(saved.countdown, 5);
  assert.strictEqual(saved.audioMode, 'duck');
});


/* ---------------------------------------------------------------------------
   App Android (Capacitor): plugin nativo per priorità audio, servizio e schermo
   --------------------------------------------------------------------------- */
const calls = (rec, method) => rec.native.filter((c) => c.method === method);
const startTabata = (q) => {
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  q('#run-toggle').click();
};

t('app: modalità audio «Abbassa la musica» predefinita, solo «Affiancato» e quella nativa nelle impostazioni', () => {
  const { q, w } = boot({ native: true });
  const visible = [...w.document.querySelectorAll('input[name="audioMode"]')].filter((r) => !r.closest('.mode').hidden).map((r) => r.value);
  assert.deepStrictEqual(visible, ['mix', 'native']);
  assert.strictEqual(w.document.querySelector('input[name="audioMode"][value="native"]').checked, true);
  assert.strictEqual(q('#home .hint').hidden, true, 'niente istruzioni di installazione nell\'app');
});

t('web: la modalità nativa non compare e le chiamate al plugin non partono', () => {
  const { q, w, advance, rec } = boot();
  const visible = [...w.document.querySelectorAll('input[name="audioMode"]')].filter((r) => !r.closest('.mode').hidden).map((r) => r.value);
  assert.deepStrictEqual(visible, ['mix', 'clip', 'duck', 'bg']);
  startTabata(q);
  advance(12_000);
  assert.strictEqual(rec.native.length, 0);
  assert.strictEqual(rec.swRegs, 1, 'sul web il service worker si registra');
});

t('app: un modo salvato che non esiste nell\'app (clip) torna al predefinito; nel web «native» torna a «mix»', () => {
  const a = boot({ native: true, settings: { audioMode: 'clip' } });
  assert.strictEqual(a.w.document.querySelector('input[name="audioMode"][value="native"]').checked, true);
  const b = boot({ settings: { audioMode: 'native' } });
  assert.strictEqual(b.w.document.querySelector('input[name="audioMode"][value="mix"]').checked, true);
});

t('app: nessun service worker; i suoni restano in Web Audio programmati in anticipo', () => {
  const { q, advance, rec } = boot({ native: true });
  assert.strictEqual(rec.swRegs, 0);
  startTabata(q);
  advance(100);
  assert.strictEqual(rec.plays.filter((p) => !p.loop).length, 0, 'nessuna clip <audio>');
  const times = rec.beeps.map((b) => Math.round(b.when * 100) / 100);
  assert.ok(times.some((x) => Math.abs(x - 7) < 0.02) && times.some((x) => Math.abs(x - 10) < 0.02), 'beep già programmati: ' + times.slice(0, 8).join(','));
  assert.ok(times.some((x) => x > 60), 'anticipo ampio (90 s), non i 4 s delle clip');
});

t('app: ogni suono apre una finestra di priorità audio nel plugin, da 0,5 s prima', () => {
  const { q, advance, rec } = boot({ native: true });
  startTabata(q);
  advance(100);
  const at = calls(rec, 'duckAt').map((c) => c.o);
  // tick a 7, 8, 9 s e «via» a 10 s: il primo si apre a 7 - 0,5 = 6,5 s da adesso (circa)
  assert.ok(at.length >= 4, 'una finestra per suono: ' + JSON.stringify(at.slice(0, 4)));
  assert.ok(at.some((o) => Math.abs(o.delayMs - 6400) <= 150), 'apertura a ~6,4 s: ' + at.slice(0, 4).map((o) => o.delayMs).join(','));
  assert.ok(at.every((o) => Number.isInteger(o.delayMs) && o.delayMs >= 0 && o.holdMs >= 1000), 'millisecondi interi, finestra ≥ 1 s');
  assert.ok(rec.session.indexOf('transient') < 0, 'non usa audioSession');
});

t('app: la voce apre e chiude la priorità audio; se non segnala la fine la finestra si chiude lo stesso', () => {
  const { q, advance, rec } = boot({ native: true });
  startTabata(q);
  advance(200);
  const utt = rec.utts[rec.utts.length - 1];
  utt.onstart();
  assert.deepStrictEqual(calls(rec, 'duckSet').map((c) => c.o.on), [true]);
  utt.onend();
  advance(1000);
  assert.deepStrictEqual(calls(rec, 'duckSet').map((c) => c.o.on), [true, false]);
  // senza onend: scade da sola
  advance(300);
  const rec2 = boot({ native: true });
  startTabata(rec2.q);
  rec2.advance(200);
  rec2.rec.utts[rec2.rec.utts.length - 1].onstart();
  rec2.advance(20_000);
  assert.deepStrictEqual(calls(rec2.rec, 'duckSet').map((c) => c.o.on), [true, false]);
});

t('app: pausa e salto annullano le finestre già programmate', () => {
  const { q, advance, rec } = boot({ native: true });
  startTabata(q);
  advance(2000);
  const before = calls(rec, 'duckCancel').length;
  q('#run-toggle').click(); // pausa
  assert.ok(calls(rec, 'duckCancel').length > before, 'pausa: finestre annullate');
  q('#run-toggle').click(); // riprende: ripianifica
  const opened = calls(rec, 'duckAt').length;
  advance(100);
  assert.ok(calls(rec, 'duckAt').length >= opened);
  const c2 = calls(rec, 'duckCancel').length;
  q('#run-next-btn').click();
  assert.ok(calls(rec, 'duckCancel').length > c2, 'salto: finestre annullate');
});

t('app: modalità «Affiancato» non apre finestre di priorità audio', () => {
  const { q, advance, rec } = boot({ native: true, settings: { audioMode: 'mix' } });
  startTabata(q);
  advance(12_000);
  rec.utts[rec.utts.length - 1].onstart && rec.utts[rec.utts.length - 1].onstart();
  assert.strictEqual(calls(rec, 'duckAt').length, 0);
  assert.strictEqual(calls(rec, 'duckSet').length, 0);
  assert.ok(rec.beeps.length > 0, 'i suoni suonano comunque');
});

t('app: servizio in primo piano e schermo acceso per tutto l\'allenamento', () => {
  const { q, advance, rec } = boot({ native: true });
  [...q('#list').querySelectorAll('.card-main')].find((b) => b.textContent.includes('Tabata')).click();
  assert.strictEqual(rec.native.length, 0, 'nulla finché non si preme avvio');
  q('#run-toggle').click();
  advance(100);
  assert.strictEqual(calls(rec, 'requestNotifications').length, 1, 'permesso notifiche chiesto al primo avvio');
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    const start = calls(rec, 'serviceStart');
    assert.strictEqual(start.length, 1);
    assert.ok(start[0].o.title.includes('Tabata') && start[0].o.text === 'PREPARATI' && start[0].o.paused === false, JSON.stringify(start[0].o));
    assert.ok(calls(rec, 'screenOn').some((c) => c.o.on === true));
    advance(10_200);
    assert.strictEqual(calls(rec, 'serviceUpdate').pop().o.text.startsWith('LAVORO'), true, 'la notifica segue la fase');
    q('#run-toggle').click();
    const u = calls(rec, 'serviceUpdate').pop().o;
    assert.deepStrictEqual([u.text, u.paused], ['In pausa', true]);
    q('#run-toggle').click();
    assert.strictEqual(calls(rec, 'serviceUpdate').pop().o.paused, false);
    assert.strictEqual(calls(rec, 'serviceStart').length, 1, 'il servizio non viene riavviato');
    q('#run-close').click();
    assert.strictEqual(calls(rec, 'serviceStop').length, 1);
    assert.strictEqual(calls(rec, 'screenOn').pop().o.on, false);
  });
});

t('app: il permesso per le notifiche si chiede una volta sola', () => {
  const { q, advance, rec, w } = boot({ native: true });
  startTabata(q);
  advance(100);
  q('#run-close').click();
  startTabata(q);
  advance(100);
  assert.strictEqual(calls(rec, 'requestNotifications').length, 1);
  assert.strictEqual(JSON.parse(w.localStorage.getItem('gymtimer.settings.v1')).notifAsked, true);
  const again = boot({ native: true, settings: { notifAsked: true } });
  startTabata(again.q);
  again.advance(100);
  assert.strictEqual(calls(again.rec, 'requestNotifications').length, 0);
});

t('app: i pulsanti della notifica mettono in pausa, riprendono e terminano', () => {
  const { q, advance, rec } = boot({ native: true });
  const l = rec.listeners.find((x) => x.method === 'addListener' && x.o.eventName === 'action');
  assert.ok(l, 'ascolta gli eventi del plugin');
  startTabata(q);
  advance(2000);
  l.cb({ action: 'pause' });
  assert.strictEqual(q('#run-toggle').getAttribute('aria-label'), 'Riprendi');
  l.cb({ action: 'resume' });
  assert.strictEqual(q('#run-toggle').getAttribute('aria-label'), 'Pausa');
  l.cb({ action: 'stop' });
  assert.strictEqual(q('#home').hidden, false);
  assert.strictEqual(calls(rec, 'serviceStop').length, 1);
  l.cb({ action: 'stop' }); // a allenamento chiuso non succede nulla
  l.cb(undefined);
});

t('app: fine allenamento, il servizio si ferma dopo la fanfara', () => {
  const { q, advance, rec } = boot({ native: true });
  startTabata(q);
  advance(1000);
  q('#run-next-btn').click(); // salta la preparazione: restano 230 s
  advance(231_000);
  assert.strictEqual(q('#run-phase').textContent, 'COMPLETATO');
  assert.strictEqual(calls(rec, 'serviceUpdate').pop().o.text, 'Completato');
  assert.strictEqual(calls(rec, 'serviceStop').length, 0, 'ancora attivo durante la fanfara');
  advance(5000);
  assert.strictEqual(calls(rec, 'serviceStop').length, 1);
});

t('app: il link di condivisione punta al sito pubblico, non a https://localhost; sul web usa l\'indirizzo della pagina', () => {
  const a = boot({ native: true });
  a.q('#list .card .btn.ghost').click();
  a.q('#ed-share').click();
  const b = boot();
  b.q('#list .card .btn.ghost').click();
  b.q('#ed-share').click();
  return Promise.resolve().then(() => {
    assert.strictEqual(a.rec.shares.length, 1);
    assert.ok(a.rec.shares[0].url.startsWith('https://thaimer.pherio.net/#w='), a.rec.shares[0].url);
    assert.strictEqual(b.rec.shares.length, 1);
    assert.ok(b.rec.shares[0].url.startsWith('https://gym.example/#w='), b.rec.shares[0].url);
  });
});

Promise.all(pending).then(
  () => console.log('\n' + passed + ' test UI superati'),
  (e) => { console.error(e); process.exit(1); }
);
