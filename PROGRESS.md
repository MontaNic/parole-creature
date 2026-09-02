# PROGRESS — Draghetti & Parole (gioco inglese per Pietro)

> Questo file e' lo specchio dello stato reale del progetto.
> Va aggiornato **prima** di ogni modifica sostanziale al codice.

## Stato attuale

**v1.1.0 — curriculum progressivo.**
Mascotte: **Pepe**, una cucciola di Jack Russell. Interfaccia in italiano,
contenuti in inglese.

Rispetto alla v1.0.0, `content.json` non e' piu' un elenco di parole per tema:
e' un corso a 8 unita', ognuna con un obiettivo linguistico dichiarato, con
revisione sistematica delle unita' precedenti e una soglia di padronanza da
superare per cambiare fase.

**Audio generato**: 113 tracce ElevenLabs, 2,5 MB. Il gioco ora parla con voci
vere, non piu' con la sintesi del browser.

Non ancora fatto: playtest reale con Pietro su tablet, design system e nuove
immagini (messaggi 2 e 3).

## Come si avvia

```bash
python3 -m http.server 8080     # dalla cartella del progetto
# gioco:            http://localhost:8080
# test logica:      http://localhost:8080/tools/curriculum-test.html
# test di sfoglio:  http://localhost:8080/tools/smoke-test.html
```

---

# Logica del curriculum

## Il problema che risolve

La v1.0.0 raggruppava le parole per tema (creature, colori, numeri...). Un tema
non e' un obiettivo: alla fine di "colori" il bambino sapeva otto parole, ma non
sapeva *dire* niente. E la progressione era solo un contatore: finito un mondo,
si apriva il successivo, indipendentemente da quanto fosse rimasto.

Il curriculum v1.1.0 cambia tre cose.

## 1. Ogni unita' ha un obiettivo linguistico, non un tema

Ogni unita' insegna una **struttura** oltre al lessico, dichiarata in
`content.json` sotto `structures` e collegata all'unita' con `structureIds`.
La progressione delle strutture e' costruita sulle difficolta' specifiche di un
bambino *italiano*, non su un ordine generico:

| # | Unita' | Struttura | Perche' proprio qui |
|---|--------|-----------|---------------------|
| 1 | Valle dei Draghi | `What is it? — A dragon.` | E' la formula che il gioco stesso usa per interrogarlo: impararla subito rende trasparente tutto il resto |
| 2 | Giungla dei Dinosauri | `It's a tooth / It's an egg` | L'articolo che cambia davanti a vocale non esiste in italiano: va sentito molto prima di poterlo spiegare |
| 3 | Grotta dei Colori | `It's a red egg.` | **Il colore va prima del nome.** E' l'errore piu' duraturo degli italiani (*a dragon red*): si previene come formula, non si corregge dopo |
| 4 | Montagna dei Numeri | `How many? — Three.` | I numeri restano lettera morta se non hanno una domanda che li chiama |
| 5 | Foresta delle Parole | `This is a cat / These are cats` | La **-s** del plurale e' quasi impercettibile all'orecchio italiano: si introduce quando la parola scritta la rende visibile |
| 6 | Lago Magico | `The cat is small / The cats are small` | Prima vera regola del corso (**is/are**), e arriva solo dopo che singolare e plurale sono gia' familiari all'occhio |
| 7 | Ponte delle Frasi | `I have a sword / I can see a monster` | Primo passo dal riconoscere al dire qualcosa di proprio |
| 8 | Torre dei Dialoghi | `Is it red? — Yes, it is.` | Chiude il cerchio: usa la struttura con cui il gioco lo interroga dall'unita' 1 |

Le fasi restano tre e definiscono **come** si presenta il materiale, non cosa:

- **Fase 1 — Ascolto e riconoscimento.** La parola scritta non compare mai. Le
  strutture entrano come formule intere, ascoltate e indicate.
- **Fase 2 — La parola scritta.** Rende visibile cio' che l'orecchio ha gia'
  imparato, e usa la scrittura per mostrare quello che l'audio nasconde.
- **Fase 3 — Frasi e mini-dialoghi.** Si costruisce, non si riconosce soltanto.

Un vincolo concreto che ha guidato le scelte: le frasi dell'unita' 3 usano le
**uova colorate** (`It's a red egg`) e non i draghi, perche' i distrattori sono
le altre uova colorate. Cosi' per rispondere bisogna ascoltare *sia* il colore
*sia* il nome. Con un drago verde e la frase "a red dragon" l'immagine avrebbe
contraddetto l'audio.

## 2. Ogni unita' ripassa sistematicamente le precedenti

