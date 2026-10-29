# Gym Timer

Timer a intervalli per allenamenti (HIIT, Tabata, circuiti, round di boxe), installabile come app e utilizzabile offline.

## Provarla sul computer
```
npm install      # solo la prima volta (serve per i test)
npm run serve    # poi apri http://localhost:8000
npm test         # test della logica e dell'interfaccia
```

## Pubblicarla con Cloudflare Pages e GitHub
1. Crea un repository su GitHub e carica il contenuto di questa cartella:
   ```
   git init
   git add .
   git commit -m "Prima versione"
   git branch -M main
   git remote add origin <URL-del-repository>
   git push -u origin main
   ```
2. In Cloudflare, in **Workers & Pages**, crea un progetto **Pages** collegato al repository GitHub.
3. Impostazioni di build: **comando di build vuoto**, **cartella di output `public`**.
4. In **Custom domains** del progetto aggiungi il sottodominio, ad esempio `timer.tuodominio.it`.
5. Da questo momento ogni `git push` ripubblica il sito. Prima di ogni push cambia la versione in `public/sw.js` (`gym-timer-v2`, `v3`, ...).

I nomi dei pulsanti di Cloudflare possono cambiare nel tempo.

## Installazione sui telefoni
- Android (Chrome): menu ⋮ → «Installa app».
- iPhone (Safari): Condividi → «Aggiungi alla schermata Home».

## Prova dell'audio con la musica
Impostazioni → «Audio e musica di altre app». Per ogni modalità: avvia la musica, torna all'app, premi «Prova suono e voce», poi lancia un Tabata passando all'app della musica e tornando.

| Modalità | Cosa fa |
|---|---|
| Affiancato | Suoni sopra la musica, volume invariato |
| Abbassa la musica (Android) | Suoni come clip audio: può far abbassare Spotify (da verificare) |
| Abbassa la musica (iPhone) | Sessione audio di Safari |
| Background garantito | Tiene viva l'app con altre app aperte; può mettere in pausa la musica |

## Lavorare con Claude Code
Apri questa cartella con Claude Code: il file `CLAUDE.md` gli spiega com'è fatto il progetto e le regole da rispettare.
