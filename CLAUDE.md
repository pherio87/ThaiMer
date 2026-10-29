# Thaimer

PWA statica (HTML/CSS/JS vanilla, nessuna build) con timer a intervalli per allenamenti. Pubblicata su Cloudflare Pages dalla cartella `public/`. Uso personale e distribuzione agli iscritti di una palestra, in gran parte su Android.

## Struttura
- `public/core.js`: logica pura, senza DOM (timeline delle fasi, generazione di suoni e annunci, condivisione tramite link). Funziona anche in Node.
- `public/app.js`: interfaccia, audio, ciclo di vita dell'allenamento, impostazioni.
- `public/sw.js`: service worker per l'uso offline. **A ogni modifica ai file di `public/` cambiare `CACHE` (es. `gym-timer-v3`)**, altrimenti i telefoni restano sulla versione vecchia.
- `tests/`: `npm test` esegue i test della logica e un test dell'interfaccia in jsdom con orologio e audio simulati.

## Come funziona il tempo
La posizione nella timeline (`pos`, in ms) si calcola con `Date.now()` da un'ancora (`base` + `t0`), quindi resta corretta anche se il browser rallenta i timer in background. I suoni vengono programmati in anticipo, non al momento.

## Audio (punto delicato)
Modalità in `settings.audioMode`:
- `mix`: Web Audio sopra la musica, senza abbassarla. Programma i suoni fino a 90 s in anticipo (regge il background).
- `clip`: ogni suono è una breve clip WAV generata in `renderClip()` e riprodotta con `<audio>`, per far chiedere ad Android la priorità audio e far abbassare app come Spotify. **Esperimento da verificare su telefono**: potrebbe mettere in pausa la musica invece di abbassarla.
- `duck`: `navigator.audioSession.type = 'transient'` attorno ai suoni. Pensata per iPhone/Safari; su Android Chrome non ha mostrato effetto.
- `bg`: audio silenzioso in loop + Media Session per tenere viva l'app con altre app in primo piano. Può mettere in pausa la musica.

Se `clip` non funziona, la strada solida è impacchettare la PWA con Capacitor e usare l'audio focus nativo Android (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`).

## Regole
- Testo dell'interfaccia in italiano.
- I dati dell'utente (nomi, esercizi, link condivisi) vanno sempre inseriti con `textContent` o `h()`, mai con `innerHTML`: i link vengono scambiati tra persone.
- Ogni allenamento in ingresso passa da `Core.sanitizeWorkout`.
- Schermata allenamento: deve entrare sempre nello schermo senza scroll (altezza fissa `100dvh`, dimensioni in `dvh`). Non reintrodurre `min-height` che la faccia crescere.
- Dopo ogni modifica: `npm test`.

## Pubblicazione
Cloudflare Pages collegato a questo repository: comando di build vuoto, cartella di output `public`. Ogni `git push` su `main` ripubblica.