Ogni unita' dichiara `reviewFrom`: le unita' da cui pescare il ripasso. Una
partita di 8 domande e' composta da **~5 domande nuove + ~3 di ripasso**
(`curriculum.reviewWeight`, 0.35; 0.45 nelle ultime due unita', che hanno poco
materiale nuovo e molto da consolidare).

Le domande di ripasso non vengono accodate in fondo ma **distribuite** fra
quelle nuove (`interleave()` in `game.js`): alternare fa lavorare il richiamo,
metterle tutte alla fine no.

Perche' serviva, visto che c'era gia' la ripetizione spaziata: la SRS *ordina*
dentro un insieme di item, ma non decide quale insieme entra nella partita. Con
la sola SRS, giocando l'unita' 4 le parole dell'unita' 1 non sarebbero mai
ricomparse — nessun meccanismo le avrebbe rimesse sul tavolo. Le due cose
lavorano su piani diversi e servono entrambe.

## 3. Per cambiare fase serve padronanza dimostrata

Il gioco distingue **tre** stati, ed e' la distinzione che regge tutto:

| Stato | Significato | A cosa serve |
|-------|-------------|--------------|
| **visto** | comparso almeno una volta | statistiche |
| **completato** | ogni item dell'unita' indovinato almeno una volta | sblocca la creatura-ricompensa e l'unita' successiva |
| **padroneggiato** | box 3 della SRS: indovinato **piu' volte, in giorni diversi** | sblocca la **fase** successiva |

"Completato" e' generoso apposta: nessun bambino deve restare bloccato.
"Padroneggiato" e' severo apposta: cambiare fase deve significare che la fase
precedente regge davvero.

Per aprire una fase serve l'**80%** degli item della fase precedente
padroneggiati (`curriculum.phaseUnlockRatio`). Con la fase 1 a 50 item, servono
40 parole solide.

### Il dettaglio che rende la soglia reale

La soglia non varrebbe nulla se fosse aggirabile in una sessione fortunata.
Due modifiche alla SRS la rendono seria:

1. **`srsIntervals` parte da 1 e non da 0.** Un item promosso oggi non e' piu'
   "scaduto" fino a domani.
2. **`recordAnswer` promuove solo se l'item era scaduto.** Se una parola
   ricompare due volte nella stessa partita e viene indovinata entrambe le
   volte, il box sale una volta sola.

Conseguenza voluta: **il box sale al massimo una volta al giorno per item**,
quindi "padroneggiato" (box 3) implica almeno 3 giorni distinti. La fase 1
richiede realisticamente 5-7 giorni di gioco quotidiano. E' esattamente il ritmo
per cui il gioco e' pensato — 10 minuti al giorno — non un ostacolo.

L'errore invece retrocede sempre e subito al box 0: se sbagli, sbagli.

### Perche' un cancello non blocca il bambino

Un gate rigido rischia il muro. Tre valvole di sfogo:

- le unita' **dentro** la fase restano tutte aperte e rigiocabili;
- il **ripasso libero** pesca proprio dagli item non ancora solidi
  (`freeReviewPool`), quindi giocarci fa avanzare la soglia;
- un'unita' si apre anche dopo **3 partite**, non solo completandola: una
  singola parola ostica non blocca il percorso;
- i genitori hanno un interruttore **"Sblocca tutte le fasi"** che scavalca la
  soglia, se Pietro e' gia' piu' avanti o se una fase lo sta annoiando.

E soprattutto: la mappa mostra la barra di padronanza della fase **con una tacca
all'80%**, e Pepe dice quante parole mancano. Un traguardo visibile e' un
obiettivo; un cancello muto e' una frustrazione.

### Le due voci

Il progetto usa **due** voci ElevenLabs, con ruoli separati:

| Voce (`.env`) | Ruolo | Tracce | Caratteri |
|---|---|---|---|
| `VOICE_ID_ENGLISH` | modello di pronuncia: tutto il contenuto didattico inglese | 89 (51 parole + 38 frasi) | 893 |
| `VOICE_ID_NARRATOR` | Pepe: battute italiane, accoglienza, istruzioni | 24 | 917 |

La separazione non e' estetica. Al bambino deve bastare il **timbro** per
capire se quello che sente e' inglese da imparare o italiano da capire:
cambiare voce e' il segnale piu' immediato che esista, e non richiede lettura.

Per lo stesso motivo **non** c'e' una terza voce. L'unico caso di confine e'
`p_my_name` ("My name is Pepe."), dove la mascotte si presenta in inglese:
resta sulla voce inglese perche' e' contenuto dell'unita' 8, cioe' una
pronuncia da **imitare**, non una narrazione da ascoltare. Una terza voce
annacquerebbe la regola in cambio di poco.

