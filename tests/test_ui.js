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
const t = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

function boot(opts = {}) {
  // ---- orologio finto ----
  const clock = { now: 1_700_000_000_000, timers: new Map(), nextId: 1 };
  const rec = { beeps: [], spoken: [], vibes: [], session: [], toasts: [], played: 0, plays: [], pauses: [], utts: [] };

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
      Object.defineProperty(w.navigator, 'vibrate', { value: (p) => { rec.vibes.push(p); return true; } });
      Object.defineProperty(w.navigator, 'audioSession', { value: { set type(v) { rec.session.push(v); } } });
      w.HTMLMediaElement.prototype.play = function () { rec.played++; rec.plays.push({ src: this.src, at: clock.now, loop: this.loop }); return Promise.resolve(); };
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

console.log('\n' + passed + ' test UI superati');
