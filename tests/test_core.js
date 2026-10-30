// Test della logica pura: node test_core.js
const assert = require('assert');
const Core = require('../public/core.js');

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

const tabata = Core.sanitizeWorkout({ name: 'Tabata', prepare: 10, warmup: 0, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 0, cooldown: 0, exercises: [] });

const circuito6 = { name: 'Circuito 6 esercizi', prepare: 10, warmup: 120, work: 40, rest: 20, rounds: 6, sets: 3, setRest: 60, cooldown: 120, exercises: ['Squat', 'Push-up', 'Affondi', 'Plank', 'Burpee', 'Mountain climber'] };

t('Tabata: durata totale = 10 + 8*20 + 7*10 = 240 s', () => {
  const tl = Core.buildTimeline(tabata);
  assert.strictEqual(tl.total, 240000);
  assert.strictEqual(tl.segs.filter(g => g.type === 'work').length, 8);
  assert.strictEqual(tl.segs.filter(g => g.type === 'rest').length, 7); // niente riposo dopo l'ultimo round
});

t('le fasi sono contigue e senza buchi', () => {
  const tl = Core.buildTimeline(Core.sanitizeWorkout(circuito6));
  let prev = 0;
  for (const g of tl.segs) { assert.strictEqual(g.start, prev); assert.strictEqual(g.end, g.start + g.dur); prev = g.end; }
  assert.strictEqual(prev, tl.total);
});

t('circuito 3 serie: pausa tra serie solo tra le serie (2), esercizi a rotazione', () => {
  const w = Core.sanitizeWorkout(circuito6);
  const tl = Core.buildTimeline(w);
  assert.strictEqual(tl.segs.filter(g => g.type === 'setrest').length, 2);
  const works = tl.segs.filter(g => g.type === 'work');
  assert.strictEqual(works.length, 18);
  assert.strictEqual(works[0].ex, 'Squat');
  assert.strictEqual(works[6].ex, 'Squat'); // inizia la serie 2
  // durata: 10 + 120 + 3*(6*40 + 5*20) + 2*60 + 120
  assert.strictEqual(tl.total, (10 + 120 + 3 * (240 + 100) + 120 + 120) * 1000);
});

t('segIndexAt: confini e fine timeline', () => {
  const tl = Core.buildTimeline(tabata);
  assert.strictEqual(Core.segIndexAt(tl, 0), 0);
  assert.strictEqual(Core.segIndexAt(tl, 9999), 0);
  assert.strictEqual(Core.segIndexAt(tl, 10000), 1);   // inizia il primo lavoro
  assert.strictEqual(Core.segIndexAt(tl, 29999), 1);
  assert.strictEqual(Core.segIndexAt(tl, 30000), 2);   // primo riposo
  assert.strictEqual(Core.segIndexAt(tl, tl.total), tl.segs.length - 1);
  for (let ms = 0; ms < tl.total; ms += 997) {
    const g = tl.segs[Core.segIndexAt(tl, ms)];
    assert.ok(ms >= g.start && ms < g.end, 'pos ' + ms);
  }
});

t('buildCues: conto alla rovescia 3-2-1 prima di ogni fase e suono di inizio fase', () => {
  const tl = Core.buildTimeline(tabata);
  const { sounds } = Core.buildCues(tl, { countdown: 3, extras: true });
  const work1 = tl.segs[1];
  const ticks = sounds.filter(s => s.s === 'tick' && s.t > work1.start && s.t < work1.end).map(s => s.t);
  assert.deepStrictEqual(ticks, [work1.end - 3000, work1.end - 2000, work1.end - 1000]);
  assert.ok(sounds.some(s => s.s === 'go' && s.t === work1.start));
  assert.ok(sounds.some(s => s.s === 'rest' && s.t === tl.segs[2].start));
  assert.ok(!sounds.some(s => s.t === 0), 'nessun suono all\'avvio della preparazione');
  assert.strictEqual(sounds[sounds.length - 1].s, 'end');
  assert.strictEqual(sounds[sounds.length - 1].t, tl.total);
  for (let i = 1; i < sounds.length; i++) assert.ok(sounds[i].t >= sounds[i - 1].t, 'ordinati');
});

