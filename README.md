# Site de Petit Vaisseau

Site statique du studio : deux pages, aucune dépendance, aucun outil de build.
C'est du HTML et du CSS écrits à la main — on ouvre un fichier, on modifie, on pousse.

En ligne : **https://guillaumem92.github.io/petit-vaisseau-site/**

---

## 1. Ce qu'il y a dans le dépôt

```
├── index.html              Accueil du studio (logo animé, 3 lignes, carte du jeu, liens, contact presse)
├── space-defender.html     Page du jeu (trailer, description, 5 captures, fiche presse, FAQ)
├── 404.html                Page d'erreur, volontairement autonome (son style est dedans)
├── robots.txt              Autorise l'indexation, pointe le sitemap
├── sitemap.xml             Liste des 3 pages, pour Google
├── .nojekyll               Dit à GitHub Pages de servir les fichiers tels quels
├── CNAME-a-activer         À renommer en « CNAME » le jour du domaine (voir §4)
├── assets/
│   ├── css/site.css        TOUT le style, un seul fichier
│   ├── js/site.js          Le seul JavaScript : bascule FR/EN + trailer YouTube
│   ├── img/                Capsule, key art, logo du jeu, 5 captures, favicons
│   └── video/              Bande-annonce 720p, servant de secours si le JS ne charge pas
└── presse/                 Dossier de presse en ligne (copie de Marketing/PressKit)
    ├── index.html          Page du kit presse, en anglais
    ├── key_art/ logos/ fonts/
    ├── fact_sheet_FR.txt   fact_sheet_EN.txt
    └── space-defender-presskit.zip   Archive complète (28 Mo)
```

Environ 39 Mo, dont 31 pour le dossier de presse. Les pages elles-mêmes font moins de 2 Mo,
et la bande-annonce passe par YouTube : elle n'est chargée qu'au clic.

**Pourquoi un dépôt séparé du jeu ?** GitHub Pages n'est disponible sur un compte gratuit que
pour les dépôts publics, et `Space-Defender` est privé (ses sources n'ont pas à être publiques).
Ce dépôt-ci ne contient que ce qui est destiné à être vu. Effet de bord appréciable : pas de Git
LFS ici, donc rien à configurer côté publication.

---

## 2. Voir le site sur ta machine

À la racine du dépôt :

```bash
python3 -m http.server 8000
```

Puis <http://localhost:8000>. `Ctrl+C` pour arrêter.
Un double-clic sur `index.html` marche aussi, mais le serveur est plus fidèle.

---

## 3. Publier

**Réglage initial, une seule fois :** Settings → Pages → Build and deployment →
Source = **Deploy from a branch**, branche `main`, dossier `/ (root)` → Save.

Ensuite, **chaque push sur `main` republie le site** dans la minute. Il n'y a pas de workflow,
pas d'étape de compilation : GitHub sert les fichiers tels quels.

```bash
git add -A && git commit -m "Site: …" && git push
```

---

## 4. Brancher un domaine

Le site marche déjà sur l'adresse `github.io`. Pour y mettre un domaine :

**Si `guillaume-merle.fr` ne sert rien d'autre**, tu peux l'utiliser à la racine. Chez ton
registrar :

| Type  | Nom   | Valeur                    |
|-------|-------|---------------------------|
| A     | `@`   | `185.199.108.153`         |
| A     | `@`   | `185.199.109.153`         |
| A     | `@`   | `185.199.110.153`         |
| A     | `@`   | `185.199.111.153`         |
| CNAME | `www` | `guillaumem92.github.io.` |

**S'il sert déjà quelque chose** (VPS, page perso), prends un sous-domaine — c'est plus simple,
un seul enregistrement, et rien ne bouge côté serveur :

| Type  | Nom             | Valeur                    |
|-------|-----------------|---------------------------|
| CNAME | `petitvaisseau` | `guillaumem92.github.io.` |

Dans les deux cas, ensuite :

1. Attendre que le DNS se propage (quelques minutes à quelques heures).
2. Renommer `CNAME-a-activer` en `CNAME` avec le domaine choisi dedans, commiter, pousser.
3. Settings → Pages → Custom domain → le domaine → Save, puis **Enforce HTTPS** dès que la
   case est disponible.
4. **Mettre à jour les adresses**, car le site passe du sous-chemin à la racine du domaine :
   les balises `canonical`, `og:url` et `og:image` des deux pages, `robots.txt`, `sitemap.xml`,
   et les deux liens de `404.html` (qui pointent vers `/petit-vaisseau-site/`). Remettre aussi
   le domaine dans le pied de page des deux pages, retiré tant qu'il ne menait pas ici.

⚠️ **Ne renomme pas le fichier en `CNAME` avant d'avoir posé le DNS.** Pages redirigerait
l'adresse `github.io` vers un domaine qui ne répond pas, et le site serait injoignable des
deux côtés.

---

## 5. Points encore ouverts

- **Le kit presse signe « Guillaume M92 »** alors que le studio s'appelle Petit Vaisseau.
  Ça concerne `presse/index.html`, les deux `fact_sheet_*.txt` et le contenu du `.zip`.
  À harmoniser avant d'envoyer les clés presse, en reprenant les sources dans `Marketing/`
  puis en regénérant l'archive.
- **Le kit presse n'a pas la même identité visuelle** que le site : vert-turquoise `#2FD6B5`
  et rouge, hérités d'avant le nom du studio. Ça se voit au passage d'une page à l'autre.
  Une demi-heure de travail si tu veux l'aligner sur le cyan `#38D6E0`.
- **La phrase « je réponds moi-même »** du bloc contact presse : si tu veux annoncer un délai
  (« sous 48 heures »), c'est dans `index.html`, section `#presse`.
- **La mention Android** dans la FAQ, à ajuster selon ce que tu veux promettre.
- **itch.io** : pas de lien pour l'instant (décidé le 16/09/2026, le jeu n'y est pas publié).
  Pour en ajouter un : un `<a class="link" href="…">` de plus dans la section
  « Où nous trouver » d'`index.html`, la grille s'adapte au nombre de blocs.

