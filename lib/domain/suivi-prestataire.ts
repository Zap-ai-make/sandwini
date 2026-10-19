/**
 * Ce que le prestataire voit, et rien d'autre (S56).
 *
 * **C'est une frontière nommée, pas un filtrage dispersé.** Le commanditaire a
 * tranché « limité à ça uniquement » : ses dossiers, le nom du client, la moto,
 * le châssis, et les avances reçues. Un type qui énumère exactement cela rend la
 * question vérifiable par un test, là où un filtrage réparti dans des composants
 * se vérifie par relecture — c'est-à-dire par vigilance, c'est-à-dire pas.
 *
 * **Ce module est la moitié CLIENTE de la frontière : il relit.** La moitié
 * serveur, qui fabrique, vit dans `functions/src/suivi.ts` et ne peut pas
 * importer celle-ci — `functions/tsconfig.json` a `rootDir: "src"`. Les deux
 * sont donc nouées par un test d'aller-retour (`functions/src/suivi.test.ts`),
 * exactement comme `lib/domain/numerotation.ts` et son pendant serveur : ce que
 * le serveur fabrique, le client doit le relire en entier.
 *
 * **Pourquoi `lireSuivi` refuse un champ de trop.** C'est le seul endroit où le
 * critère de non-fuite devient un test plutôt qu'une intention. Le jour où un
 * prix d'achat se glisserait dans la charge utile du serveur, la lecture échoue
 * ici et le portail dit « ce lien n'est plus valide » — un refus visible, pas une
 * fuite silencieuse vers le navigateur d'un fournisseur. Un relecteur tolérant
 * laisserait passer précisément ce qu'on veut interdire.
 *
 * **Pas de `solde`, et c'est une décision** (spec S56, possibilité (a)). Le
 * produit ne sait pas ce qu'un travail coûte : `lotsCartesGrises` et les
 * documents ne portent qu'une avance, jamais un prix convenu ni un règlement
 * final. Les deux termes de la soustraction manquent. Le champ est donc absent
 * plutôt que mis à zéro — un fournisseur qui lit « solde : 0 » comprend « on ne
 * me doit rien », ce que le produit n'est pas en mesure d'affirmer.
 */

/**
 * Une carte grise, vue depuis le portail.
 *
 * Les dates sont des **chaînes ISO** et non des `Date` : cette charge utile
 * traverse du JSON. Un type qui promettrait des `Date` mentirait sur ce que la
 * page reçoit réellement, et le mensonge se paierait sur un `.getTime()`
 * appliqué à une chaîne.
 */
export type LigneSuivi = {
  numeroVente: string;
  client: string;
  moto: string;
  chassis: string;
  deposeLe: string;
  revenuLe: string | null;
  joursDehors: number;
};

export type SuiviPrestataire = {
  prestataire: { nom: string };
  enCours: LigneSuivi[];
  historique: LigneSuivi[];
  argent: { avances: number };
};

const CHAMPS_LIGNE = [
  "numeroVente",
  "client",
  "moto",
  "chassis",
  "deposeLe",
  "revenuLe",
  "joursDehors",
] as const;

const CHAMPS_SUIVI = ["prestataire", "enCours", "historique", "argent"] as const;

/* `Record<string, unknown>` et non `object` : seul le premier autorise l'accès
   par clé sans affirmer qu'elle existe. */
function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Les clefs sont **exactement** celles attendues.
 *
 * Deux refus en un : un champ manquant, et un champ de trop. Le second est le
 * contrôle de fuite ; le premier évite qu'une page lise `undefined` en croyant
 * lire une donnée.
 */
function clefsExactes(objet: Record<string, unknown>, attendues: readonly string[]): boolean {
  const clefs = Object.keys(objet);
  return clefs.length === attendues.length && attendues.every((clef) => clef in objet);
}

function lireLigne(brut: unknown): LigneSuivi | null {
  if (!estObjet(brut) || !clefsExactes(brut, CHAMPS_LIGNE)) return null;

  const { numeroVente, client, moto, chassis, deposeLe, revenuLe, joursDehors } = brut;
  if (typeof numeroVente !== "string") return null;
  if (typeof client !== "string") return null;
  if (typeof moto !== "string") return null;
  if (typeof chassis !== "string") return null;
  if (typeof deposeLe !== "string") return null;
  if (revenuLe !== null && typeof revenuLe !== "string") return null;
  /* Un nombre de jours négatif ou fractionnaire n'est pas un nombre de jours :
     il signalerait une horloge fausse ou un calcul changé côté serveur, et
     « depuis -3 jours » est pire qu'un refus. */
  if (typeof joursDehors !== "number" || !Number.isInteger(joursDehors) || joursDehors < 0) {
    return null;
  }

  return { numeroVente, client, moto, chassis, deposeLe, revenuLe, joursDehors };
}

function lireLignes(brut: unknown): LigneSuivi[] | null {
  if (!Array.isArray(brut)) return null;
  const lignes: LigneSuivi[] = [];
  for (const element of brut) {
    const ligne = lireLigne(element);
    /* **Une seule ligne illisible invalide le tout.** Garder les autres
       donnerait un suivi incomplet qui a l'air complet — et le prestataire
       croirait qu'une carte a disparu. */
    if (!ligne) return null;
    lignes.push(ligne);
  }
  return lignes;
}

/**
 * Relit la charge utile reçue de la fonction, ou rend `null`.
 *
 * `null` veut dire « ce lien n'est plus valide » à l'écran : un refus visible.
 * C'est volontairement la même réponse qu'un jeton inconnu, parce que du point
 * de vue du prestataire les deux situations sont la même — il n'y a rien à
 * lire —, et parce que distinguer les deux renseignerait qui essaie des liens.
 */
export function lireSuivi(brut: unknown): SuiviPrestataire | null {
  if (!estObjet(brut) || !clefsExactes(brut, CHAMPS_SUIVI)) return null;

  const { prestataire, enCours, historique, argent } = brut;

  if (!estObjet(prestataire) || !clefsExactes(prestataire, ["nom"])) return null;
  if (typeof prestataire.nom !== "string" || prestataire.nom.length === 0) return null;

  if (!estObjet(argent) || !clefsExactes(argent, ["avances"])) return null;
  const avances = argent.avances;
  if (typeof avances !== "number" || !Number.isInteger(avances) || avances < 0) return null;

  const dehors = lireLignes(enCours);
  const rendues = lireLignes(historique);
  if (!dehors || !rendues) return null;

  return {
    prestataire: { nom: prestataire.nom },
    enCours: dehors,
    historique: rendues,
    argent: { avances },
  };
}
