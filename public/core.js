/* Gym Timer — logica pura (nessun accesso al DOM), testabile anche in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GymCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = {
    prepare: [0, 120, 10],
    warmup: [0, 1800, 0],
    work: [1, 3600, 30],
    rest: [0, 1800, 10],
    rounds: [1, 100, 8],
    sets: [1, 50, 1],
    setRest: [0, 1800, 0],
    cooldown: [0, 1800, 0],
  };

  function clampInt(v, min, max, def) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }

  function newId() {
    return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  /** Normalizza qualsiasi oggetto in un allenamento valido (usato anche per i link condivisi). */
  function sanitizeWorkout(o, keepId) {
    o = o && typeof o === 'object' ? o : {};
    const w = {
      id: keepId && typeof o.id === 'string' && o.id ? cleanText(o.id, 40) : newId(),
      name: cleanText(o.name, 40) || 'Allenamento',
    };
    for (const k of Object.keys(LIMITS)) {
      const [min, max, def] = LIMITS[k];
      w[k] = clampInt(o[k], min, max, def);
    }
    w.loop = o.loop === true;
    const ex = Array.isArray(o.exercises) ? o.exercises : [];
    w.exercises = ex.map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 40);
    return w;
  }

  // ponytail: il loop è una sequenza lunga LOOP_MS, non infinita; a fine corsa l'allenamento si conclude. Se serve di più, alzare il valore.
  const LOOP_MS = 3 * 3600 * 1000;

  /** Costruisce la sequenza di fasi. Tutti i tempi in millisecondi. */
  function buildTimeline(w) {
    const segs = [];
    const add = (type, secs, label, extra) => {
      if (secs > 0) segs.push(Object.assign({ type, dur: secs * 1000, label }, extra || {}));
    };
    const loop = w.loop === true;
    const rounds = loop ? Math.ceil(LOOP_MS / ((w.work + w.rest) * 1000)) : w.rounds;
    const sets = loop ? 1 : w.sets;
    const exAt = (r) => (w.exercises.length ? w.exercises[(r - 1) % w.exercises.length] : '');

    add('prep', w.prepare, 'Preparati');
    add('warmup', w.warmup, 'Riscaldamento');
    for (let s = 1; s <= sets; s++) {
      for (let r = 1; r <= rounds; r++) {
        const ex = exAt(r);
        add('work', w.work, ex || 'Lavoro', { set: s, round: r, ex });
        if (r < rounds) add('rest', w.rest, 'Riposo', { set: s, round: r, next: exAt(r + 1) });
      }
      if (s < sets) add('setrest', w.setRest, 'Pausa tra le serie', { set: s, round: rounds, next: exAt(1) });
    }
    add('cool', loop ? 0 : w.cooldown, 'Defaticamento');

    let t = 0;
    for (const g of segs) {
      g.start = t;
      t += g.dur;
      g.end = t;
    }
    return { segs, total: t, rounds, sets, loop };
  }

  const START_SOUND = { prep: 'soft', warmup: 'soft', work: 'go', rest: 'rest', setrest: 'set', cool: 'soft' };

  /**
   * Genera due liste ordinate per tempo:
   *  - sounds: suoni sintetizzati da programmare sul clock audio {t, s}
   *  - mcues: azioni sul thread principale (voce, vibrazione) {t, text, vib}
   */
  function buildCues(tl, opts) {
    const N = clampInt(opts && opts.countdown, 0, 10, 3);
    const extras = !opts || opts.extras !== false;
    const sounds = [];
    const mcues = [];
    const lastIdx = tl.segs.length - 1;

    tl.segs.forEach((g, i) => {
      if (!(i === 0 && g.type === 'prep')) sounds.push({ t: g.start, s: START_SOUND[g.type] || 'soft' });
      for (let k = N; k >= 1; k--) {
        const t = g.end - k * 1000;
        if (t > g.start + 800) sounds.push({ t, s: 'tick' });
      }

      let text;
      let vib;
      switch (g.type) {
        case 'prep':
          text = 'Preparati';
          vib = [150];
          break;
        case 'warmup':
          text = 'Riscaldamento';
          vib = [150];
          break;
        case 'work': {
          const lastRound = g.round === tl.rounds && g.set === tl.sets;
          const prefix = (g.round === 1 && tl.sets > 1 ? 'Serie ' + g.set + '. ' : '') + (lastRound && tl.rounds > 1 && !tl.loop ? 'Ultimo round. ' : '');
          text = prefix + (g.ex || 'Round ' + g.round);
          vib = [250];
          break;
        }
        case 'rest':
          text = 'Riposo' + (g.next ? '. Prossimo: ' + g.next : '');
          vib = [120, 60, 120];
          break;
        case 'setrest':
          text = 'Pausa tra le serie' + (g.next ? '. Prossimo: ' + g.next : '');
          vib = [120, 60, 120];
          break;
        case 'cool':
          text = 'Defaticamento';
          vib = [150];
          break;
        default:
          text = g.label;
          vib = [100];
      }
      mcues.push({ t: g.start, text, vib });

      if (extras && g.type === 'work') {
        if (g.dur >= 40000) mcues.push({ t: g.start + g.dur / 2, text: 'Metà tempo' });
        if (g.dur >= 30000) mcues.push({ t: g.end - 10000, text: 'Dieci secondi' });
      }
      if (i === lastIdx) {
        sounds.push({ t: g.end, s: 'end' });
        mcues.push({ t: g.end, text: 'Allenamento completato. Ottimo lavoro!', vib: [300, 100, 300, 100, 600] });
      }
    });

    sounds.sort((a, b) => a.t - b.t);
    mcues.sort((a, b) => a.t - b.t);
    return { sounds, mcues };
  }

  /** Primo indice con arr[i].t >= t (ricerca binaria). */
  function firstIdx(arr, t) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Indice della fase che contiene la posizione pos (ms). */
  function segIndexAt(tl, pos) {
    const segs = tl.segs;
    if (!segs.length) return 0;
    if (pos >= tl.total) return segs.length - 1;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pos >= segs[mid].end) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function fmt(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function fmtShort(secs) {
    return secs < 60 ? secs + 's' : fmt(secs * 1000);
  }

  function summary(w) {
    const cycle = fmtShort(w.work) + (w.rest ? ' + ' + fmtShort(w.rest) : '');
    if (w.loop) return '∞ (' + cycle + ')' + (w.exercises.length ? ' · ' + w.exercises.length + ' esercizi' : '');
    let s = w.rounds + '×(' + cycle + ')';
    if (w.sets > 1) s += ' · ' + w.sets + ' serie';
    if (w.exercises.length) s += ' · ' + w.exercises.length + ' esercizi';
    return s;
  }

  // ---- condivisione tramite link (JSON compatto in base64url) ----
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeShare(w) {
    const o = { v: 1, n: w.name, pr: w.prepare, wu: w.warmup, w: w.work, r: w.rest, ro: w.rounds, s: w.sets, sr: w.setRest, cd: w.cooldown };
    if (w.loop) o.lp = 1;
    if (w.exercises.length) o.ex = w.exercises;
    return toB64(JSON.stringify(o));
  }

  /** Restituisce un allenamento valido (con nuovo id) oppure null se il link non è valido. */
  function decodeShare(str) {
    try {
      if (!str || str.length > 6000) return null;
      const o = JSON.parse(fromB64(str));
      if (!o || o.v !== 1) return null;
      return sanitizeWorkout({ name: o.n, prepare: o.pr, warmup: o.wu, work: o.w, rest: o.r, rounds: o.ro, sets: o.s, setRest: o.sr, cooldown: o.cd, exercises: o.ex, loop: o.lp === 1 }, false);
    } catch (e) {
      return null;
    }
  }

  const PRESETS = [
    { name: 'Tabata', prepare: 10, warmup: 0, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 0, cooldown: 0, exercises: [] },
    { name: 'HIIT 30/30', prepare: 10, warmup: 60, work: 30, rest: 30, rounds: 10, sets: 1, setRest: 0, cooldown: 60, exercises: [] },
    { name: 'Circuito 6 esercizi', prepare: 10, warmup: 120, work: 40, rest: 20, rounds: 6, sets: 3, setRest: 60, cooldown: 120, exercises: ['Squat', 'Push-up', 'Affondi', 'Plank', 'Burpee', 'Mountain climber'] },
    { name: 'Round di boxe', prepare: 10, warmup: 0, work: 180, rest: 60, rounds: 6, sets: 1, setRest: 0, cooldown: 0, exercises: [] },
    { name: 'EMOM 12 minuti', prepare: 10, warmup: 0, work: 45, rest: 15, rounds: 12, sets: 1, setRest: 0, cooldown: 0, exercises: [] },
    { name: 'Stretching', prepare: 10, warmup: 0, work: 30, rest: 5, rounds: 10, sets: 1, setRest: 0, cooldown: 0, exercises: [] },
  ];

  return { LIMITS, sanitizeWorkout, buildTimeline, buildCues, firstIdx, segIndexAt, fmt, fmtShort, summary, encodeShare, decodeShare, newId, PRESETS };
});
