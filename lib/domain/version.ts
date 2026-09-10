/**
 * La version du produit, telle qu'on la lit au comptoir.
 *
 * Le seul lecteur qui compte est un gérant au téléphone, à qui on demande
 * « quelle version avez-vous ? ». Tout ce module existe pour que sa réponse
 * soit exploitable : un entier qu'il lit sans épeler, et — quand on en a
 * besoin — la date de compilation et l'empreinte qui désignent exactement le
 * code déployé (S34).
 *
 * Aucune horloge, aucun navigateur, aucun Firestore : les trois valeurs
 * arrivent en paramètre, posées à la compilation par `next.config.ts`. C'est ce
 * qui rend chaque arbitrage testable, y compris les cas dégradés — et ils ne
 * sont pas théoriques, un build local hors dépôt git n'a pas d'empreinte.
 */

import { formaterDateHeure } from "./format";

/** Les trois valeurs brutes, telles qu'elles sortent de l'environnement de compilation. */
export type VersionBrute = {
  numero?: string;
  compileeLe?: string;
  empreinte?: string;
};

export type Version = {
  /** L'entier de la maquette. `null` quand le build n'en porte pas. */
  numero: number | null;
  compileeLe: Date | null;
  /** Empreinte git courte, 7 caractères. `null` hors dépôt. */
  empreinte: string | null;
};

/** Ce qui s'affiche quand une valeur manque, partout dans le produit. */
const ABSENT = "—";

/**
 * Le numéro est un entier strictement positif, ou rien.
 *
 * « Rien » est une réponse exacte et non un échec : le produit a connu une
 * vingtaine de lots avant de savoir se nommer, et aucun ne peut être désigné au
 * téléphone. Un appareil qui n'affiche aucun numéro est *plus ancien que la
 * version 1* — information utile, qu'on perdrait en inventant un zéro.
 */
function lireNumero(brut: string | undefined): number | null {
  if (!brut) return null;
  /* `Number()` et non `parseInt()` : `parseInt("12abc")` rend 12, ce qui
     ferait passer une valeur abîmée pour un numéro valide. Ici, ce qui n'est
     pas exactement un entier n'est pas un numéro. */
  const valeur = Number(brut.trim());
  if (!Number.isInteger(valeur) || valeur <= 0) return null;
  return valeur;
}

/**
 * La date de compilation, seule valeur automatique des trois.
 *
 * C'est elle qui rattrape l'oubli du numéro : deux builds qui diraient tous
 * deux « version 12 » porteraient deux dates différentes, et la date
 * trancherait. Un oubli dégrade alors la précision au lieu de fabriquer un
 * mensonge — c'est ce qui rend le numéro posé à la main tenable (S34, réponse 2).
 */
function lireDate(brut: string | undefined): Date | null {
  if (!brut) return null;
  const date = new Date(brut);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Sept caractères, la longueur courte de git.
 *
 * Tronquer et ne pas valider serait accepter n'importe quoi ; on vérifie que
 * c'est bien de l'hexadécimal, parce qu'une variable d'environnement mal posée
 * ressemble à tout sauf à une empreinte, et qu'afficher sa valeur ferait
 * chercher un commit qui n'existe pas.
 */
function lireEmpreinte(brut: string | undefined): string | null {
  if (!brut) return null;
  const nettoyee = brut.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(nettoyee)) return null;
  return nettoyee.slice(0, 7);
}

export function lireVersion(brut: VersionBrute): Version {
  return {
    numero: lireNumero(brut.numero),
    compileeLe: lireDate(brut.compileeLe),
    empreinte: lireEmpreinte(brut.empreinte),
  };
}

/**
 * Le pied de la page de connexion : « SDI · version 12 » (maquette `a1:25`).
 *
 * Sans numéro, on écrit « SDI » tout court — ce que le produit affiche depuis
 * toujours. « SDI · version — » nommerait une chose qui n'existe pas, dans le
 * premier écran que voit un utilisateur, et ferait passer un build sain pour un
 * build cassé.
 */
export function marqueAvecVersion(version: Version): string {
  return version.numero === null ? "SDI" : `SDI · version ${version.numero}`;
}

/**
 * Les trois faits de la section « Cet appareil » des réglages.
 *
 * L'autre lecteur, l'autre texte (D78) : celui qui dépanne veut désigner un
 * commit, pas nommer une version. Chaque valeur manquante s'affiche « — » et
 * non l'absence de la ligne : une ligne qui disparaît se remarque moins qu'une
 * ligne vide, et c'est justement au dépannage qu'on veut la remarquer.
 */
export function faitsDeVersion(version: Version): { titre: string; valeur: string }[] {
  return [
    { titre: "Version", valeur: version.numero === null ? ABSENT : String(version.numero) },
    {
      titre: "Compilée le",
      valeur: version.compileeLe === null ? ABSENT : formaterDateHeure(version.compileeLe),
    },
    { titre: "Empreinte", valeur: version.empreinte ?? ABSENT },
  ];
}
