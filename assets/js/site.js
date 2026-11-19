/* =====================================================================
   Petit Vaisseau — le seul JavaScript du site.
   Deux choses : la bascule FR / EN, et la lecture différée du trailer
   YouTube (uniquement si un identifiant est renseigné dans la page).
   Le site reste lisible et complet si ce fichier ne se charge pas.
   ===================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---------------- langue ----------------
     Pages de jeu et accueil (data-mono) : une page par langue, voir
     plus bas. Pages de confidentialité : les deux langues sont dans
     le HTML et le CSS affiche celle que pose data-lang. Le choix est
     mémorisé d'une page à l'autre dans le navigateur du visiteur.   */

  function setLang(lang) {
    var l = lang === "en" ? "en" : "fr";
    root.setAttribute("data-lang", l);
    root.setAttribute("lang", l);
    var fr = document.getElementById("lang-fr");
    var en = document.getElementById("lang-en");
    if (fr) { fr.setAttribute("aria-pressed", String(l === "fr")); }
    if (en) { en.setAttribute("aria-pressed", String(l === "en")); }
    try { localStorage.setItem("pv-lang", l); } catch (e) { /* navigation privée */ }
  }

  function initialLang() {
    // 1. ?lang=en dans l'URL (pratique pour un lien envoyé à la presse anglophone)
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "fr") { return q; }
    // 2. le choix précédent du visiteur
    try {
      var saved = localStorage.getItem("pv-lang");
      if (saved === "en" || saved === "fr") { return saved; }
    } catch (e) { /* ignore */ }
    // 3. la langue du navigateur : anglais pour tout ce qui n'est pas français
    var nav = (navigator.language || "fr").slice(0, 2).toLowerCase();
    return nav === "fr" ? "fr" : "en";
  }

  function memorise(l) {
    try { localStorage.setItem("pv-lang", l); } catch (e) { /* navigation privée */ }
  }

  if (root.hasAttribute("data-mono")) {
    /* Pages construites par outils/construire.py : une langue par adresse (abysses.html en
       français, en/abysses.html en anglais). Les liens #lang-fr / #lang-en mènent à la page
       jumelle. Jamais de redirection d'après la langue du navigateur : les robots de Google
       doivent pouvoir lire chaque version. Seuls ?lang= et un choix déjà fait redirigent. */
    var pageLang = root.getAttribute("lang") === "en" ? "en" : "fr";
    var autre = pageLang === "fr" ? "en" : "fr";
    var lienAutre = document.getElementById("lang-" + autre);
    var versAutre = function () {
      location.replace(lienAutre.getAttribute("href") + location.hash);
    };
    var q = new URLSearchParams(location.search).get("lang");
    var saved = null;
    try { saved = localStorage.getItem("pv-lang"); } catch (e) { /* ignore */ }

    if (lienAutre && q === autre) {
      memorise(autre); versAutre(); return;
    }
    if (q === pageLang) { memorise(pageLang); }
    else if (lienAutre && saved === autre) { versAutre(); return; }

    document.querySelectorAll(".lang a").forEach(function (a) {
      a.addEventListener("click", function () { memorise(a.getAttribute("hreflang")); });
    });

    // Navigateur dans l'autre langue, aucun choix encore : on propose, sans rediriger.
    var nav = (navigator.language || "fr").slice(0, 2).toLowerCase() === "fr" ? "fr" : "en";
    if (lienAutre && !saved && nav === autre) {
      var bandeau = document.createElement("div");
      bandeau.className = "lang-offre";
      bandeau.setAttribute("lang", autre);
      bandeau.innerHTML = '<div class="wrap"><a></a><button type="button"></button></div>';
      var lien = bandeau.querySelector("a");
      lien.href = lienAutre.getAttribute("href");
      lien.hreflang = autre;
      lien.textContent = autre === "en" ? "Read this page in English →" : "Lire cette page en français →";
      lien.addEventListener("click", function () { memorise(autre); });
      var fermer = bandeau.querySelector("button");
      fermer.textContent = "×";
      fermer.setAttribute("aria-label", pageLang === "en" ? "Close" : "Fermer");
      fermer.addEventListener("click", function () { memorise(pageLang); bandeau.remove(); });
      document.body.insertBefore(bandeau, document.body.firstChild);
    }
  } else {
    // Pages de confidentialité : les deux langues dans la page, comme avant.
    setLang(initialLang());
    var btnFr = document.getElementById("lang-fr");
    var btnEn = document.getElementById("lang-en");
    if (btnFr) { btnFr.addEventListener("click", function () { setLang("fr"); }); }
    if (btnEn) { btnEn.addEventListener("click", function () { setLang("en"); }); }
  }

  /* ---------------- bande-annonce ----------------
     Par défaut la page lit le fichier mp4 hébergé avec le site.
     Pour passer à YouTube : mettre l'identifiant de la vidéo dans
     l'attribut data-youtube du bloc .player (voir README.md).
     L'iframe n'est chargée qu'au clic : aucun cookie YouTube tant
     que le visiteur ne lance pas la vidéo.                          */

  var player = document.querySelector(".player[data-youtube]");
  if (player) {
    var id = (player.getAttribute("data-youtube") || "").trim();
    if (id) {
      var video = player.querySelector("video");
      var poster = video ? video.getAttribute("poster") : "";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "yt-facade";
      button.setAttribute("aria-label", root.getAttribute("lang") === "en"
        ? "Play the trailer on YouTube"
        : "Lire la bande-annonce sur YouTube");
      button.style.cssText =
        "width:100%;aspect-ratio:16/9;border:0;padding:0;cursor:pointer;display:block;" +
        "background:#050C15 center/cover no-repeat url('" + poster + "')";
      button.innerHTML =
        '<span style="display:inline-flex;align-items:center;justify-content:center;' +
        'width:74px;height:74px;border-radius:50%;background:#38D6E0;color:#04222A;' +
        'font:700 26px/1 system-ui,sans-serif">&#9654;</span>';
      button.addEventListener("click", function () {
        var frame = document.createElement("iframe");
        frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
        frame.title = (player.getAttribute("data-title") || "Space Defender: Frontier Squadron") +
          (root.getAttribute("lang") === "en" ? " — trailer" : " — bande-annonce");
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture";
        frame.allowFullscreen = true;
        button.replaceWith(frame);
      });
      if (video) { video.replaceWith(button); }
    }
  }
})();