t('buildCues: countdown 0 = nessun tick; fasi corte non hanno tick sovrapposti', () => {
  const tl = Core.buildTimeline(tabata);
  assert.strictEqual(Core.buildCues(tl, { countdown: 0 }).sounds.filter(s => s.s === 'tick').length, 0);
  const short = Core.buildTimeline(Core.sanitizeWorkout({ work: 2, rest: 1, rounds: 3, prepare: 0 }));
  const cues = Core.buildCues(short, { countdown: 5 });
  for (const s of cues.sounds.filter(x => x.s === 'tick')) {
    const g = short.segs[Core.segIndexAt(short, s.t)];
    assert.ok(s.t > g.start + 800 - 1, 'tick dentro la propria fase');
  }
});

t('voce: annuncia esercizio, riposo con prossimo esercizio, ultimo round, fine', () => {
  const w = Core.sanitizeWorkout({ name: 'x', prepare: 5, work: 40, rest: 10, rounds: 3, sets: 1, exercises: ['Squat', 'Plank', 'Burpee'] });
  const tl = Core.buildTimeline(w);
  const { mcues } = Core.buildCues(tl, { countdown: 3, extras: true });
  const texts = mcues.map(c => c.text);
  assert.ok(texts.includes('Preparati'));
  assert.ok(texts.includes('Squat'));
  assert.ok(texts.includes('Riposo. Prossimo: Plank'));
  assert.ok(texts.includes('Ultimo round. Burpee'));
  assert.ok(texts.includes('Metà tempo'));
  assert.ok(texts.includes('Dieci secondi'));
  assert.strictEqual(texts[texts.length - 1], 'Allenamento completato. Ottimo lavoro!');
  const noExtras = Core.buildCues(tl, { extras: false }).mcues.map(c => c.text);
  assert.ok(!noExtras.includes('Metà tempo') && !noExtras.includes('Dieci secondi'));
});

t('firstIdx: ricerca binaria corretta', () => {
  const a = [{ t: 0 }, { t: 5 }, { t: 5 }, { t: 9 }];
  assert.strictEqual(Core.firstIdx(a, -1), 0);
  assert.strictEqual(Core.firstIdx(a, 5), 1);
  assert.strictEqual(Core.firstIdx(a, 6), 3);
  assert.strictEqual(Core.firstIdx(a, 10), 4);
});

t('fmt: mm:ss e h:mm:ss', () => {
  assert.strictEqual(Core.fmt(0), '0:00');
  assert.strictEqual(Core.fmt(59999), '0:59');
  assert.strictEqual(Core.fmt(61000), '1:01');
  assert.strictEqual(Core.fmt(3600000), '1:00:00');
  assert.strictEqual(Core.fmt(3725000), '1:02:05');
  assert.strictEqual(Core.fmt(-5), '0:00');
});

t('sanitize: valori fuori range, testo ostile e tipi sbagliati', () => {
  const w = Core.sanitizeWorkout({ name: '  <img src=x onerror=alert(1)>  '.repeat(5), work: -5, rest: 'abc', rounds: 9999, sets: 0, exercises: ['  a  ', '', 5, null, 'x'.repeat(100)] });
  assert.ok(w.name.length <= 40);
  assert.strictEqual(w.work, 1);
  assert.strictEqual(w.rest, 10);   // default perché non numerico
  assert.strictEqual(w.rounds, 100);
  assert.strictEqual(w.sets, 1);
  assert.deepStrictEqual(w.exercises.slice(0, 2), ['a', '5']);
  assert.ok(w.exercises.every(e => e.length <= 40));
  assert.ok(Core.sanitizeWorkout(null).name === 'Allenamento');
});

t('condivisione: round-trip con accenti ed emoji, e nuovo id', () => {
  const w = Core.sanitizeWorkout({ name: 'Più forza 💪', work: 45, rest: 15, rounds: 5, exercises: ['Spinte è già', 'Trazioni'] });
  const code = Core.encodeShare(w);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(code), 'solo caratteri sicuri per URL');
  const back = Core.decodeShare(code);
  assert.strictEqual(back.name, w.name);
  assert.deepStrictEqual(back.exercises, w.exercises);
  assert.strictEqual(back.work, 45);
  assert.notStrictEqual(back.id, w.id);
});

