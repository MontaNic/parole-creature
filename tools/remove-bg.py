#!/usr/bin/env python3
"""
Rimozione dello sfondo e normalizzazione delle illustrazioni generate.

Prende i PNG opachi in assets/img/art/raw/ e produce sprite con sfondo
trasparente, ritagliati, centrati e alleggeriti, in assets/img/art/.

DUE METODI, e la scelta non e' di gusto.

  flood (predefinito)
      Considera sfondo solo i pixel quasi-bianchi CONNESSI al bordo
      dell'immagine. E' esatto per definizione su un fondo a tinta piatta,
      ed e' l'unico che sopravvive a un soggetto bianco: il bianco dentro
      la sagoma non tocca il bordo, quindi resta.

  rembg
      Modello di matting u2net, pensato per le fotografie. Su queste
      illustrazioni funziona bene finche' il soggetto e' colorato, ma su
      Pepe — cane bianco su fondo bianco — ha cancellato meta' del corpo:
      misurato, la meta' inferiore conservava il 20% dei pixel opachi della
      meta' superiore, mentre sul drago verde il rapporto era 1.06.
      Resta disponibile con --metodo rembg per confronto.

Poi in entrambi i casi:
  ritaglio      al contenuto reale, ricentrato con il 10% di margine per
                lato, come chiede design-system.md. Una garanzia, non una
                speranza: il modello il margine lo rispetta "quasi".
  quantizzazione  le illustrazioni sono a tinte piatte, quindi una palette
                indicizzata le riduce di circa dieci volte senza differenze
                visibili. Su un tablet contano.

Uso:
  .venv-tools/bin/python tools/remove-bg.py
  .venv-tools/bin/python tools/remove-bg.py --force
  .venv-tools/bin/python tools/remove-bg.py --metodo rembg
  .venv-tools/bin/python tools/remove-bg.py sp-pepe sp-dragon
"""

import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "img" / "art" / "raw"
OUT = ROOT / "assets" / "img" / "art"

LATO = 384           # lato finale: a schermo il massimo e' ~190 px, che a 2x fa 380
MARGINE = 0.10       # margine vuoto su ogni lato
TOLLERANZA = 30      # quanto un pixel puo' scostarsi dal bianco ed essere sfondo
COLORI = 64          # colori della palette finale
ALPHA_MIN = 12