I parametri di sintesi cambiano per tipo di traccia: le parole singole vanno a
`stability 0.70, style 0` perche' sono un modello e devono suonare identiche a
ogni riascolto; le battute di Pepe restano piu' calde (`0.45, style 0.25`).

Le due battute con segnaposto (`session_end` con `{name}`, `locked_phase` con
`{n}`) non sono pre-generabili come sono: `strings.mascotSpoken` contiene la
forma neutra da registrare. Il fumetto continua a mostrare il nome del bambino,
l'audio resta nella voce di Pepe. Meglio la voce vera senza il nome che una
voce robotica col nome.

### Parametri, tutti in un posto

Stanno in `content.json` sotto `curriculum`, non nel codice:

```json
"masteryBox": 3, "unitMasteryRatio": 0.8, "phaseUnlockRatio": 0.8,
"reviewWeight": 0.35, "minReviewItems": 2, "maxBuildWords": 6
```

Le regole che li applicano stanno tutte in `js/curriculum.js`.

---

## Architettura

```
index.html               markup e schermate
style.css                stile, temi, animazioni
game.js                  avvio, navigazione, composizione della partita, clock di sessione
js/config.js             configurazione tecnica (intervalli SRS, parametri di gioco)
js/curriculum.js         REGOLE DIDATTICHE: padronanza, sblocchi, mix nuovo/ripasso
js/state.js              localStorage versionato, migrazioni, export/import, PIN, orari
js/content-loader.js     caricamento content.json / strings.json / sprite SVG
js/audio.js              mp3 pre-generati -> SpeechSynthesis, SFX e musica sintetizzati
js/srs.js                ripetizione spaziata (Leitner, promozione a cadenza giornaliera)
js/mascot.js             Pepe: disegno SVG, evoluzione, battute vocali
js/effects.js            coriandoli / stelle / bolle su canvas + toast
js/minigames.js          i 6 mini-giochi
js/missions.js           missione del giorno (deterministica dalla data)
js/screens.js            home a blocchi di fase, album, riepilogo, onboarding, blocco
js/parents.js            area genitori con PIN e 5 pannelli
content.json             il curriculum (unita', strutture, lessico, frasi, ricompense)
strings.json             testi UI in italiano
assets/img/sprites.svg   81 illustrazioni in un solo file
assets/audio/index.json  elenco degli mp3 realmente presenti
sw.js                    cache offline
tools/generate-audio.mjs generazione offline degli audio
tools/curriculum-test.html  test delle regole didattiche
tools/smoke-test.html    test di sfoglio automatico
proxy/cloudflare-worker.js  proxy che custodisce la chiave ElevenLabs
```

## Funzionalita' implementate

- [x] Curriculum a 8 unita' con obiettivo linguistico esplicito e strutture dichiarate
- [x] Revisione sistematica delle unita' precedenti, distribuita dentro la partita
- [x] Soglia di padronanza (80%) per il passaggio di fase, con padronanza non accumulabile in un giorno
- [x] Mappa raggruppata per fasi, con barra di padronanza e tacca della soglia
- [x] Interruttore genitori per scavalcare la soglia
- [x] Onboarding senza testo da leggere (voce + icone, con tutorial giocato)
- [x] Mascotte Pepe che parla, si anima e evolve in 4 stadi (livelli 1/4/8/13)
- [x] 6 mini-giochi: abbinamento, ascolta e ripeti, quiz audio, caccia alla parola,
      trascina la parola, ricomponi la frase (solo su frasi fino a 6 parole)
- [x] Modalita' ripasso libero, che punta agli item non ancora solidi
- [x] Ripetizione spaziata (Leitner a 6 box)
- [x] Nessun game over: l'errore riporta all'ascolto e si riprova
- [x] 3 varianti a rotazione di suono + animazione per la risposta giusta
- [x] Album creature: 12 creature, quelle non trovate in silhouette
- [x] Missione del giorno (8 tipi) e streak giornaliera
- [x] Limite di sessione gentile (default 10 min, mai bloccante)
- [x] Area genitori con PIN, orari, giorni, fasi, temi, pausa vacanza
- [x] Dashboard con avanzamento per fase e per unita', obiettivi e strutture
- [x] Pannello mini-ebook con prompt di generazione pronto da copiare
- [x] Export/import del salvataggio su file JSON
- [x] Audio pre-generato con fallback su sintesi vocale del browser
- [x] Funzionamento offline (service worker)
- [x] Due suite di test (`tools/curriculum-test.html`, `tools/smoke-test.html`)

