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

    print(f"\nPronte {fatti}, fallite {falliti}.")


if __name__ == "__main__":
    main()
