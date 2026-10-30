# Thaimer

PWA statica (HTML/CSS/JS vanilla, nessuna build) con timer a intervalli per allenamenti. Pubblicata su Cloudflare Pages dalla cartella `public/`. Uso personale e distribuzione agli iscritti di una palestra, in gran parte su Android. La stessa cartella `public/` è anche incapsulata in un'app Android con Capacitor (`android/`).

## Struttura
- `public/core.js`: logica pura, senza DOM (timeline delle fasi, generazione di suoni e annunci, condivisione tramite link). Funziona anche in Node.
- Catalogo «Modelli» (`Core.MODELS`, per categoria, nella schermata `#models` di `app.js`): non entra nella lista dell'utente finché non preme «Aggiungi»; toccandolo parte al volo. Ogni allenamento ha `color` (0-5, tavolozza `--c0…--c5` in `style.css`) che dà la striscia colorata sulla scheda; `color` viaggia anche nel link condiviso (campo `c`, opzionale). Un nuovo modello deve passare il test «modelli» di `test_core.js` (limiti, durata, annunci).
- Navigazione: barra in basso (`#tabbar`) con Preferiti (la home, i timer dell'utente), Modelli e Impostazioni (apre il dialog), visibile solo in home e Modelli; in alto logo, cerca (`.js-search`, filtra per nome) e `+ Nuovo`. Il tasto indietro del telefono funziona con la cronologia: `show()` aggiunge **una sola** voce (`leaf`) quando si lascia la home e il `popstate` torna ai Preferiti (in allenamento chiede conferma); dai Preferiti non intercettiamo nulla, quindi Capacitor chiude l'app. Da verificare su telefono.
- `public/app.js`: interfaccia, audio, ciclo di vita dell'allenamento, impostazioni.
- `public/sw.js`: service worker per l'uso offline. **A ogni modifica ai file di `public/` cambiare `CACHE` (es. `gym-timer-v3`)**, altrimenti i telefoni restano sulla versione vecchia.
- `android/` + `capacitor.config.json`: app Android (Capacitor 8, `webDir: public`). Codice nativo scritto da noi: `android/app/src/main/java/thaimer/app/` (`ThaimerNativePlugin` = priorità audio, schermo acceso, notifica; `ThaimerService` = servizio in primo piano). Il resto è il progetto generato da Capacitor. `android/app/src/main/assets/public` è una copia generata (ignorata da git): la crea `npm run android:sync`, e la CI prima di compilare.
- `.github/workflows/android.yml`: compila l'APK di prova a ogni push che tocca `public/` o `android/` e lo allega all'esecuzione.
- `tests/`: `npm test` esegue i test della logica e un test dell'interfaccia in jsdom con orologio e audio simulati.

## Come funziona il tempo
La posizione nella timeline (`pos`, in ms) si calcola con `Date.now()` da un'ancora (`base` + `t0`), quindi resta corretta anche se il browser rallenta i timer in background. I suoni vengono programmati in anticipo, non al momento.

## Audio (punto delicato)
Modalità in `settings.audioMode`:
- `mix`: Web Audio sopra la musica, senza abbassarla. Programma i suoni fino a 90 s in anticipo (regge il background).
- `clip`: ogni suono è una breve clip WAV generata in `renderClip()` e riprodotta con `<audio>`, per far chiedere ad Android la priorità audio e far abbassare app come Spotify. **Esperimento da verificare su telefono**: potrebbe mettere in pausa la musica invece di abbassarla.
- `duck`: `navigator.audioSession.type = 'transient'` attorno ai suoni. Pensata per iPhone/Safari; su Android Chrome non ha mostrato effetto.
- `bg`: audio silenzioso in loop + Media Session per tenere viva l'app con altre app in primo piano. Può mettere in pausa la musica.

- `native` (solo nell'app Android, predefinita lì): i suoni restano Web Audio programmati in anticipo (90 s) come in `mix`, ma il plugin nativo chiede l'audio focus `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` intorno a ogni suono (`duckAt`, con timer dell'Handler nativo: non soffrono il rallentamento dei timer della pagina) e intorno alla voce. **Da verificare su telefono con Spotify**: l'app musicale potrebbe andare in pausa invece di abbassarsi (allora c'è sempre `mix`).

Nell'app le modalità `clip`, `duck` e `bg` sono nascoste, e `native` è nascosta sul web (`data-only` in `index.html`). `Native` in `app.js` è il ponte verso il plugin: sul web non fa nulla, quindi il codice resta unico.

### App Android
- **La voce nell'app passa da `TextToSpeech` di Android** (`speak`/`speakStop` del plugin), non da `speechSynthesis`: nella WebView non parla. Il plugin abbassa la musica da solo mentre parla (solo in modalità `native`). Serve `<queries>` per `TTS_SERVICE` nel manifest (Android 11+).
- `navigator.vibrate` nella WebView richiede il permesso `VIBRATE` nel manifest.
- Dentro l'app non c'è service worker (i file sono nell'APK) e `location.origin` è `https://localhost`: i link di condivisione usano `SITE_URL` in `app.js` (`https://thaimer.pherio.net/`, il sito su Cloudflare Pages).
- Un servizio in primo piano (con notifica Pausa/Termina) e il blocco della CPU durano quanto l'allenamento. La notifica richiede il permesso su Android 13+ (chiesto al primo avvio).
- L'ID del pacchetto è `thaimer.app`; una volta pubblicata sul Play Store non si cambia più.
- Firma: se nei segreti di GitHub ci sono `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, la CI firma con quella chiave sia l'APK di prova sia il `.aab` per il Play Store (allegato `thaimer-release-aab`); `versionCode` = numero dell'esecuzione. Senza segreti l'APK usa una chiave di debug diversa a ogni esecuzione (per aggiornare bisogna disinstallare). Il keystore non va MAI nel repository e va conservato dall'utente: perso quello, niente più aggiornamenti.
- Dopo una modifica al codice nativo o alla struttura di `android/` controlla che la CI sia verde: l'SDK Android non è disponibile negli ambienti cloud, la compilazione si prova lì.

## Regole
- Testo dell'interfaccia in italiano.
- I dati dell'utente (nomi, esercizi, link condivisi) vanno sempre inseriti con `textContent` o `h()`, mai con `innerHTML`: i link vengono scambiati tra persone.
- Ogni allenamento in ingresso passa da `Core.sanitizeWorkout`.
- Schermata allenamento: deve entrare sempre nello schermo senza scroll (altezza fissa `100dvh`, dimensioni in `dvh`). Non reintrodurre `min-height` che la faccia crescere.
- Dopo ogni modifica: `npm test`. Il test dell'interfaccia simula anche l'app Android (`boot({ native: true })` con un finto `window.Capacitor`).

## Pubblicazione
Cloudflare Pages collegato a questo repository: comando di build vuoto, cartella di output `public`. Ogni `git push` su `main` ripubblica.
