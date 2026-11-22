#!/usr/bin/env python3
"""Construit les pages du site à partir des pages bilingues de source/.

Chaque page de source/ contient les deux langues : <span class="fr">…</span><span class="en">…</span>,
et de même pour <title>, <meta name="description">, les données structurées, etc.
Ce script en tire deux pages d'une seule langue chacune, ce que Google sait indexer :

    source/abysses.html  →  abysses.html      (français, l'adresse de toujours)
                         →  en/abysses.html   (anglais)

Il retire aussi les éléments des états de sortie inactifs (data-sortie, README §7),
pose l'adresse canonique, les liens hreflang, la bascule FR/EN en vrais liens,
et réécrit sitemap.xml.

    python outils/construire.py            construit
    python outils/construire.py --verifier sort en erreur si une page n'est pas à jour

Python 3 seul, aucune dépendance.
"""
import re
import subprocess
import sys
import datetime
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "source"
SITE = "https://petitvaisseau.com/"
PAGES = ["index.html", "space-defender.html", "le-tapis-vert.html",
         "reverie.html", "abysses.html", "telluris.html"]
LANGUES = ("fr", "en")
LOCALES = {"fr": "fr_FR", "en": "en_US"}
# Pages d'une seule version, ajoutées telles quelles au sitemap. Les pages de confidentialité
# n'y sont plus : elles restent en ligne (les magasins y renvoient) mais n'apportent rien à la recherche.
AUTRES_PAGES = ["presse/"]

VIDES = {"area", "base", "br", "col", "embed", "hr", "img", "input",
         "link", "meta", "source", "track", "wbr"}
# Classes à retirer selon l'état de <body data-sortie="…"> (mêmes règles que site.css).
SORTIE = {"avant": {"apres", "sans-ios"},
          "apres": {"avant", "sans-ios"},
          "sans-ios": {"avant", "apres", "hors-sans-ios"}}
# Éléments qui n'existent que dans les sources (le noindex des pages de source/).
SOURCE_SEULE = "source-seule"

BALISE = re.compile(r"<!--.*?-->|<(/?)([a-zA-Z][\w:-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", re.S)
CLASSE = re.compile(r'\sclass="([^"]*)"')


def adresse(page, langue):
    chemin = "" if page == "index.html" else page
    return SITE + ("en/" if langue == "en" else "") + chemin