def togli_sfondo_flood(img):
    """
    Sfondo = pixel quasi-bianchi raggiungibili dal bordo.

    Il "raggiungibili dal bordo" e' il punto: il bianco della pancia di Pepe
    e' circondato dal contorno scuro, quindi non e' connesso al bordo e
    sopravvive.
    """
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    # distanza dal bianco, sul canale che se ne discosta di piu'
    distanza = (255 - rgb).max(axis=2)
    quasi_bianco = distanza <= TOLLERANZA

    componenti, _ = ndimage.label(quasi_bianco)
    bordo = np.concatenate([
        componenti[0, :], componenti[-1, :], componenti[:, 0], componenti[:, -1]
    ])
    etichette_sfondo = set(np.unique(bordo)) - {0}
    if not etichette_sfondo:
        return img.convert("RGBA")

    sfondo = np.isin(componenti, list(etichette_sfondo))

    # Il soggetto e' opaco, lo sfondo e' vuoto.
    alpha = np.where(sfondo, 0.0, 255.0)

    # Bordi morbidi SOLO sul confine: i pixel del soggetto che toccano lo
    # sfondo sono a meta' strada fra tratto e fondo, e tagliarli netti
    # lascerebbe una scaletta.
    # Attenzione: la sfumatura va applicata soltanto qui. Applicandola a
    # tutta l'immagine, come in una prima versione, ogni pixel bianco
    # diventava trasparente — e la pancia bianca di Pepe spariva di nuovo,
    # stavolta per colpa nostra e non di rembg.
    confine = ndimage.binary_dilation(sfondo) & ~sfondo
    alpha[confine] = np.clip(distanza[confine].astype(np.float32) / TOLLERANZA, 0, 1) * 255

    out = np.dstack([np.asarray(img.convert("RGB")), alpha.astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def togli_sfondo_rembg(img):
    from rembg import remove, new_session
    global _SESSIONE
    try:
        _SESSIONE
    except NameError:
        _SESSIONE = new_session("u2net")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Image.open(io.BytesIO(remove(buf.getvalue(), session=_SESSIONE))).convert("RGBA")


def ritaglia_e_centra(img):
    """Ritaglia al contenuto e ricentra in un quadrato con margine fisso."""
    alpha = img.getchannel("A")
    bbox = alpha.point(lambda a: 255 if a > ALPHA_MIN else 0).getbbox()
    if not bbox:
        return None
    soggetto = img.crop(bbox)

    disponibile = int(LATO * (1 - 2 * MARGINE))
    w, h = soggetto.size
    scala = min(disponibile / w, disponibile / h)
    nuovo = (max(1, round(w * scala)), max(1, round(h * scala)))
    soggetto = soggetto.resize(nuovo, Image.LANCZOS)

    tela = Image.new("RGBA", (LATO, LATO), (0, 0, 0, 0))
    tela.paste(soggetto, ((LATO - nuovo[0]) // 2, (LATO - nuovo[1]) // 2), soggetto)
    return tela


def alleggerisci(img):
    """Palette indicizzata conservando la trasparenza."""
    trasparente = np.asarray(img.getchannel("A")) < 128
    quantizzata = img.convert("RGB").quantize(colors=COLORI, method=Image.MEDIANCUT)
    quantizzata = quantizzata.convert("RGBA")
    arr = np.asarray(quantizzata).copy()
    arr[:, :, 3] = np.asarray(img.getchannel("A"))
    arr[trasparente] = 0
    return Image.fromarray(arr, "RGBA")


def main():
    argv = sys.argv[1:]
    force = "--force" in argv
    metodo = "flood"
    if "--metodo" in argv:
        i = argv.index("--metodo")
        if i + 1 < len(argv):
            metodo = argv[i + 1]
    nomi = [a for a in argv if not a.startswith("--") and a != metodo]

    if not RAW.exists():
        sys.exit(f"Nessuna immagine grezza in {RAW}. Genera prima con tools/generate-images.mjs")

    sorgenti = sorted(RAW.glob("*.png"))
    if nomi:
        voluti = {n if n.endswith(".png") else n + ".png" for n in nomi}
        sorgenti = [p for p in sorgenti if p.name in voluti]
    if not force:
        sorgenti = [p for p in sorgenti if not (OUT / p.name).exists()]

    if not sorgenti:
        print("Niente da fare.")
        return

    togli = togli_sfondo_rembg if metodo == "rembg" else togli_sfondo_flood
    print(f"\nMetodo: {metodo}\n")

    OUT.mkdir(parents=True, exist_ok=True)
    fatti = falliti = 0
    for src in sorgenti:
        try:
            img = Image.open(src)
            finita = ritaglia_e_centra(togli(img))
            if finita is None:
                print(f"  ko  {src.stem:<16} immagine vuota dopo la rimozione")
                falliti += 1
                continue
            finita = alleggerisci(finita)
            dest = OUT / src.name
            finita.save(dest, "PNG", optimize=True)
            print(f"  ok  {src.stem:<16} {dest.stat().st_size / 1024:6.1f} kB")
            fatti += 1
        except Exception as err:                      # noqa: BLE001
            print(f"  ko  {src.stem:<16} {err}")
            falliti += 1

    print(f"\nPronte {fatti}, fallite {falliti}.\n")
    componi_plurali()
    scrivi_indice()


# I plurali sono composti dal singolare, non disegnati a parte: il confronto
# "la stessa cosa, ma tante" e' cio' che rende visibile la -s nelle unita' 5 e
# 6. Le posizioni ricalcano quelle dei simboli in sprites.svg.
PLURALI = {
    "sp-cats":      ("sp-cat",      [(0.02, 0.08), (0.52, 0.08), (0.27, 0.48)], 0.46),
    "sp-stars":     ("sp-star",     [(0.02, 0.08), (0.52, 0.08), (0.27, 0.48)], 0.46),
    "sp-dragons":   ("sp-dragon",   [(0.02, 0.08), (0.52, 0.08), (0.27, 0.48)], 0.46),
    "sp-dinosaurs": ("sp-dinosaur", [(0.02, 0.08), (0.52, 0.08), (0.27, 0.48)], 0.46),
    # "two eggs": due, non tre, perche' la frase dice esattamente two
    "sp-eggs":      ("sp-egg",      [(0.00, 0.22), (0.45, 0.22)], 0.55),
}


def componi_plurali():
    """
    Costruisce i plurali incollando piu' volte l'illustrazione del singolare.

    Se il singolare passa a PNG e il plurale resta un simbolo SVG, il bambino
    vede due disegni diversi per la stessa cosa e il confronto salta. Va
    rifatto ogni volta che il singolare cambia.
    """
    fatti = 0
    for plurale, (singolare, posizioni, scala) in PLURALI.items():
        src = OUT / f"{singolare}.png"
        if not src.exists():
            continue
        base = Image.open(src).convert("RGBA")
        lato = base.width
        piccola = base.resize((round(lato * scala), round(lato * scala)), Image.LANCZOS)
        tela = Image.new("RGBA", (lato, lato), (0, 0, 0, 0))
        for x, y in posizioni:
            tela.paste(piccola, (round(x * lato), round(y * lato)), piccola)
        finita = ritaglia_e_centra(tela)
        if finita is None:
            continue
        dest = OUT / f"{plurale}.png"
        alleggerisci(finita).save(dest, "PNG", optimize=True)
        print(f"  ok  {plurale:<16} {dest.stat().st_size / 1024:6.1f} kB  (da {singolare})")
        fatti += 1
    if fatti:
        print(f"\nComposti {fatti} plurali.")
    return fatti


def scrivi_indice():
    """
    Elenco delle illustrazioni disponibili.

    Il gioco lo legge per sapere quali sprite hanno un'immagine e quali
    restano simboli SVG (numeri, colori, icone, plurali). Senza indice
    dovrebbe tentare il caricamento e gestire il 404 di 38 file.
    """
    import json
    nomi = sorted(p.stem for p in OUT.glob("*.png"))
    (OUT / "index.json").write_text(json.dumps({
        "_comment": "Generato da tools/remove-bg.py. Sprite con illustrazione; tutti gli altri restano simboli in sprites.svg.",
        "sprites": nomi
    }, indent=2) + "\n")
    print(f"\nassets/img/art/index.json aggiornato: {len(nomi)} illustrazioni.")

    # Lista esplicita per il service worker.
    #
    # Prima il worker leggeva index.json durante l'installazione e cachava
    # quello che ci trovava. Sembrava equivalente e non lo era: se quella
    # fetch falliva — rete lenta, server occupato, installazione interrotta —
    # il gioco restava senza illustrazioni offline e nessuno se ne accorgeva,
    # perche' online continuavano ad arrivare dalla rete.
    # Una lista scritta nel file non puo' fallire a meta'.
    righe = ",\n  ".join(f"'assets/img/art/{n}.png'" for n in nomi)
    (ROOT / "sw-art.js").write_text(
        "/*\n"
        " * GENERATO da tools/remove-bg.py — non modificare a mano.\n"
        " * Elenco delle illustrazioni da mettere in cache all'installazione.\n"
        " * Verificato da tools/check-assets.mjs, che fallisce se un PNG\n"
        " * esiste ma non compare qui.\n"
        " */\n"
        f"self.ART_ASSETS = [\n  {righe}\n];\n"
    )
    print(f"sw-art.js aggiornato: {len(nomi)} file da pre-cachare.")


if __name__ == "__main__":
    main()
