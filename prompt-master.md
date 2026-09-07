# PROMPT MASTER — Gioco per imparare l'inglese (il bambino, 7 anni)

## Ruolo
Sei uno sviluppatore front-end esperto in game design educativo per bambini e in didattica delle lingue per l'infanzia. Devi progettare e scrivere il codice completo di un mini-videogioco browser-based per l'apprendimento dell'inglese, con standard professionali (non un prototipo casalingo).

## Ispirazione di stile
Riferimento di gamification: **Duolingo** — non nella grafica o nei contenuti, ma nel meccanismo: mascotte simpatica sempre presente che guida e incoraggia, streak giornaliera visibile, piccoli obiettivi frequenti, tono sempre positivo mai giudicante sugli errori. Adattato a un bambino di 7 anni: mascotte più "cucciolo/compagno di avventure" che assistente, meno testo, più voce e animazioni.

## Contesto e target
- Utente finale: bambino di 7 anni, sta ancora imparando a leggere (anche in italiano).
- Interessi del bambino: mostri e creature magiche, cavalieri/eroi, battaglie fantasy, dinosauri, Pokémon, draghi.
- Obiettivo: allenamento quotidiano, breve (5-10 minuti a sessione), che costruisca vocabolario inglese e lo consolidi nel tempo con progressione.
- Dispositivo d'uso probabile: tablet. Progettare mobile-first, leggero e performante anche su hardware non recente.

## Architettura del progetto
- Niente file monolitico: struttura multi-file chiara.
  - `index.html` — struttura/markup
  - `style.css` — stile e temi visivi
  - `game.js` — logica di gioco e stato
  - `content.json` — dati didattici (parole, frasi, livelli, libri e film consigliati) separati dalla logica
  - `strings.json` — testi dell'interfaccia separati dai contenuti didattici (per future estensioni/lingue)
  - `PROGRESS.md` — stato del progetto (vedi sezione dedicata)
- No build step, no framework pesanti (niente React/Phaser): JS vanilla, deploy semplice.
- Repository su **GitHub**: storico modifiche, possibilità di rollback, ed eventuale pubblicazione futura via GitHub Pages.

## Requisiti tecnici
- Grafica moderna, colorata, animazioni CSS/Canvas leggere ma accattivanti (stile "avventura" curato, non infantile-piatto).
- Salvataggio progressi in `localStorage`, con:
  - **numero di versione nello schema dati**, per gestire in sicurezza future modifiche ai contenuti senza rompere i salvataggi esistenti;
  - funzione di **export/import** del salvataggio (file scaricabile), perché `localStorage` può essere cancellato da una pulizia cache o cambio dispositivo e i progressi non devono poter andare persi senza preavviso.
