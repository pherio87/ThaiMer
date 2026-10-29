/* Thaimer — interfaccia, audio e ciclo di vita dell'allenamento. */
(function () {
  'use strict';
  const Core = window.GymCore;
  const $ = (s, el = document) => el.querySelector(s);

  /* ------------------------------------------------------------------ */
  /* Utilità                                                             */
  /* ------------------------------------------------------------------ */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('Impossibile salvare: memoria del browser non disponibile');
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Dati                                                                */
  /* ------------------------------------------------------------------ */
  const KEY_W = 'gymtimer.workouts.v1';
  const KEY_S = 'gymtimer.settings.v1';
  const DEFAULTS = { volume: 1, countdown: 3, voice: true, extras: true, vibrate: true, wake: true, audioMode: 'mix' };

  let S = Object.assign({}, DEFAULTS, loadJSON(KEY_S, {}));
  let workouts = loadJSON(KEY_W, null);

  function seedPresets() {
    return Core.PRESETS.map((p) => Core.sanitizeWorkout(p, false));
  }
  if (!Array.isArray(workouts)) {
    workouts = seedPresets();
    saveJSON(KEY_W, workouts);
  } else {
    workouts = workouts.map((w) => Core.sanitizeWorkout(w, true));
  }
  const saveWorkouts = () => saveJSON(KEY_W, workouts);
  const saveSettings = () => saveJSON(KEY_S, S);

  /* ------------------------------------------------------------------ */
  /* Navigazione                                                         */
  /* ------------------------------------------------------------------ */
  const views = ['home', 'editor', 'run'];
  function show(name) {
    for (const v of views) $('#' + v).hidden = v !== name;
    document.body.classList.toggle('running-view', name === 'run');
    if (name !== 'run') document.body.dataset.phase = 'idle';
    setThemeColor(name === 'run' ? getComputedStyle(document.body).getPropertyValue('--phase').trim() : '#0b0f14');
    window.scrollTo(0, 0);
  }
  function setThemeColor(c) {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m && c) m.setAttribute('content', c);
  }

  /* ------------------------------------------------------------------ */
  /* Home                                                                */
  /* ------------------------------------------------------------------ */
  function renderHome() {
    const list = $('#list');
    list.replaceChildren();
    if (!workouts.length) list.append(h('p', { class: 'empty' }, 'Nessun allenamento. Creane uno con «+ Nuovo» o ripristina gli esempi dalle impostazioni.'));
    for (const w of workouts) {
      const tl = Core.buildTimeline(w);
      list.append(
        h('article', { class: 'card' },
          h('button', { class: 'card-main', onclick: () => openRun(w.id), 'aria-label': 'Avvia ' + w.name },
            h('strong', {}, w.name),
            h('span', { class: 'meta' }, Core.summary(w))),
          h('div', { class: 'card-side' },
            h('span', { class: 'dur' }, tl.loop ? '∞' : Core.fmt(tl.total)),
            h('button', { class: 'btn ghost', onclick: () => openEditor(w.id) }, 'Modifica')))
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  const NUM_FIELDS = [
    ['prepare', 'Preparazione (s)'],
    ['warmup', 'Riscaldamento (s)'],
    ['work', 'Lavoro (s)'],
    ['rest', 'Riposo (s)'],
    ['rounds', 'Round per serie'],
    ['sets', 'Serie'],
    ['setRest', 'Pausa tra serie (s)'],
    ['cooldown', 'Defaticamento (s)'],
  ];
  const LOOP_HIDDEN = ['rounds', 'sets', 'setRest', 'cooldown']; // senza senso se l'allenamento si ripete all'infinito
  let editingId = null;

  function buildEditorFields() {
    const box = $('#ed-numbers');
    box.replaceChildren();
    for (const [key, label] of NUM_FIELDS) {
      const [min, max] = Core.LIMITS[key];
      box.append(
        h('label', { class: 'field', 'data-key': key },
          h('span', {}, label),
          h('input', { type: 'number', name: key, inputmode: 'numeric', min, max, step: 1, required: true }))
      );
    }
  }

  function readForm() {
    const f = $('#ed-form');
    const o = { id: editingId || undefined, name: f.elements.name.value, exercises: f.elements.exercises.value.split('\n') };
    for (const [key] of NUM_FIELDS) o[key] = f.elements[key].value;
    o.loop = f.elements.loop.checked;
    return Core.sanitizeWorkout(o, true);
  }

  function updateTotal() {
    const w = readForm();
    const tl = Core.buildTimeline(w);
    for (const key of LOOP_HIDDEN) $('[data-key="' + key + '"]').hidden = w.loop;
    $('#ed-total').textContent = w.loop
      ? 'Si ripete finché non lo fermi'
      : 'Durata totale: ' + Core.fmt(tl.total) + ' · ' + tl.segs.filter((g) => g.type === 'work').length + ' intervalli di lavoro';
  }

  function openEditor(id) {
    editingId = id || null;
    const w = id ? workouts.find((x) => x.id === id) : Core.sanitizeWorkout({ name: '' }, false);
    const f = $('#ed-form');
    f.elements.name.value = id ? w.name : '';
    for (const [key] of NUM_FIELDS) f.elements[key].value = w[key];
    f.elements.exercises.value = w.exercises.join('\n');
    f.elements.loop.checked = w.loop;
    $('#editor-title').textContent = id ? 'Modifica allenamento' : 'Nuovo allenamento';
    for (const b of ['#ed-del', '#ed-dup', '#ed-share']) $(b).hidden = !id;
    updateTotal();
    show('editor');
  }

  function saveFromForm() {
    const f = $('#ed-form');
    if (!f.reportValidity()) return null;
    const w = readForm();
    if (editingId) {
      const i = workouts.findIndex((x) => x.id === editingId);
      if (i >= 0) workouts[i] = w;
    } else {
      w.id = Core.newId();
      workouts.push(w);
      editingId = w.id;
    }
    saveWorkouts();
    renderHome();
    return w;
  }

  function shareLink(w) {
    return location.origin + location.pathname + '#w=' + Core.encodeShare(w);
  }

  async function shareWorkout(w) {
    const url = shareLink(w);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Thaimer: ' + w.name, text: 'Allenamento «' + w.name + '» per Thaimer', url });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiato negli appunti');
    } catch (e) {
      window.prompt('Copia questo link:', url);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Audio                                                               */
  /* ------------------------------------------------------------------ */
  let ctx = null;
  let master = null;
  let liveNodes = [];
  let timers = [];

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.connect(ctx.destination);
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running' && run.state === 'running') resync();
      });
    }
    master.gain.value = S.volume;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }

  // Audio Session API (dove disponibile): decide se la nostra audio si mescola, abbassa o interrompe quella delle altre app.
  function setSession(type) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = type;
    } catch (e) { /* non supportato */ }
  }
  function applySessionForMode() {
    setSession(S.audioMode === 'bg' ? 'playback' : 'ambient');
  }

  function tone(when, freq, dur, opts) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const peak = (opts && opts.gain) || 1;
    o.type = (opts && opts.type) || 'triangle';
    o.frequency.setValueAtTime(freq, when);
    if (opts && opts.to) o.frequency.linearRampToValueAtTime(opts.to, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.03);
    liveNodes.push(o);
    o.onended = () => {
      liveNodes = liveNodes.filter((n) => n !== o);
      try { g.disconnect(); } catch (e) { /* già scollegato */ }
    };
  }

  // I suoni sono descritti come note (istante, frequenza, durata): servono sia al sintetizzatore Web Audio
  // sia al generatore di clip WAV usato dalla modalità «Abbassa la musica (Android)».
  const NOTES = {
    tick: [{ at: 0, f: 880, d: 0.13 }],
    go: [{ at: 0, f: 1175, d: 0.16 }, { at: 0.19, f: 1568, d: 0.4 }],
    rest: [{ at: 0, f: 660, d: 0.2 }, { at: 0.22, f: 494, d: 0.35 }],
    set: [{ at: 0, f: 523, d: 0.14 }, { at: 0.17, f: 659, d: 0.14 }, { at: 0.34, f: 784, d: 0.3 }],
    soft: [{ at: 0, f: 740, d: 0.3, type: 'sine' }],
    end: [523, 659, 784, 1047].map((f, i) => ({ at: i * 0.16, f, d: i === 3 ? 0.7 : 0.18 })),
  };
  const soundDur = (name) => Math.max(...NOTES[name].map((n) => n.at + n.d)) + 0.05;

  /* ---- clip audio (modalità «Abbassa la musica (Android)») ----
     Un elemento <audio> chiede al sistema la «priorità audio» (audio focus), cosa che il Web Audio non fa.
     Se Android la tratta come breve/transitoria, app come Spotify abbassano il volume; se la tratta come
     persistente, la mettono in pausa. Un piccolo silenzio iniziale dà tempo al sistema di abbassare la musica. */
  const CLIP_LEAD = 0.15;
  const clips = {};

  function renderClip(name) {
    const rate = 22050;
    const n = Math.ceil((CLIP_LEAD + soundDur(name)) * rate);
    const buf = new Float32Array(n);
    for (const note of NOTES[name]) {
      const peak = note.g || 1;
      const start = Math.floor((CLIP_LEAD + note.at) * rate);
      const len = Math.floor(note.d * rate);
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / rate;
        const env = t < 0.012 ? 0.0001 * Math.pow(peak / 0.0001, t / 0.012) : peak * Math.pow(0.0001 / peak, (t - 0.012) / (note.d - 0.012));
        const ph = 2 * Math.PI * note.f * t;
        const s = note.type === 'sine' ? Math.sin(ph) : (2 / Math.PI) * Math.asin(Math.sin(ph));
        buf[start + i] += s * env;
      }
    }
    const view = new DataView(new ArrayBuffer(44 + n * 2));
    const put = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    put(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); put(8, 'WAVE'); put(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    put(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, buf[i])) * 32767, true);
    return new Blob([view.buffer], { type: 'audio/wav' });
  }
  function clipFor(name) {
    if (!clips[name]) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = URL.createObjectURL(renderClip(name));
      clips[name] = el;
    }
    return clips[name];
  }
  function preloadClips() {
    Object.keys(NOTES).forEach(clipFor);
  }

  /* ---- finestra di abbassamento (modalità «clip» e «duck») ----
     Una sola finestra continua: si apre DUCK_PAD prima di ogni suono e resta aperta finché c'è un suono
     in arrivo o la voce sta parlando; si chiude DUCK_PAD dopo l'ultimo. Così il conto alla rovescia 3-2-1
     e l'annuncio successivo tengono la musica bassa senza rialzarla tra un bip e l'altro.
     In «clip» la finestra è tenuta da un clip silenzioso di 1 s in loop (breve, come i bip, perché Android
     lo tratti come priorità transitoria e abbassi la musica invece di fermarla). */
  const DUCK_PAD = 500;
  let duckOn = false;
  let duckUntil = 0;
  let duckTimer = 0;
  let holdEl = null;
  let speechUntil = 0; // fine stimata dell'annuncio vocale in corso
  let speaking = null; // l'annuncio vocale in corso

  function duckSet(on) {
    if (on === duckOn) return;
    duckOn = on;
    if (S.audioMode === 'duck') setSession(on ? 'transient' : 'ambient');
    if (S.audioMode === 'clip') {
      if (on) {
        holdEl = new Audio();
        holdEl.loop = true;
        holdEl.src = keepAliveUrl();
        holdEl.play().catch(() => {});
      } else if (holdEl) {
        // pause() da sola non basta: Android rilascia la priorità audio solo quando l'elemento viene svuotato
        holdEl.pause();
        holdEl.removeAttribute('src');
        holdEl.load();
        holdEl = null;
      }
    }
  }
  function duckCheck() {
    clearTimeout(duckTimer);
    const left = Math.max(duckUntil, speechUntil) - Date.now();
    if (left > 0) duckTimer = setTimeout(duckCheck, left);
    else duckSet(false);
  }
  // tiene la finestra aperta per holdMs, a partire da delayMs da adesso
  function duckHold(delayMs, holdMs) {
    if (S.audioMode !== 'clip' && S.audioMode !== 'duck') return;
    timers.push(setTimeout(() => {
      duckUntil = Math.max(duckUntil, Date.now() + holdMs);
      duckSet(true);
      duckCheck();
    }, Math.max(0, delayMs)));
  }
  function duckReset() {
    clearTimeout(duckTimer);
    duckUntil = 0;
    speaking = null;
    speechUntil = 0;
    duckSet(false);
  }

  // delay = secondi da adesso al momento in cui il suono deve essere udibile
  function playCue(name, delay) {
    duckHold(delay * 1000 - DUCK_PAD, DUCK_PAD * 2 + soundDur(name) * 1000);
    if (S.audioMode === 'clip') {
      const el = clipFor(name);
      timers.push(setTimeout(() => {
        try {
          el.volume = S.volume;
          el.currentTime = 0;
          el.play().catch(() => {});
        } catch (e) { /* riproduzione non riuscita */ }
      }, Math.max(0, delay * 1000 - CLIP_LEAD * 1000)));
      return;
    }
    const when = ctx.currentTime + delay;
    for (const n of NOTES[name]) tone(when + n.at, n.f, n.d, { gain: n.g, type: n.type });
  }

  function cancelScheduled() {
    for (const n of liveNodes) {
      try { n.stop(); } catch (e) { /* già fermo */ }
    }
    liveNodes = [];
    timers.forEach(clearTimeout);
    timers = [];
    for (const el of Object.values(clips)) {
      try { el.pause(); } catch (e) { /* ignora */ }
    }
    duckReset();
  }

  function itVoice() {
    if (!('speechSynthesis' in window)) return null;
    return speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('it')) || null;
  }
  function speak(text) {
    if (!S.voice || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      const v = itVoice();
      if (v) u.voice = v;
      u.rate = 1.05;
      u.volume = Math.max(0.05, S.volume);
      if (S.audioMode === 'duck' || S.audioMode === 'clip') {
        // onend su Android a volte non arriva: la durata stimata dalla lunghezza del testo è il limite massimo
        u.onstart = () => { speaking = u; speechUntil = Date.now() + 1500 + text.length * 90; duckSet(true); duckCheck(); };
        const back = () => {
          if (speaking !== u) return; // un annuncio più recente ha preso il posto
          speaking = null;
          speechUntil = Date.now() + DUCK_PAD;
          duckCheck();
        };
        u.onend = back;
        u.onerror = back;
      }
      speechSynthesis.speak(u);
    } catch (e) { /* voce non disponibile */ }
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  function vibrate(pattern) {
    if (S.vibrate && pattern && navigator.vibrate) navigator.vibrate(pattern);
  }

  /* ---- audio silenzioso per tenere viva l'app (modalità «Background garantito») ---- */
  function makeKeepAliveWav() {
    const rate = 8000;
    const n = rate; // 1 secondo, 100 Hz esatti → ciclo senza scatti
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(4 * Math.sin((2 * Math.PI * 100 * i) / rate)), true);
    return new Blob([buf], { type: 'audio/wav' });
  }
  let keepUrl = null;
  function keepAliveUrl() {
    if (!keepUrl) keepUrl = URL.createObjectURL(makeKeepAliveWav());
    return keepUrl;
  }
  function keepAliveStart() {
    if (S.audioMode !== 'bg') return;
    const el = $('#keep');
    if (!el.src) el.src = keepAliveUrl();
    el.play().catch(() => {});
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: run.w.name,
          artist: 'Thaimer',
          artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
        });
        navigator.mediaSession.setActionHandler('play', () => resume());
        navigator.mediaSession.setActionHandler('pause', () => pause());
        navigator.mediaSession.setActionHandler('nexttrack', () => skip(1));
        navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1));
        navigator.mediaSession.playbackState = 'playing';
      } catch (e) { /* API parziale */ }
    }
  }
  function keepAlivePause() {
    $('#keep').pause();
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'paused'; } catch (e) { /* ignora */ }
    }
  }
  function keepAliveStop() {
    const el = $('#keep');
    el.pause();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
        for (const a of ['play', 'pause', 'nexttrack', 'previoustrack']) navigator.mediaSession.setActionHandler(a, null);
      } catch (e) { /* ignora */ }
    }
  }

  /* ---- schermo sempre acceso ---- */
  let wakeLock = null;
  async function lockScreen() {
    if (!S.wake || !('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function unlockScreen() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  /* ------------------------------------------------------------------ */
  /* Allenamento in corso                                                */
  /* ------------------------------------------------------------------ */
  // pos = posizione nella timeline (ms). Quando è in corso: base + (Date.now() - t0).
  const run = { w: null, tl: null, sounds: [], mcues: [], state: 'idle', pos: 0, base: 0, t0: 0, idx: 0, sIdx: 0, mIdx: 0, ticker: 0, endTimer: 0 };
  const PHASE_NAME = { prep: 'PREPARATI', warmup: 'RISCALDAMENTO', work: 'LAVORO', rest: 'RIPOSO', setrest: 'PAUSA SERIE', cool: 'DEFATICAMENTO' };

  function curPos() {
    return run.state === 'running' ? Math.min(run.tl.total, run.base + (Date.now() - run.t0)) : run.pos;
  }
  // con audio schedulato in anticipo il suono parte anche se il JS viene rallentato in background
  function lookahead() {
    return S.audioMode === 'duck' || S.audioMode === 'clip' ? 4000 : 90000;
  }

  function openRun(id) {
    const w = workouts.find((x) => x.id === id);
    if (!w) return;
    const tl = Core.buildTimeline(w);
    if (!tl.segs.length) { toast('Allenamento vuoto'); return; }
    const cues = Core.buildCues(tl, { countdown: S.countdown, extras: S.extras });
    Object.assign(run, { w, tl, sounds: cues.sounds, mcues: cues.mcues, state: 'ready', pos: 0, base: 0, idx: 0, sIdx: 0, mIdx: 0 });
    $('#run-title').textContent = w.name;
    show('run');
    render(0);
  }

  function reindex(pos) {
    run.idx = Core.segIndexAt(run.tl, pos);
    run.sIdx = Core.firstIdx(run.sounds, pos - 1);
    run.mIdx = Core.firstIdx(run.mcues, pos - 1);
  }

  function schedule() {
    if (run.state !== 'running') return;
    if (S.audioMode !== 'clip' && (!ctx || ctx.state !== 'running')) return;
    const pos = curPos();
    const limit = pos + lookahead();
    while (run.sIdx < run.sounds.length && run.sounds[run.sIdx].t <= limit) {
      const c = run.sounds[run.sIdx++];
      if (c.t < pos - 150) continue; // troppo in ritardo: meglio saltarlo
      playCue(c.s, Math.max(0, (c.t - pos) / 1000));
    }
  }

  function resync() {
    if (run.state !== 'running') return;
    cancelScheduled();
    reindex(curPos());
    schedule();
  }

  function startTicker() {
    clearInterval(run.ticker);
    run.ticker = setInterval(tick, 100);
  }

  function tick() {
    if (run.state !== 'running') return;
    const pos = curPos();
    while (run.mIdx < run.mcues.length && run.mcues[run.mIdx].t <= pos) {
      const c = run.mcues[run.mIdx++];
      if (pos - c.t > 2500) continue; // annuncio ormai vecchio
      if (c.text) speak(c.text);
      if (c.vib) vibrate(c.vib);
    }
    while (run.idx < run.tl.segs.length - 1 && pos >= run.tl.segs[run.idx].end) run.idx++;
    if (pos >= run.tl.total) { finish(); return; }
    render(pos);
    schedule();
  }

  function start() {
    if (!ensureAudio()) toast('Audio non supportato da questo browser');
    if (S.audioMode === 'clip') preloadClips();
    applySessionForMode();
    lockScreen();
    keepAliveStart();
    run.state = 'running';
    run.base = run.pos;
    run.t0 = Date.now();
    reindex(run.pos);
    startTicker();
    tick();
  }

  function pause() {
    if (run.state !== 'running') return;
    run.pos = curPos();
    run.state = 'paused';
    cancelScheduled();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    keepAlivePause();
    render(run.pos);
  }

  function resume() {
    if (run.state === 'ready') return start();
    if (run.state !== 'paused') return;
    ensureAudio();
    applySessionForMode();
    lockScreen();
    if (S.audioMode === 'bg') keepAliveStart();
    run.state = 'running';
    run.base = run.pos;
    run.t0 = Date.now();
    reindex(run.pos);
    tick();
  }

  function seek(ms) {
    ms = Math.max(0, Math.min(run.tl.total - 1, ms));
    const wasRunning = run.state === 'running';
    cancelScheduled();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    run.pos = ms;
    run.base = ms;
    run.t0 = Date.now();
    reindex(ms);
    if (wasRunning) tick();
    else render(ms);
  }

  function skip(dir) {
    if (!run.tl || run.state === 'ready' || run.state === 'done') return;
    const pos = curPos();
    const i = Core.segIndexAt(run.tl, pos);
    const g = run.tl.segs[i];
    if (dir > 0) {
      if (i >= run.tl.segs.length - 1) return finish();
      seek(run.tl.segs[i + 1].start);
    } else if (pos - g.start > 2000 || i === 0) seek(g.start);
    else seek(run.tl.segs[i - 1].start);
  }

  function finish() {
    clearInterval(run.ticker);
    run.pos = run.tl.total;
    run.state = 'done';
    render(run.pos);
    // lascia suonare la fanfara finale, poi libera schermo e audio
    clearTimeout(run.endTimer);
    run.endTimer = setTimeout(() => {
      unlockScreen();
      keepAliveStop();
      setSession('auto');
    }, 4500);
  }

  function stopRun() {
    clearInterval(run.ticker);
    clearTimeout(run.endTimer);
    cancelScheduled();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    unlockScreen();
    keepAliveStop();
    setSession('auto');
    run.state = 'idle';
    show('home');
  }

  function render(pos) {
    const tl = run.tl;
    const done = run.state === 'done';
    const g = tl.segs[Math.min(Core.segIndexAt(tl, pos), tl.segs.length - 1)];
    const ready = run.state === 'ready';
    const phase = done ? 'done' : ready ? 'ready' : g.type;
    document.body.dataset.phase = phase;
    setThemeColor(getComputedStyle(document.body).getPropertyValue('--phase').trim());

    $('#run-phase').textContent = done ? 'COMPLETATO' : ready ? 'PRONTO' : PHASE_NAME[g.type];
    const remainMs = done ? 0 : Math.ceil((g.end - pos) / 1000) * 1000;
    $('#run-clock').textContent = Core.fmt(ready ? tl.segs[0].dur : remainMs);
    $('#run-exercise').textContent = done ? 'Ottimo lavoro!' : ready ? run.w.name : g.type === 'work' ? g.ex : '';
    let next = '';
    if (!done && !ready && g.next) next = 'Prossimo: ' + g.next;
    $('#run-next').textContent = next;
    $('#run-progress').style.width = (done ? 100 : ready ? 0 : ((pos - g.start) / g.dur) * 100) + '%';
    $('#run-round').textContent = !done && !ready && (g.type === 'work' || g.type === 'rest' || g.type === 'setrest')
      ? (tl.sets > 1 ? 'Serie ' + g.set + '/' + tl.sets + ' · ' : '') + 'Round ' + g.round + (tl.loop ? '' : '/' + tl.rounds)
      : '';
    $('#run-total').textContent = 'Trascorso ' + Core.fmt(pos) + (tl.loop ? '' : ' · Rimane ' + Core.fmt(tl.total - pos));

    const playing = run.state === 'running';
    // toggleAttribute: gli <svg> non hanno la proprietà .hidden
    $('#ico-play').toggleAttribute('hidden', playing);
    $('#ico-pause').toggleAttribute('hidden', !playing);
    $('#run-toggle').setAttribute('aria-label', done ? 'Ricomincia' : playing ? 'Pausa' : ready ? 'Avvia' : 'Riprendi');
  }

  function toggle() {
    if (run.state === 'ready') start();
    else if (run.state === 'running') pause();
    else if (run.state === 'paused') resume();
    else if (run.state === 'done') {
      clearTimeout(run.endTimer);
      run.pos = 0;
      run.state = 'ready';
      render(0);
      start();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Impostazioni                                                        */
  /* ------------------------------------------------------------------ */
  function syncSettingsUI() {
    $('#set-volume').value = S.volume;
    $('#set-countdown').value = String(S.countdown);
    $('#set-voice').checked = S.voice;
    $('#set-extras').checked = S.extras;
    $('#set-vibrate').checked = S.vibrate;
    $('#set-wake').checked = S.wake;
    for (const r of document.querySelectorAll('input[name="audioMode"]')) r.checked = r.value === S.audioMode;
  }
  function bindSettings() {
    $('#set-volume').addEventListener('input', (e) => { S.volume = Number(e.target.value); if (master) master.gain.value = S.volume; saveSettings(); });
    $('#set-countdown').addEventListener('change', (e) => { S.countdown = Number(e.target.value); saveSettings(); });
    for (const [id, key] of [['set-voice', 'voice'], ['set-extras', 'extras'], ['set-vibrate', 'vibrate'], ['set-wake', 'wake']]) {
      $('#' + id).addEventListener('change', (e) => { S[key] = e.target.checked; saveSettings(); });
    }
    for (const r of document.querySelectorAll('input[name="audioMode"]')) {
      r.addEventListener('change', () => { if (r.checked) { S.audioMode = r.value; saveSettings(); applySessionForMode(); } });
    }
    $('#set-test').addEventListener('click', () => {
      ensureAudio();
      applySessionForMode();
      if (S.audioMode === 'clip') preloadClips();
      if (S.audioMode === 'clip' || ctx) playCue('go', 0.2);
      setTimeout(() => speak('Prova voce. Riposo. Prossimo: squat'), 900);
      vibrate([200]);
    });
    $('#set-restore').addEventListener('click', () => {
      if (!confirm('Aggiungere di nuovo gli allenamenti di esempio?')) return;
      workouts.push(...seedPresets());
      saveWorkouts();
      renderHome();
      toast('Esempi aggiunti');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Importazione da link                                                */
  /* ------------------------------------------------------------------ */
  function checkIncomingShare() {
    const m = /^#w=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return;
    const w = Core.decodeShare(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    if (!w) { toast('Link di allenamento non valido'); return; }
    const tl = Core.buildTimeline(w);
    $('#imp-text').textContent = '«' + w.name + '» — ' + Core.summary(w) + ' · durata ' + Core.fmt(tl.total) + '. Vuoi aggiungerlo ai tuoi allenamenti?';
    const dlg = $('#import');
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      if (dlg.returnValue === 'yes') {
        workouts.push(w);
        saveWorkouts();
        renderHome();
        toast('Allenamento aggiunto');
      }
    });
    dlg.showModal();
  }

  /* ------------------------------------------------------------------ */
  /* Collegamenti                                                        */
  /* ------------------------------------------------------------------ */
  function init() {
    buildEditorFields();
    syncSettingsUI();
    bindSettings();
    renderHome();
    show('home');

    $('#btn-new').addEventListener('click', () => openEditor(null));
    const openSettings = () => { syncSettingsUI(); $('#settings').showModal(); };
    $('#btn-settings').addEventListener('click', openSettings);
    $('#run-settings').append($('#btn-settings svg').cloneNode(true));
    $('#run-settings').addEventListener('click', openSettings);
    // se si cambia modalità audio a allenamento in corso, riprogramma i suoni con quella nuova
    $('#settings').addEventListener('close', () => {
      if (run.state !== 'running') return;
      ensureAudio();
      resync();
    });

    $('#ed-cancel').addEventListener('click', () => show('home'));
    $('#ed-form').addEventListener('input', updateTotal);
    $('#ed-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (saveFromForm()) { show('home'); toast('Salvato'); }
    });
    $('#ed-start').addEventListener('click', () => {
      const w = saveFromForm();
      if (w) openRun(w.id);
    });
    $('#ed-share').addEventListener('click', () => { const w = saveFromForm(); if (w) shareWorkout(w); });
    $('#ed-dup').addEventListener('click', () => {
      const w = saveFromForm();
      if (!w) return;
      const copy = Object.assign({}, w, { id: Core.newId(), name: (w.name + ' (copia)').slice(0, 40) });
      workouts.push(copy);
      saveWorkouts();
      renderHome();
      openEditor(copy.id);
      toast('Duplicato');
    });
    $('#ed-del').addEventListener('click', () => {
      if (!editingId || !confirm('Eliminare questo allenamento?')) return;
      workouts = workouts.filter((x) => x.id !== editingId);
      saveWorkouts();
      renderHome();
      show('home');
    });

    $('#run-toggle').addEventListener('click', toggle);
    $('#run-prev').addEventListener('click', () => skip(-1));
    $('#run-next-btn').addEventListener('click', () => skip(1));
    $('#run-close').addEventListener('click', () => {
      if (run.state === 'running' || run.state === 'paused') {
        if (!confirm('Interrompere l\'allenamento?')) return;
      }
      stopRun();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || run.state !== 'running') return;
      lockScreen();
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
      resync();
      tick();
    });

    window.addEventListener('hashchange', checkIncomingShare);
    checkIncomingShare();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
