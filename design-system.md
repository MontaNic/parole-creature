# Design system — Parole & Creature

Riferimento di tipografia, colore e componenti. Le regole vivono in
`design-system.css`; questa pagina spiega **perché**, che è la parte che il
codice non può contenere.

Guida viva: `python3 -m http.server 8080` → `/tools/design-preview.html`.
Mostra i componenti reali, non una maquette: se cambia il CSS, cambia lì.

---

## L'idea portante

Tutto nell'interfaccia porta **lo stesso contorno scuro degli sprite**.

`#2B2140` non è un colore scelto adesso: è già il tratto di tutti e 81 i
simboli SVG, Pepe compresa. Estenderlo a bottoni, card e badge fa sì che
l'interfaccia sembri **disegnata dalla stessa mano** che ha disegnato la
mascotte, invece di essere un guscio neutro che ospita dei disegni.

Da qui discende tutto il resto: contorni spessi, angoli generosi, ombre piene
senza sfocatura (gli sprite sono piatti — un'ombra sfumata li farebbe sembrare
incollati sopra a un'altra grafica), colori pieni senza gradienti.

---

## 1. Tipografia

Due font, due ruoli. La divisione non è estetica: è la stessa logica delle
tre voci — **quello che il bambino deve imparare non si veste come quello che
deve solo capire**.

### Fredoka — interfaccia italiana
`--font-ui`, pesi 300–600, un solo file variabile da 29 kB.

Geometrica e arrotondata: le stesse forme morbide del disegno di Pepe. Usata
per titoli, bottoni, nomi dei mondi, HUD, area genitori.

### Andika — solo l'inglese da imparare
`--font-en`, pesi 400 e 700, 12,5 kB ciascuno.

Disegnata da **SIL International** specificamente per chi sta imparando a
leggere. La differenza è verificabile a occhio e l'ho verificata prima di
scegliere: nella sequenza `Il1` — I maiuscola, l minuscola, numero uno —
Fredoka, Nunito, Baloo 2 e il font di sistema producono **tre bastoncini
identici**. Andika dà tre forme distinte. La `a` e la `g` sono a un piano,
come nella scrittura a mano che Pietro sta imparando a scuola.

Per un adulto che riconosce le parole a colpo d'occhio l'ambiguità è
irrilevante. Per un bambino che le decodifica lettera per lettera — cioè
esattamente quello che il gioco gli chiede dalla fase 2 — non lo è.

Si applica con la classe `.t-en`, che aggiunge anche `letter-spacing: .02em`:
le parole vanno lette una lettera alla volta, un filo d'aria in più aiuta.

### Perché non un font esterno
Il gioco deve funzionare offline. I due file sono **nel repository**
(`assets/fonts/`, 80 kB in tutto) con le rispettive licenze OFL. Nessuna
chiamata a Google Fonts a runtime, che romperebbe il gioco senza rete e
manderebbe l'indirizzo IP del bambino a un terzo.

---

## 2. Palette

| Token | Hex | Ruolo |
|---|---|---|
| `--ink` | `#2B2140` | Inchiostro. Contorno di ogni cosa, sprite inclusi. **Non cambiarlo senza ridisegnare `sprites.svg`.** |
| `--ink-soft` | `#6B6383` | Testo secondario su carta |
| `--night-900` | `#17123A` | Fondo, in basso |
| `--night-800` | `#241C47` | Fondo, in alto |
| `--night-700` | `#332A5E` | Superficie sollevata sul notte (area genitori) |
| `--night-600` | `#443A72` | Bordi sul notte |
| `--paper` | `#FFFDF7` | Carta. Bianco caldo, non bianco da ufficio |
| `--paper-2` | `#F4EDDE` | Carta incassata |
| `--paper-3` | `#E4D9C2` | Fondo delle barre, stati disabilitati |
| `--amber` | `#FFB02E` | **Azione**: cosa toccare. Bottoni, orb dell'audio |
| `--ember` | `#FF7A4D` | **Riprova**. E fuoco, draghi |
| `--leaf` | `#2FB865` | **Giusto**. E natura |
| `--sky` | `#38BDF8` | Acqua, informazione, ripasso |
| `--violet` | `#A855F7` | Magia, mostri |
| `--rose` | `#F4628F` | Dialoghi |
| `--gold` | `#FACC15` | Stelle, premi, anello di focus |

Ogni accento ha una variante `-deep` per l'ombra piena.

### Tre stati, tre colori, nessun doppione

Una prima versione aveva un `--coral` dedicato allo stato "riprova". Messo
accanto a `--ember` era **lo stesso colore** — e i due comparivano insieme
nella stessa schermata (l'orb dell'audio era brace). L'ho eliminato e ho
spostato l'orb sull'ambra. Ora:

- **ambra** = cosa toccare
- **brace** = riprova
- **foglia** = giusto

### "Riprova" non è rosso

In questo gioco non si perde mai, e il colore non deve dire il contrario.
La brace è calda e invita, un rosso d'allarme respinge.

La distinzione fra giusto e riprova **non è affidata alla sola tinta**: il
giusto rimbalza (`.anim-ok`), la riprova trema (`.anim-retry`). Serve a chi
confonde rosso e verde, ed è più leggibile per tutti. Una verifica
sistematica sul daltonismo resta nella roadmap.

---

## 3. Componenti

### Bottoni `.btn`
Contorno `--stroke` (3px) di inchiostro, raggio a pillola, ombra **piena** di
5px nel colore `-deep`. Premendo scendono di 5px e l'ombra sparisce: l'oggetto
si schiaccia, come un tasto di gomma.

Varianti: `.btn-good` (foglia), `.btn-cool` (cielo), `.btn-ghost` (sul notte),
`.btn-lg` (78px, azioni principali), `.btn-sm` (48px, area genitori).

Lo stato `hover` esiste **solo dietro `@media (hover: hover) and (pointer: fine)`**:
su tablet l'hover resta appiccicato dopo il tocco e lascia il bottone
illuminato per sempre.

Disabilitato: fondo `--paper-3`, non un filtro di grigi — che sull'ambra
produceva un marrone fangoso.

### Card `.card`, `.card-press`
Stesso contorno, raggio 26px, ombra piena 4px. `.card-press` dichiara che la
card è premibile e si comporta come un bottone.

### Badge `.badge`, chip `.chip`, `.chip-toggle`
Pillole con contorno 2px. Sul fondo notte il contorno diventa bianco al 22-28%
invece che inchiostro: l'inchiostro su notte non si vedrebbe.

### Barre `.meter`
Contorno inchiostro, riempimento a pillola. `.meter-dark` per il fondo notte.
`.tick` marca una soglia da superare — la usa la barra di padronanza della
fase, con la tacca all'80%: **il traguardo si deve vedere, non solo raggiungere.**

### Messaggi `.toast`
`.toast-good` foglia, `.toast-retry` brace.

### Campi `.field-input`
Contorno inchiostro 2px, altezza minima 52px.

### Area genitori
Stessa identità, tono più sobrio: superfici `--night-700` invece della carta,
bordi 2px invece di 3, raggi minori, niente ombre giocattolo. Nessun font
diverso — il tono adulto viene da colore e peso, non da un terzo carattere.

### Accessibilità
- Area toccabile minima **64px** (`--tap`).
- `:focus-visible` con anello oro a 3px, visibile su carta e su notte.
- `prefers-reduced-motion` disattiva le animazioni.

---

## 4. Regole per le illustrazioni

**Vincoli per le immagini che genereremo.** Se un'illustrazione non li
rispetta, stona con l'interfaccia — che ormai è costruita su queste regole.

1. **Contorno** `#2B2140`, spesso e uniforme, angoli e giunzioni arrotondati.
2. **Fill piatti**, presi dalla palette qui sopra. Niente gradienti, niente
   texture, niente ombre interne.
3. **Nessuna ombra portata** sotto il soggetto: la profondità la dà
   l'interfaccia con le sue ombre piene, non il disegno.
4. **Fondo trasparente**, soggetto centrato in un quadrato, con un margine di
   circa il 10% su ogni lato.
5. **Proporzioni da cucciolo** per le creature: testa grande, occhi grandi,
   bassi e distanti fra loro. È quello che leggiamo come "tenero", ed è come
   è disegnata Pepe.
6. **Un soggetto solo**, leggibile a 80px di lato — è la dimensione reale
   nelle card dell'album.
7. **Niente testo** dentro l'immagine.
8. **Niente spavento**: nessuna zanna aggressiva, nessun sangue, nessuna
   espressione minacciosa. I mostri di questo gioco sono simpatici.

I plurali (`sp-cats`, `sp-dragons`…) sono composti riusando il simbolo
singolare: il plurale deve restare visibilmente **la stessa cosa, ma tante**.
È il contrasto che rende visibile la `-s` nelle unità 5 e 6, quindi va
conservato anche con le nuove illustrazioni.

---

## 5. Cosa non fare

- Non introdurre un terzo font. Il tono si cambia con peso e colore.
- Non usare `--ink` come bordo su fondo notte: sparisce.
- Non aggiungere `hover` fuori dalla media query: rompe il tablet.
- Non usare ombre sfocate sui componenti di gioco: appartengono a un'altra
  grammatica visiva (`--sh-float` esiste solo per gli elementi che
  galleggiano davvero sopra tutto, come i toast).
- Non cambiare `--ink` senza rigenerare gli 81 sprite.
