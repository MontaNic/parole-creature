# Giochi bonus — classifica e scelta

Richiesta del 2026-09-07: "fai una classifica dei giochi arcade tipo Pang e
decidi tu". Il primo, "Bolle", e' gia' nel gioco. Qui la classifica per il
secondo e per quelli dopo.

## I criteri (da `js/bonus.js` e dal playtest)

Un gioco bonus qui deve reggere quattro vincoli che un arcade normale non
ha: **dura 45 secondi e non ha game over**, gira **col dito su iPad** (niente
tastiera, niente joystick, niente precisione da mouse), **porta l'inglese in
modo passivo** (una voce dice una parola, si tocca la figura giusta) e si
costruisce **senza illustrazioni nuove** (i 48 PNG validati, su canvas).
E deve essere *diverso* da Bolle: un altro modo di muovere le mani.

| # | meccanica (l'arcade da cui viene) | dito | senza game over | inglese dentro | costo | diverso da Bolle | voto |
|---|---|---|---|---|---|---|---|
| 1 | **Spunta!** — le figure spuntano da buchi, si tocca quella detta (Whac-A-Mole) | tocco secco | si': una spunta persa non costa nulla | naturale: una parola, una figura | basso | ritmo e sorpresa, non inseguimento | **9** |
| 2 | **Il cestino** — figure cadono, si trascina il cestino sotto quella giusta (Kaboom!, catch games) | trascinamento orizzontale | si': si perde solo la presa | naturale | medio | controllo continuo | 8 |
| 3 | Bolle — bolle che rimbalzano, si scoppia quella detta (Pang) | tocco | si' | naturale | fatto | — | 8 |
| 4 | **Taglia!** — figure lanciate in aria, si tagliano con uno swipe (Fruit Ninja) | swipe | si' | naturale | medio | il gesto piu' soddisfacente del touch | 8 |
| 5 | Simon delle parole — sequenza di figure che si accende, da ripetere (Simon) | tocco | si', ma "sbagliare" e' il gioco | fortissimo, quasi troppo: e' un test di memoria | basso | e' un gioco di memoria, non un arcade | 6 |
| 6 | Attraversa — Pepe attraversa un fiume di tronchi in movimento (Frogger) | tocco a tempo | no: cadere in acqua e' il gioco | debole (le parole restano fuori) | medio | si' | 5 |
| 7 | Mattoni — pallina e racchetta (Breakout) | trascinamento fine | no: perdere la pallina e' il gioco | debole | medio | si' | 4 |
| 8 | Vola — tocca per far volare Pepe fra gli ostacoli (Flappy Bird) | tocco a tempo | no, e frustra | debole | basso | si' | 3 |
| 9 | Invasori — sparare a cose che scendono (Space Invaders) | mira | no | debole | medio | sparare, in un gioco dove non si perde mai: no | 2 |
| 10 | Piattaforme — Pepe corre e salta (Mario) | due controlli insieme | no | debole | alto | si' | 2 |

Le ultime cinque perdono per lo stesso motivo: la loro tensione *e'* il
fallimento (cadere, perdere la pallina, farsi colpire), e togliere il
fallimento le svuota. Le prime quattro invece hanno la tensione nel ritmo
e nel gesto, e restano intere anche senza game over.

## La scelta

**Secondo gioco: "Spunta!"** — il Whac-A-Mole. Vince perche' e' il gesto piu'
semplice possibile (un tocco secco), perche' e' *l'opposto* di Bolle (li' si
insegue una cosa che scappa, qui si aspetta una cosa che appare), perche'
la sorpresa di cosa spunta e da quale buco e' un divertimento da sette anni
esatti, e perche' la voce che dice la parola *prima* che la figura spunti
trasforma l'attesa in ascolto: il bambino sente "castle" e cerca il
castello fra le cose che spuntano. Costo basso: stesse immagini, stesso
contratto, un canvas.

Terzo, quando servira': **"Il cestino"**, per il controllo continuo che
manca agli altri due. "Taglia!" e' il quarto: lo swipe e' bellissimo ma
sull'iPad nell'app a schermo intero rischia di litigare con i gesti di
sistema ai bordi.

## Come si alternano

`planBonus` decide *se* c'e' un bonus; la scelta di *quale* e' a caso fra
quelli disponibili, senza ripetere l'ultimo giocato (`save.stats.lastBonus`).
Ogni gioco rispetta lo stesso contratto: `play({ items, showWritten })` che
si risolve con `{ popped }` a fine partita.