## Contenuti didattici presenti

**89 item totali** distribuiti su 8 unita': 51 parole e 38 frasi.

| Fase | Unita' | Item | Struttura insegnata |
|------|--------|------|---------------------|
| 1 | Valle dei Draghi | 8 parole + 3 frasi | `What is it?` |
| 1 | Giungla dei Dinosauri | 9 parole + 4 frasi | `a` / `an` |
| 1 | Grotta dei Colori | 8 parole + 4 frasi | aggettivo prima del nome |
| 1 | Montagna dei Numeri | 10 parole + 4 frasi | `How many?` |
| 2 | Foresta delle Parole | 8 parole + 5 frasi | `this` / `these`, plurale -s |
| 2 | Lago Magico | 8 parole + 6 frasi | `is` / `are` |
| 3 | Ponte delle Frasi | 6 frasi | `I have` / `I can see` |
| 3 | Torre dei Dialoghi | 6 frasi | domanda e risposta breve |

Lessico: creature fantasy, parti del corpo dei dinosauri, 8 colori, numeri 1-10,
animali e natura, 8 aggettivi.

**Creature dell'album (12)**: Pepe, Fiammino, Codasso, Prisma, Numo, Rametto,
Sciazzo, Baluce, Torrek, Stellina (**premio per aver superato la fase 1**),
Umbra (25 parole padroneggiate), Aladoro (7 giorni di streak).

**Fase 4 — mini-ebook pianificati (6, nessuno ancora generato)**: allineati alle
strutture delle unita' che li sbloccano, cosi' il libretto ripassa esattamente
quello che il gioco ha appena insegnato.

| # | Titolo | Si sblocca dopo | Strutture |
|---|--------|-----------------|-----------|
| 1 | Pepe and the Red Egg | Valle dei Draghi | `What is it?` |
| 2 | The Dinosaur with One Horn | Giungla dei Dinosauri | `a`/`an` |
| 3 | Colors in the Cave | Grotta dei Colori | aggettivo + nome |
| 4 | Ten Little Stars | Montagna dei Numeri | `How many?` |
| 5 | The Happy Knight | Foresta delle Parole | `this/these`, `is/are` |
| 6 | Hello, Friend! | Ponte delle Frasi | `I have`, domande |

**Fase 5 — audiovisivi (6)**, riancorati alle fasi invece che a livelli generici.

## Decisioni tecniche prese

- **ES modules senza build step.** Serve un server statico locale: i browser
  bloccano `fetch` su `file://`.
- **Le regole didattiche stanno in un modulo solo** (`js/curriculum.js`), per
  poter cambiare la didattica senza rovistare nella UI o nei mini-giochi.
- **I parametri del curriculum stanno in `content.json`**, non nel codice.
- **Gli id di parole, frasi e unita' sono permanenti.** Il progresso e'
  indicizzato per id: rinominarne uno equivale a cancellare quello che il
  bambino ha imparato su quell'item. Si aggiunge, non si rinomina.
- **I plurali sono composti riusando i simboli singolari** (`<use>` annidati in
  `sprites.svg`): nessun disegno nuovo, e il plurale resta visibilmente "la
  stessa cosa, ma tante" — esattamente il contrasto che serve per la -s.
- **Un solo sprite SVG** iniettato nel DOM al boot, usato con `<use href="#id">`.
- **Effetti sonori e musica generati con Web Audio API**, non file.
- **La chiave ElevenLabs non tocca mai il client**: sta nel Worker o nel `.env`
  locale, e la usa solo lo script offline.
- **PIN con hash SHA-256**, con il limite dichiarato apertamente nell'interfaccia.

## Changelog

- **2026-09-02** — Scaffold iniziale del progetto.
- **2026-09-03** — Build v1.0.0 completa. Verificata con test di sfoglio
  automatico (0 errori su ~250 tocchi casuali) e screenshot su viewport tablet.
  Corretti: tocchi fuori sequenza nella caccia alla parola, doppio esito nel
  drag&drop, anatomia di Pepe e del mostro nello sprite.
- **2026-09-03** — **v1.1.0, curriculum progressivo.** `content.json`
  ristrutturato come corso a 8 unita' con obiettivi linguistici espliciti,
  strutture dichiarate, `reviewFrom` per la revisione sistematica e parametri
  del curriculum. Nuovo modulo `js/curriculum.js`. SRS con promozione a cadenza
  giornaliera. Mappa raggruppata per fasi con soglia visibile. Dashboard
  genitori con obiettivi e strutture per unita'. Nuova suite
  `tools/curriculum-test.html` (23 controlli, tutti superati). 6 nuovi sprite
  (occhio + 5 plurali composti). Contenuti passati da 62 a 89 item.