---

## 6. Modifier le site au quotidien

- **Les textes** sont directement dans les deux `.html`. Chaque phrase existe en double :
  `<span class="fr">…</span><span class="en">…</span>`. Le CSS n'affiche que la langue choisie.
  **Si tu modifies une phrase, modifie les deux.**
- **La langue par défaut** : `assets/js/site.js`, fonction `initialLang()`. L'ordre est
  `?lang=en` dans l'URL → choix précédent du visiteur → langue du navigateur. Un lien
  `…/space-defender.html?lang=en` envoyé à la presse anglophone ouvre donc la page en anglais.
- **Les couleurs** : `assets/css/site.css`, tout en haut. Le cyan `#38D6E0` est la couleur de
  marque, elle ne bouge pas ; `--accent-ink` est sa déclinaison foncée, pour le texte sur fond
  clair. Le thème sombre reprend les mêmes noms de variables juste en dessous.
- **La bande-annonce** : `space-defender.html`, attribut `data-youtube` du bloc `.player`.
  Aujourd'hui `vVd2VChcjos`. Si tu le vides, la page repasse sur le mp4 du dossier `assets/video/`.
- **Les captures** : `assets/img/shots/01.jpg` à `05.jpg`, 1600 px de large. Les originaux
  1920×1080 sont dans `Marketing/PressKit/screenshots/` du dépôt du jeu :
  ```bash
  sips -s format jpeg -s formatOptions 78 -Z 1600 source.png --out assets/img/shots/01.jpg
  ```
- **Le logo animé du studio** dans `index.html` est une copie de
  `Marketing/Logos/petit-vaisseau-splash.svg`. Si tu retouches le SVG d'origine, recopie-le.
- **Le dossier de presse** est une copie de `Marketing/PressKit/`, avec deux changements : le
  bouton « Download assets » pointe vers le `.zip`, et un lien ramène au site du studio.
  Si tu modifies le kit dans `Marketing/`, pense à recopier ici.