def fin_element(html, pos, nom):
    """Position juste après la balise fermante de l'élément ouvert avant pos."""
    profondeur = 1
    motif = re.compile(r"<!--.*?-->|<(/?)" + re.escape(nom) + r"\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.S | re.I)
    for m in motif.finditer(html, pos):
        if m.group(0).startswith("<!--"):
            continue
        if m.group(1):
            profondeur -= 1
        elif not m.group(0).endswith("/>"):
            profondeur += 1
        if profondeur == 0:
            return m.end()
    raise ValueError(f"<{nom}> sans balise fermante après la position {pos}")


def retirer(html, classes):
    """Supprime chaque élément dont l'attribut class contient l'une des classes données."""
    morceaux, i = [], 0
    while True:
        m = BALISE.search(html, i)
        if not m:
            morceaux.append(html[i:])
            return "".join(morceaux)
        if m.group(0).startswith("<!--") or m.group(1):
            morceaux.append(html[i:m.end()])
            i = m.end()
            continue
        nom, attributs = m.group(2).lower(), m.group(3)
        c = CLASSE.search(attributs)
        if c and set(c.group(1).split()) & classes:
            if nom in VIDES or attributs.rstrip().endswith("/"):
                fin = m.end()
            else:
                fin = fin_element(html, m.end(), nom)
            debut = m.start()
            # Seul sur sa ligne : la ligne part avec lui.
            ligne = html.rfind("\n", 0, debut) + 1
            if ligne >= i and html[ligne:debut].strip() == "":
                saut = html.find("\n", fin)
                if saut != -1 and html[fin:saut].strip() == "":
                    debut, fin = ligne, saut + 1
            morceaux.append(html[i:debut])
            i = fin
            continue
        morceaux.append(html[i:m.end()])
        i = m.end()
        if nom in ("script", "style"):
            j = html.lower().index(f"</{nom}", i)
            morceaux.append(html[i:j])
            i = j


def sans_classes_de_langue(html):
    """Retire les classes fr et en restantes (l'élément reste, sa langue est celle de la page)."""
    def nettoie(m):
        jetons = [j for j in m.group(1).split() if j not in LANGUES]
        return f' class="{" ".join(jetons)}"' if jetons else ""
    return CLASSE.sub(nettoie, html)


ATTRIBUT_EN = re.compile(r'(\s(alt|aria-label|title|data-title)=")([^"]*)("\s+)\2-en="([^"]*)"')


def attributs_traduits(html, langue):
    """alt="…" alt-en="…" (de même aria-label, title, data-title) : garde la valeur de la langue de la page."""
    return ATTRIBUT_EN.sub(lambda m: m.group(1) + (m.group(5) if langue == "en" else m.group(3)) + '"', html)


def lien(valeur, langue):
    """Réécrit un lien relatif pour une page de la langue donnée (en/ est un niveau plus bas)."""
    if valeur == "index.html" or valeur.startswith("index.html#"):
        valeur = "./" + valeur[len("index.html"):]
    if langue == "fr" or re.match(r"^([a-z][a-z0-9+.-]*:|/|#|\./|\.\./)", valeur, re.I):
        return valeur
    if valeur.split("#")[0].split("?")[0] in PAGES:
        return valeur  # l'autre page anglaise, dans le même dossier en/
    return "../" + valeur


def bascule(page, langue, nl):
    """La bascule FR / EN : deux vrais liens vers la page jumelle (lisibles sans JavaScript)."""
    vers = {}
    for cible in LANGUES:
        if cible == langue:
            vers[cible] = "./" if page == "index.html" else page
        elif cible == "en":
            vers[cible] = "en/" + ("" if page == "index.html" else page)
        else:
            vers[cible] = "../" + ("" if page == "index.html" else page)
    liens = [f'      <a id="lang-{c}" href="{vers[c]}" hreflang="{c}" lang="{c}"'
             + (' aria-current="true"' if c == langue else "") + f">{c.upper()}</a>"
             for c in LANGUES]
    return (f'<div class="lang" role="group" aria-label="Langue / Language">{nl}'
            + nl.join(liens) + f"{nl}    </div>")


def construire(page, html, langue):
    nl = "\r\n" if "\r\n" in html else "\n"
    m = re.search(r'<body[^>]*\sdata-sortie="([^"]+)"', html)
    a_retirer = {l for l in LANGUES if l != langue} | {SOURCE_SEULE}
    if m:
        a_retirer |= SORTIE[m.group(1)]
    html = retirer(html, a_retirer)
    html = sans_classes_de_langue(html)
    html = attributs_traduits(html, langue)
    assert not re.search(r'\s[\w-]+-en="', html), f"{page} : attribut -en mal placé (il suit directement le sien)"

    # Liens relatifs (href, src, poster) ; le reste du <head> est en adresses absolues.
    html = re.sub(r'(\s(?:href|src|poster)=")([^"]*)(")',
                  lambda m: m.group(1) + lien(m.group(2), langue) + m.group(3), html)

    html = re.sub(r"<html\b[^>]*>", f'<html lang="{langue}" data-lang="{langue}" data-mono>', html, count=1)
    alternes = nl.join(
        [f'<link rel="alternate" hreflang="{l}" href="{adresse(page, l)}">' for l in LANGUES]
        + [f'<link rel="alternate" hreflang="x-default" href="{adresse(page, "en")}">'])
    html, n = re.subn(r'<link rel="canonical" href="[^"]*">',
                      lambda _: f'<link rel="canonical" href="{adresse(page, langue)}">{nl}{alternes}', html, count=1)
    assert n == 1, f"{page} : pas de <link rel=\"canonical\">"
    html = re.sub(r'<meta property="og:locale(?::alternate)?" content="[^"]*">[ \t]*\r?\n', "", html)
    autre = "en" if langue == "fr" else "fr"
    html, n = re.subn(r'<meta property="og:url" content="[^"]*">',
                      lambda _: (f'<meta property="og:url" content="{adresse(page, langue)}">{nl}'
                                 f'<meta property="og:locale" content="{LOCALES[langue]}">{nl}'
                                 f'<meta property="og:locale:alternate" content="{LOCALES[autre]}">'), html, count=1)
    assert n == 1, f"{page} : pas de og:url"
    if page != "index.html":  # l'url de la fiche schema.org du jeu suit la langue de la page
        html = html.replace(f'"url": "{adresse(page, "fr")}"', f'"url": "{adresse(page, langue)}"')
    html, n = re.subn(r'<div class="lang"[^>]*>.*?</div>', lambda _: bascule(page, langue, nl), html, count=1, flags=re.S)
    assert n == 1, f"{page} : pas de bascule de langue"
    html = re.sub(r"(<!doctype html>\r?\n)",
                  lambda m: m.group(1) + f"<!-- Page générée par outils/construire.py depuis source/{page} :"
                  f" modifier la source, puis relancer le script (README §6). -->{nl}", html, count=1, flags=re.I)
    return html


def date_de(chemin):
    """Date de dernière modification d'une source : aujourd'hui si elle a des changements non commités."""
    rel = chemin.relative_to(RACINE).as_posix()
    try:
        if subprocess.run(["git", "status", "--porcelain", "--", rel], cwd=RACINE,
                          capture_output=True, text=True).stdout.strip():
            return datetime.date.today().isoformat()
        d = subprocess.run(["git", "log", "-1", "--format=%cs", "--", rel], cwd=RACINE,
                           capture_output=True, text=True).stdout.strip()
        return d or datetime.date.today().isoformat()
    except OSError:
        return datetime.date.today().isoformat()


def sitemap():
    l = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
         '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page in PAGES:
        date = date_de(SOURCE / page)
        for langue in LANGUES:
            l += ["  <url>", f"    <loc>{adresse(page, langue)}</loc>", f"    <lastmod>{date}</lastmod>"]
            l += [f'    <xhtml:link rel="alternate" hreflang="{x}" href="{adresse(page, x)}"/>' for x in LANGUES]
            l += [f'    <xhtml:link rel="alternate" hreflang="x-default" href="{adresse(page, "en")}"/>', "  </url>"]
    for page in AUTRES_PAGES:
        cible = RACINE / page / "index.html" if page.endswith("/") else RACINE / page
        l += ["  <url>", f"    <loc>{SITE}{page}</loc>", f"    <lastmod>{date_de(cible)}</lastmod>", "  </url>"]
    return "\n".join(l + ["</urlset>", ""])


def main():
    verifier = "--verifier" in sys.argv
    sorties = {}
    for page in PAGES:
        with open(SOURCE / page, encoding="utf-8", newline="") as f:
            html = f.read()
        for langue in LANGUES:
            sorties[(RACINE / "en" / page) if langue == "en" else (RACINE / page)] = construire(page, html, langue)
    if not verifier:  # le sitemap dépend des dates git : il n'entre pas dans la vérification
        sorties[RACINE / "sitemap.xml"] = sitemap()
    perimees = []
    for chemin, texte in sorties.items():
        actuel = open(chemin, encoding="utf-8", newline="").read() if chemin.exists() else None
        if actuel == texte:
            continue
        perimees.append(chemin.relative_to(RACINE).as_posix())
        if not verifier:
            chemin.parent.mkdir(parents=True, exist_ok=True)
            with open(chemin, "w", encoding="utf-8", newline="") as f:
                f.write(texte)
    if verifier:
        if perimees:
            print("Pages pas à jour (lancer python outils/construire.py) :", ", ".join(perimees))
            sys.exit(1)
        print("Toutes les pages sont à jour.")
    else:
        print(f"{len(perimees)} fichier(s) écrit(s)" + (" : " + ", ".join(perimees) if perimees else "."))


if __name__ == "__main__":
    main()