- **2026-09-03** — Spostata in `.env` la chiave ElevenLabs che era finita in
  `.env.example` (file tracciato da git). Verificato: nessun segreto nei file
  tracciati ne' nella storia.
- **2026-09-03** — **Due voci distinte** (`VOICE_ID_ENGLISH`,
  `VOICE_ID_NARRATOR`) al posto di una generica. Parametri di sintesi tarati
  per tipo di traccia. Aggiunto `strings.mascotSpoken` per le due battute con
  segnaposto, che prima non venivano generate affatto e finivano alla sintesi
  del browser. Nuovi flag `--plan` e `--dry-run` con riepilogo per voce.
- **2026-09-03** — **Mascotte rinominata da Zibo a Pepe** e ridisegnata: non
  piu' un cucciolo di drago ma una **cucciola di Jack Russell**, bianca con
  orecchio nero, orecchio e macchia marroni sull'occhio. Rinominati anche
  `sp-zibo` -> `sp-pepe` e `c_zibo` -> `c_pepe`; riposizionati i tre accessori
  dell'evoluzione (bandana, cappello a punta, corona) sulla nuova testa;
  ridisegnata `assets/img/icon.svg`. Accordo al femminile nelle due battute in
  cui Pepe parla di se' ("Sono contenta", "Sono cresciuta").
- **2026-09-03** — **Generate tutte le 113 tracce audio**: 89 inglesi
  (`VOICE_ID_ENGLISH`, 1,6 MB) e 24 italiane (`VOICE_ID_NARRATOR`, 1,1 MB),
  2,5 MB totali, 23 kB di media. Zero errori. Verificato: tutti file MP3
  validi, nessuno vuoto, `assets/audio/index.json` allineato a 113 voci,
  nessuna traccia attesa mancante.
  Due problemi risolti durante la generazione:
  (1) tutte e 113 le richieste fallivano con `fetch failed` per un proxy TLS
  che rifirma i certificati — `curl` funzionava, Node no, perche' usa un
  proprio elenco di CA; lo script ora fa un preflight e si rilancia da solo
  con `--use-system-ca`;
  (2) `playFile` in `js/audio.js` non aveva timeout: se `ended` non fosse mai
  arrivato, il mini-gioco sarebbe rimasto appeso in attesa. Ora c'e' un tetto
  massimo basato sulla durata della traccia.

## Prossimi passi

1. **Design system** (font a tema, palette, componenti) → `design-system.md`.
2. **Pipeline immagini** con Gemini Imagen 4 Fast + rembg per lo sfondo
   trasparente, con validazione dello stile su 3-4 campioni prima del batch.
3. **Riascoltare le 113 tracce generate** e rigenerare quelle che non
   convincono (`--force` dopo aver cancellato il file, oppure cambiare voce
   in `.env` e rilanciare).
4. **Playtest con Pietro su tablet**, osservando senza suggerire. Da guardare:
   capisce l'onboarding da solo? nota la differenza fra `a` e `an`? la soglia di
   fase lo motiva o lo blocca?
5. **Testare su Safari iOS reale**: sblocco audio al primo tocco, drag&drop col
   dito, safe area, aggiunta alla schermata Home.
6. **Tarare la soglia dopo il playtest.** L'80% e' una scommessa ragionata, non
   un dato: se la fase 1 dura troppo, si abbassa a 0.7 in `content.json` senza
   toccare una riga di codice.

## Idee future (non in v1)

- PWA installabile, icone PNG, prompt di installazione.
- Grafici dei progressi nel tempo nella dashboard genitori.
- Badge/achievement per il lungo periodo.
- Multi-profilo per piu' bambini.
- Invio automatico dei mini-ebook a Send-to-Kindle.
- Riconoscimento vocale per la pronuncia, quando sara' affidabile sulle voci dei bambini.
- Palette verificata per il daltonismo.
- Criteri di successo misurabili (uso quotidiano per 2 settimane, N parole acquisite).

### Fase 2 — da valutare dopo aver visto la reazione di Pietro

- Micro-narrativa a episodi ogni 3-4 livelli.
- Base/tana personale da decorare con le ricompense.
- Sorprese casuali (creature rare, scrigni bonus).
- Condivisione asincrona in famiglia.
- Registrazione della propria voce per riascoltarsi, senza valutazione.