- Integrazione **ElevenLabs TTS** per la pronuncia delle parole/frasi in inglese, con **audio pre-generato e cachato come file statici** (non chiamare l'API ad ogni interazione: costi e latenza minori), e fallback su `SpeechSynthesis` del browser se un audio non è disponibile.
- **La chiave API di ElevenLabs non deve mai stare nel codice client-side** (specialmente se il progetto finisce su GitHub Pages, pubblico): prevedere un piccolo proxy/backend (es. una serverless function o Cloudflare Worker) che faccia da tramite tra il gioco e l'API, usato solo in fase di generazione degli audio, non a runtime.
- **Funzionamento offline garantito**: se il dispositivo non ha connessione, il gioco deve restare pienamente giocabile con gli audio già cacheati.
- **Asset (immagini/illustrazioni) generati offline**, non a runtime: file statici importati nel progetto, mai chiamate a servizi di generazione immagini durante il gioco.
- **Aggiornare i contenuti non deve mai rompere i salvataggi esistenti**: aggiungere nuove parole/livelli a `content.json` è un'operazione separata e sicura rispetto al progresso già salvato del bambino (si aggancia al versionamento schema sopra).
- **Privacy by design**: nessun dato del bambino inviato a servizi esterni oltre allo stretto necessario per l'audio; nessun tracciamento comportamentale nascosto.
- Ottimizzazione peso asset (immagini in WebP, audio compresso) per caricamento rapido su tablet.
- Testare concretamente su tablet reali (Safari iOS incluso), non solo su browser desktop durante lo sviluppo.

## Meccaniche di gioco
- Ambientazione ampia da "mondo di creature ed esplorazione": un'isola/regno fantasy dove convivono draghi, dinosauri e mostri magici originali (non riprodurre personaggi Pokémon esistenti per motivi di copyright — ispirarsi solo alla meccanica "scopri, colleziona, fai crescere le tue creature" con design originali).
- **Mascotte guida**: un personaggio simpatico e carino (drago/mostro cucciolo, in stile Duolingo ma con la propria identità originale) che accompagna il bambino con la voce durante tutto il gioco, dal primo avvio a ogni sessione successiva — aumenta l'attaccamento e la sensazione di "gioco vero" rispetto a un'app didattica anonima.
- **Evoluzione della mascotte**: il compagno cambia leggermente aspetto (accessori, dimensione, dettagli) man mano che il bambino avanza nei livelli, per dare un senso di crescita condivisa, non solo di punteggio che sale.
- Mix di mini-giochi brevi e variegati che si alternano per non annoiare: abbinamento parola-immagine, ascolto e ripetizione, drag&drop, quiz a scelta multipla con audio, "caccia alla parola".
- Sistema a livelli/mondi sbloccabili, con ricompense visive (non aggressive, no timer stressanti).
- **Modalità "ripasso libero"**: oltre alla progressione lineare, il bambino può rigiocare in qualsiasi momento le fasi già sbloccate, per puro divertimento/consolidamento.
- **Ripetizione spaziata**: le parole sbagliate devono ripresentarsi prima, quelle indovinate ripetutamente più raramente (logica tipo spaced repetition semplificata).
- **Nessun "game over"**: gli errori portano solo a una ripetizione gentile del contenuto, mai a un fallimento che scoraggia.
- **Varianti nei feedback**: 2-3 suoni/animazioni diverse a rotazione per le risposte corrette, non sempre la stessa, per non stancare in un uso quotidiano.
- **Limite di sessione gentile**: dopo un certo numero di minuti (configurabile, default 10) il gioco propone di fermarsi con un messaggio positivo ("Ci vediamo domani, [nome]!"), senza bloccare forzatamente. La durata effettiva è impostata dai genitori (vedi sezione Parental Control).
- Onboarding iniziale **senza testo da leggere**: tutorial guidato solo con audio e icone, dato che il bambino non legge ancora in autonomia.
- **Album/collezione delle creature**: schermata dedicata dove vedere tutte le creature scoperte, con quelle non ancora sbloccate mostrate "in ombra" — leva di ritorno forte per un bambino di questa età.
- **Missione del giorno**: un piccolo obiettivo diverso ogni giorno (es. "trova 3 animali", "ripeti 5 parole al drago"), così ogni accesso ha un motivo specifico e non è sempre uguale al precedente.

## Lingua
- **Interfaccia e istruzioni di navigazione: in italiano** (il bambino deve orientarsi da solo).
- **Contenuto didattico (parole, frasi, audio da imparare): in inglese.**
- Non mischiare le due cose nello stesso elemento di UI, per non creare confusione.
- Codice e commenti: in italiano, salvo termini tecnici standard.

## Progressione didattica (fondamentale)
1. **Fase 1 — Vocabolario per immagini/audio**: parole singole con supporto audio (pronuncia ElevenLabs), niente lettura obbligatoria, riconoscimento visivo+sonoro.
2. **Fase 2 — Parole scritte brevi**: introduzione progressiva della forma scritta accanto a immagine+audio, mano a mano che il bambino consolida.
3. **Fase 3 — Frasi semplici**: piccole frasi/dialoghi guidati, sempre con audio.
4. **Fase 4 — Mini-ebook originali progressivi (graded reader)**: invece di consigliare libri esistenti, il programma tiene traccia di quale "mini-libro" andrebbe generato per il livello raggiunto. Ogni mini-ebook deve essere scritto come **graded reader**: pochissime parole nuove per pagina, uso volontariamente ripetuto solo del vocabolario/frasi già sbloccati nel gioco (pescati da `content.json`), frasi cortissime, coerente col tema fantasy/avventura del gioco. Va generato uno alla volta (non tutti insieme), con Claude, e inviato su Kindle via Send-to-Kindle — stesso workflow già collaudato per altre collane di ebook per il bambino.
5. **Fase 5 — Consigli audiovisivi**: suggerimenti di cartoni/film in inglese con sottotitoli (in italiano o inglese a seconda del livello), progressivi per complessità linguistica.
   - Nota: sia il tracciamento dei mini-ebook generati sia i consigli audiovisivi vanno presentati in una sezione "per i genitori" (pannello/schermata dedicata), non come contenuto che il bambino deve gestire da solo.

## Qualità percepita ("professionale", non casalingo)
- Coerenza visiva degli asset: stile illustrativo unico e palette coerente per tutte le immagini (evitare mix di clipart diverse tra loro).
- Font ad alto contrasto e dimensioni generose, testo a schermo ridotto al minimo indispensabile.
- Feedback sonoro oltre alla pronuncia: suoni di conferma/errore e una musica di sottofondo leggera, per dare sensazione di gioco vero e non di tool didattico silenzioso.

## Parental Control
Sezione protetta, separata dal gioco vero e proprio, pensata per essere gestita solo dai genitori.
- **Accesso protetto da PIN semplice** (4 cifre, impostato al primo avvio): non è una vera misura di sicurezza informatica, serve solo a impedire che un bambino di 7 anni ci entri per sbaglio o apposta — va comunicato onestamente questo limite, non presentarlo come "sicuro".
- **Durata sessione configurabile**: i genitori impostano quanti minuti al giorno il gioco resta accessibile prima del messaggio di chiusura gentile (default 10, modificabile).
- **Fasce orarie/giorni consentiti** (opzionale): possibilità di impostare, ad es., "solo dopo le 16:00" o "non nei weekend", per allinearsi alle regole familiari sullo screen time.
- **Attivazione/disattivazione contenuti**: i genitori possono abilitare o mettere in pausa singole fasi didattiche o temi (es. nascondere temporaneamente la fase mini-ebook, o disattivare una categoria di creature se troppo stimolante prima di dormire).
- **Pausa "vacanza"**: sospendere temporaneamente l'intero gioco senza perdere i progressi salvati (utile per periodi di stop, es. vacanze o malattia).
- Tutte le impostazioni di Parental Control vivono nello stesso `localStorage` versionato del resto del progresso (nessun backend necessario), e includono anche quanto già previsto: streak giornaliera, parole padroneggiate, accuratezza, e il campo email Send-to-Kindle per l'invio dei mini-ebook.

## Contenuti e sicurezza
- Nessuna pubblicità, nessun contenuto esterno non controllato, tutto kid-safe.
- Testi e temi adatti a un bambino di 7 anni, tono positivo e incoraggiante, mai punitivo sugli errori.

## Output atteso
- Codice completo, funzionante e commentato, organizzato nei file descritti in "Architettura del progetto".
- `content.json` popolato con un primo set di parole/frasi per fase, un piano dei primi mini-ebook da generare (temi/livelli) e una prima lista di film/cartoni consigliati con relativa fascia di livello.
- Punto di configurazione chiaro per l'endpoint proxy di ElevenLabs (nessuna chiave hardcoded nel client).

## Fuori scope per la v1 (esplicito, per non deragliare)
- Niente multiplayer, niente chat, niente generazione di contenuti AI in tempo reale dentro al gioco (tutto pre-generato offline).
- Niente riconoscimento vocale in v1 (vedi roadmap: l'accuratezza dello speech recognition su voci di bambini è oggi bassa e rischia di frustrare più che aiutare).
- Niente multi-lingua dell'interfaccia oltre italiano/inglese (la separazione `strings.json` resta comunque come buona pratica strutturale, non come feature da costruire ora).

## Vincoli di stile
- Codice pulito, leggibile, facilmente estendibile (per aggiungere nuove parole/livelli in futuro senza riscrivere la logica).
- Priorità a originalità e varietà delle meccaniche rispetto alla ripetitività da "flashcard app".

## Tracciamento del progetto (PROGRESS.md)
- Crea e mantieni automaticamente un file `PROGRESS.md` accanto al codice, da aggiornare a ogni modifica sostanziale.
- Deve contenere: stato attuale del progetto, elenco funzionalità implementate, elenco contenuti didattici presenti (parole/frasi per fase, mini-ebook generati, film/cartoni consigliati con livello), decisioni tecniche prese, un **changelog con data** per ogni iterazione, e una sezione "prossimi passi / idee future" per eventuali espansioni o integrazioni.
- Scopo: permettere di riprendere il lavoro in qualsiasi momento (anche in sessioni/chat diverse) restando allineati sullo stato del progetto senza dover rileggere tutto il codice.
- Ad ogni richiesta di modifica o aggiunta, aggiorna prima il PROGRESS.md e poi il codice, così il file resta sempre lo specchio fedele dello stato reale.

## Roadmap futura (non essenziale per la v1, ma da tenere a mente)
- PWA installabile con funzionamento offline (come già fatto per Lumimondo Adventure).
- Dashboard genitori più ricca, con grafici dei progressi nel tempo.
- Sistema di badge/achievement per motivare nel lungo periodo.
- Supporto multi-profilo, se in futuro servisse per più bambini.
- **Invio automatico via email** dei mini-ebook generati all'indirizzo Send-to-Kindle inserito in dashboard (per ora si genera e invia manualmente, come già fatto per altre collane di ebook).
- Riconoscimento vocale per esercizi di pronuncia attiva, quando la tecnologia sarà più affidabile su voci di bambini.
- Accessibilità cromatica (palette leggibile anche in caso di daltonismo).
- Playtest periodico osservando l'uso reale di il bambino, con aggiustamenti conseguenti — processo da ripetere, non una feature una tantum.
- Definire criteri di successo del progetto (es. uso quotidiano continuativo per 2 settimane, numero di parole acquisite) per valutare oggettivamente se sta funzionando.

## Fase 2 — Da valutare dopo aver visto la reazione di il bambino alla v1
Idee volutamente escluse dalla v1 per non allungare troppo il primo sviluppo — da riconsiderare solo dopo aver osservato l'uso reale:
- **Micro-narrativa a episodi**: una storia che avanza a piccoli capitoli (breve scenetta ogni 3-4 livelli), per dare motivo di tornare a "vedere cosa succede dopo".
- **Base/tana personale**: uno spazio "suo" (grotta, accampamento) da decorare con le ricompense guadagnate — senso di possesso oltre che di progresso.
- **Sorprese casuali**: creature rare o scrigni bonus non prevedibili, per rompere la prevedibilità delle ricompense.
- **Condivisione asincrona in famiglia**: es. "manda un disegno/risultato a papà" — un ponte leggero verso il coinvolgimento familiare, senza la complessità di un vero multiplayer.
- **Registrazione della propria voce** (senza valutazione automatica): il bambino si registra e si riascolta per gioco, piacere di "sentirsi parlare inglese" — versione leggera del riconoscimento vocale, che resta comunque fuori scope come funzione valutativa.