t('condivisione: input non valido o malevolo → null', () => {
  assert.strictEqual(Core.decodeShare('!!!'), null);
  assert.strictEqual(Core.decodeShare(''), null);
  assert.strictEqual(Core.decodeShare('A'.repeat(7000)), null);
  const bad = Buffer.from(JSON.stringify({ v: 2, n: 'x' })).toString('base64url');
  assert.strictEqual(Core.decodeShare(bad), null);
  const proto = Buffer.from('{"v":1,"n":"x","__proto__":{"a":1},"w":"999999","ro":1e9}').toString('base64url');
  const w = Core.decodeShare(proto);
  assert.strictEqual(w.work, 3600);
  assert.strictEqual(w.rounds, 100);
  assert.strictEqual(({}).a, undefined);
});

t('tutti i preset sono validi e la durata è sensata', () => {
  assert.deepStrictEqual(Core.PRESETS.map((p) => p.name), ['Tabata', 'Total body', 'Round 60/30']);
  for (const p of Core.PRESETS) {
    const w = Core.sanitizeWorkout(p);
    const tl = Core.buildTimeline(w);
    assert.ok(tl.total > 60000 && tl.total < 3 * 3600000, p.name + ' ' + tl.total);
    assert.ok(Core.summary(w).length > 0);
  }
});

t('loop: il timeline copre ore, niente cooldown/serie, "Ultimo round" mai annunciato, il link lo conserva', () => {
  const w = Core.sanitizeWorkout({ name: 'Loop', prepare: 10, work: 40, rest: 20, rounds: 3, sets: 4, cooldown: 60, loop: true });
  const tl = Core.buildTimeline(w);
  assert.strictEqual(tl.loop, true);
  assert.ok(tl.total > 2.9 * 3600 * 1000, 'copre circa 3 ore');
  assert.ok(tl.segs.every((g) => g.type !== 'cool' && g.type !== 'setrest'));
  const { mcues } = Core.buildCues(tl, {});
  assert.ok(!mcues.some((c) => /Ultimo round/.test(c.text)));
  assert.ok(Core.summary(w).startsWith('∞'));
  assert.strictEqual(Core.decodeShare(Core.encodeShare(w)).loop, true);
  assert.strictEqual(Core.decodeShare(Core.encodeShare(Core.sanitizeWorkout({ work: 30 }))).loop, false);
});

t('modelli: ogni modello è valido, ha colore della tavolozza, una timeline sensata e annunci senza errori', () => {
  const names = new Set();
  assert.ok(Core.MODELS.length >= 6);
  for (const cat of Core.MODELS) {
    assert.ok(cat.cat && cat.items.length > 0, 'categoria vuota: ' + cat.cat);
    for (const m of cat.items) {
      const w = Core.sanitizeWorkout(m);
      assert.ok(!names.has(w.name), 'nome doppio: ' + w.name);
      names.add(w.name);
      for (const k of Object.keys(Core.LIMITS)) assert.strictEqual(w[k], m[k], w.name + ': ' + k + ' fuori limite');
      assert.strictEqual(w.color, m.color, w.name + ': colore');
      assert.ok(m.color >= 0 && m.color <= 5);
      const tl = Core.buildTimeline(w);
      assert.ok(tl.segs.length > 0 && tl.total >= 60000 && tl.total <= 3 * 3600 * 1000, w.name + ': durata ' + tl.total);
      Core.buildCues(tl, { countdown: 3, extras: true });
    }
  }
});

t('il colore sopravvive a sanitize e al link condiviso; un valore strano torna al predefinito', () => {
  const w = Core.sanitizeWorkout({ name: 'X', work: 30, color: 4 });
  assert.strictEqual(Core.decodeShare(Core.encodeShare(w)).color, 4);
  assert.strictEqual(Core.sanitizeWorkout({ color: 99 }).color, 5);
  assert.strictEqual(Core.sanitizeWorkout({ color: 'x' }).color, 0);
});

console.log('\n' + passed + ' test superati');
