# Fase 2 — disegno

Le cinque idee della fase 2 nel prompt originale, rimesse in ordine dopo
quello che i due playtest hanno insegnato. L'ordine non e' di gusto: e'
dettato da una dipendenza tecnica scoperta misurando.

## 0. Prima di tutto: HTTPS, cioe' GitHub Pages

Il gioco oggi gira su `http://192.168.1.29`, e su un indirizzo IP in HTTP il
browser nega le API che servono a **tre feature su cinque** della fase 2:

| API | su `http://IP` | serve a |
|---|---|---|
| service worker | no | offline |
| `getUserMedia` | no | registrazione della voce |
| `navigator.share` | no | condivisione in famiglia |

Verificato in Chrome, e Safari e' piu' severo, non meno. GitHub Pages e'
HTTPS e le sblocca tutte con un solo passo; il progetto era nato per finirci.

Il gioco e' gia' pronto: sotto `/gioco-inglese-pietro/` carica, inietta gli
81 sprite, serve 78 file senza un 404, e nel codice non c'e' un percorso
assoluto. Manca solo il repository remoto, che e' un'azione dell'account
GitHub e non del codice.

## 1. La storia a episodi

**Perche' per prima.** E' l'unica delle cinque che risponde alla domanda
"perche' tornare domani?" con qualcosa che non sia un contatore. E si
appoggia su cio' che esiste gia': le otto creature dell'album sono i
personaggi, le otto unita' sono i capitoli.

**La spina.** *L'isola dove le creature hanno perso le parole.* Una nebbia
grigia — la Nebbia Muta — ha tolto la voce alle creature dell'isola. Pepe, una
cucciola che adora le parole, ci sbarca. In ogni mondo che attraversa impara
le parole di quel posto, e una creatura ritrova la voce e si unisce a lei.
Alla Torre dei Dialoghi parlano tutte insieme, e la nebbia si alza.

Non e' un ornamento: **e' il motivo in-fiction per cui si impara l'inglese**.
Le parole che il bambino impara sono, letteralmente, la voce che restituisce
alle creature. E la prima cosa che ogni creatura dice, quando la ritrova, e'
in inglese.

**Struttura.** Prologo + 8 capitoli + epilogo = 10 scene. Ogni scena:

- il **narratore** (VOICE_ID_NARRATOR, che finalmente ha il ruolo per cui
  era stato scelto) — due frasi, tono da inizio episodio;
- **Pepe** (VOICE_ID_PEPE) — una frase;
- la **creatura ritrovata** — la sua prima frase, in inglese, con la voce
  modello (VOICE_ID_ENGLISH). Coerente con la regola delle tre voci:
  l'inglese che si sente e' inglese da imparare, e quello lo e'.

Circa 30 righe italiane e 8 inglesi, poco piu' di 1.500 caratteri di audio.

**Quando scatta.** Il prologo dopo l'onboarding. Ogni capitolo alla prima
volta che la sua unita' viene completata — cioe' quando la creatura si
sblocca, che e' gia' il momento con la festa. L'epilogo alla soglia della
fase 3. Mai due volte da sole: si rivedono dall'album toccando la creatura,
che cosi' smette di essere una vetrina e diventa un indice dei capitoli.

**Come si vede.** Una schermata "capitolo": la creatura al centro sul colore
del suo mondo, Pepe accanto, le battute che scorrono a tocco con il testo
sotto (mostrato, non richiesto). Un "salta" piccolo per il genitore.
**Nessuna illustrazione nuova**: le scene sono composte con le creature che
esistono. Dieci immagini generate apposta rischierebbero di stonare con le
48 gia' validate, e il design system dice che una scena con fondo non e' uno
sprite.

**Persistenza.** `save.progress.storySeen[capitolo]`, indicizzato per id,
come tutto il resto: aggiungere capitoli non tocca i salvataggi.

## 2. Sorprese casuali

Uno scrigno che compare di rado, senza preavviso, in una partita — con una
probabilita' bassa e un tetto di uno al giorno. Dentro: un adesivo per
l'album o una creatura rara fuori curriculum. Poco codice, molta attesa.
Dopo la storia perche' e' una cosa in piu', non un motivo.

## 3. Registrazione della voce

Il bambino si registra dicendo la parola e si riascolta. **Nessuna
valutazione**, come da spec: il piacere di sentirsi parlare inglese. Richiede
HTTPS. Da tenere piccolo: un tasto sul gioco "ascolta e ripeti", che e'
l'unico posto dove la ripetizione e' gia' l'esercizio.

## 4. Condivisione in famiglia

"Manda a papa'": il riepilogo di fine partita come immagine, via foglio di
condivisione del sistema. Richiede HTTPS. Nessun server, nessun account:
`navigator.share` con un file, e basta.

## 5. La tana

Uno spazio suo da arredare con le ricompense. E' la piu' grande e la meno
certa: un senso di possesso che a 7 anni puo' funzionare molto o per niente.
Per ultima, e solo dopo aver visto se la storia e gli scrigni gia' bastano.

## Cosa non cambia

Le tre regole che hanno retto finora valgono anche qui: nessun dato esce dal
dispositivo, nessun audio o immagine generati a runtime, e ogni novita' entra
con il suo controllo nei test.
