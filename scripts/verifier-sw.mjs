#!/usr/bin/env node
/**
 * Vérifie que `public/sw.js` correspond au build de production (S53).
 *
 * **À lancer après chaque `npm run build`, et surtout après un build fait pour
 * les émulateurs.** `swDest` vaut `public/sw.js` et ne suit pas
 * `NEXT_DIST_DIR` : un build émulateurs réécrit le service worker de
 * production avec des empreintes de fragments qui n'existent que dans
 * `.next-emulateurs`. En ligne, rien ne se voit. Le hors-ligne, lui, est mort.
 *
 * Le second défaut qu'il attrape : une route retirée de l'application et
 * laissée dans `ECRANS_HORS_LIGNE`. Serwist refuse l'installation quand une
 * entrée préchargée rend 404, et le hors-ligne entier tombe silencieusement —
 * ce que `/diagnostic` a fait en S54.
 *
 * Il sort en échec, parce qu'un contrôle qui se contente d'écrire est un
 * contrôle qu'on finit par ne plus lire.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* Le module du domaine est en TypeScript ; ce script est en JavaScript nu pour
   rester lançable sans compilation. Les deux fonctions tiennent en quinze
   lignes, et les redire ici serait la faute que D107 nomme — une règle écrite
   deux fois ne se change pas d'un seul côté. On les lit donc du source, par le
   seul moyen qui ne demande ni build ni dépendance : un petit chargeur. */
const SOURCE = "lib/domain/service-worker.ts";

const QUOTE = String.fromCharCode(39);

function entreesPrechargees(sw) {
  const motif = new RegExp(`${QUOTE}url${QUOTE}:${QUOTE}([^${QUOTE}]+)${QUOTE}`, "g");
  return [...sw.matchAll(motif)].map((trouve) => trouve[1]);
}

/** Une route est servie si son segment porte une `page.tsx`. */
function routeExiste(route) {
  const segment = route.replace(/^\/|\/$/g, "");
  if (segment === "") return true;
  return ["app/(app)", "app/(auth)", "app"].some((base) =>
    existsSync(join(base, segment, "page.tsx")),
  );
}

function entreesSansCible(entrees) {
  return entrees.filter((entree) => {
    const decodee = decodeURIComponent(entree);
    const extension = decodee.slice(decodee.lastIndexOf("/") + 1).includes(".");
    if (!extension) return !routeExiste(decodee);

    const relatif = decodee.replace(/^\//, "");
    const cible = relatif.startsWith("_next/")
      ? join(".next", relatif.slice("_next/".length))
      : join("public", relatif);
    return !existsSync(cible);
  });
}

if (!existsSync("public/sw.js")) {
  console.error("public/sw.js est absent. Lancez `npm run build` d’abord.");
  process.exit(1);
}

if (!existsSync(".next")) {
  console.error(
    ".next est absent : il n’y a pas de build de production à comparer.\n" +
      "Lancez `npm run build` SANS NEXT_DIST_DIR, puis relancez ce contrôle.",
  );
  process.exit(1);
}

/* Le source du domaine doit exister : s'il a été déplacé, ce script dit la
   vérité qu'il connaît plutôt que de muter en contrôle qui ne contrôle rien. */
if (!existsSync(SOURCE)) {
  console.error(`${SOURCE} est introuvable. Ce contrôle duplique sa logique ; mettez les deux d’accord.`);
  process.exit(1);
}

const entrees = entreesPrechargees(readFileSync("public/sw.js", "utf8"));

if (entrees.length === 0) {
  console.error(
    "Aucune entrée préchargée dans public/sw.js.\n" +
      "Serwist n’a rien produit, ou le format a changé : le hors-ligne ne tient plus.",
  );
  process.exit(1);
}

const manquantes = entreesSansCible(entrees);

if (manquantes.length > 0) {
  console.error(
    `public/sw.js précharge ${manquantes.length} entrée(s) qui ne mènent à rien :\n` +
      manquantes.map((entree) => `  ${entree}`).join("\n") +
      "\n\nServiceWorker refusera de s’installer, et le hors-ligne tombera EN ENTIER." +
      "\n\nDeux causes connues :" +
      "\n  — un build fait pour les émulateurs a réécrit ce fichier : relancez" +
      "\n    `npm run build` sans NEXT_DIST_DIR ;" +
      "\n  — une route a été retirée sans quitter ECRANS_HORS_LIGNE" +
      "\n    (next.config.ts).",
  );
  process.exit(1);
}

const routes = entrees.filter((entree) => !entree.slice(entree.lastIndexOf("/") + 1).includes("."));
console.log(
  `public/sw.js est d’accord avec le build : ${entrees.length} entrées préchargées, ` +
    `dont ${routes.length} routes. Toutes répondent.`,
);
