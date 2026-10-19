/**
 * Déplacer une moto d'une boutique à une autre (S17).
 *
 * **Un seul geste.** La moto change de boutique immédiatement — pas d'envoi
 * suivi d'une réception. Q7 avait tranché l'inverse le 11 septembre 2026 : un
 * transfert en deux temps empêche l'inventaire d'arrivée de compter une moto
 * encore sur la route. Le commanditaire a pesé l'autre coût le 8 octobre : un
 * stock faux pendant deux jours se corrige tout seul, un geste de confirmation
 * que personne ne fait ne se corrige jamais. Le statut `transferee` reste donc
 * déclaré et inemployé.
 *
 * **L'origine n'est jamais choisie : c'est celle de la moto.** Le responsable
 * posé sur « Toutes les boutiques » n'a pas de boutique courante, et le geste
 * doit marcher pour lui comme pour le gérant. Faire venir l'origine du
 * sélecteur aurait créé deux chemins pour un seul geste.
 *
 * **Ce module ne garde aucune promesse de sécurité.** Qui a le droit
 * d'envoyer, et vers quelle boutique, est tenu par `firestore.rules` — la règle
 * y vérifie le compte contre la boutique que la moto *quitte*, ce qui laisse
 * pousser et jamais tirer. Ce qui est écrit ici sert à ne pas proposer un geste
 * qui serait refusé ensuite.
 */

import type { Boutique } from "./boutique";
import { LIBELLE_STATUT, type Moto } from "./moto";

export const LONGUEUR_MOTIF_MAX = 200;

export type SaisieTransfert = {
  versBoutiqueId: string;
  /** Pourquoi on la déplace. Facultatif — voir `validerTransfert`. */
  motif: string;
};

export const TRANSFERT_VIDE: SaisieTransfert = { versBoutiqueId: "", motif: "" };

/**
 * La trace d'un déplacement, telle qu'elle se lit.
 *
 * Le châssis y est **recopié**, comme `createdByName` ailleurs. La boutique de
 * départ perd le droit d'ouvrir la moto à l'instant où celle-ci s'en va — or
 * c'est précisément elle qui se demande ce qui est parti. Sans cette copie, sa
 * liste de départs n'afficherait que des identifiants.
 */
export type Transfert = {
  id: string;
  motoId: string;
  numeroChassis: string;
  deBoutiqueId: string;
  versBoutiqueId: string;
  motif: string;
  /** `null` tant que l'horodatage serveur n'est pas résolu — saisie hors ligne. */
  date: Date | null;
  auteur: string;
};

/**
 * Cette moto peut-elle partir ?
 *
 * En stock, et rien d'autre. Une moto réservée ou vendue est promise à
 * quelqu'un : la déplacer ferait voyager la promesse avec elle sans que le
 * client qui l'attend en sache rien — et le gérant qui la lui a promise ne la
 * verrait même plus dans son stock pour s'en expliquer.
 */
export function peutPartir(moto: Moto): boolean {
  return moto.statut === "en_stock";
}

/**
 * Pourquoi elle ne peut pas partir, ou `null` si elle le peut.
 *
 * Un geste indisponible dit toujours pourquoi (`DESIGN.md` §10) : un bouton
 * éteint sans phrase envoie chercher la cause ailleurs.
 *
 * **Le statut passe avant l'absence de destination**, et l'ordre compte. Pour
 * une moto vendue dans une entreprise d'une seule boutique, annoncer « aucune
 * autre boutique » enverrait en déclarer une — alors que même avec dix, cette
 * moto-là ne partirait pas.
 */
export function raisonDeNePasPartir(moto: Moto, destinations: readonly Boutique[]): string | null {
  if (!peutPartir(moto)) {
    return `Cette moto est « ${LIBELLE_STATUT[moto.statut].toLowerCase()} » : seule une moto en stock se déplace.`;
  }
  if (destinations.length === 0) {
    return "Aucune autre boutique ouverte où l’envoyer.";
  }
  return null;
}

/**
 * Les boutiques où cette moto peut aller.
 *
 * Les ouvertes, moins celle où elle est déjà. L'ordre reçu est conservé : c'est
 * celui du périmètre, donc celui que la personne a l'habitude de lire.
 *
 * Une boutique fermée est aussi refusée par les règles — c'est cette garde-là
 * qui compte. La retirer ici évite seulement de proposer un geste qui échouerait.
 */
export function destinationsPossibles(
  boutiques: readonly Boutique[],
  origineId: string,
): Boutique[] {
  return boutiques.filter((boutique) => boutique.actif && boutique.id !== origineId);
}

/**
 * Ce qui manque à la saisie, ou `null` si elle est complète.
 *
 * **Le motif est facultatif.** L'exiger ferait taper « transfert » dans la case
 * à chaque fois : la trace se remplirait de bruit, et on ne pourrait plus
 * distinguer les déplacements qui avaient une raison de ceux qui n'en avaient
 * pas. Il est borné quand il est là.
 */
export function validerTransfert(saisie: SaisieTransfert, origineId: string): string | null {
  const vers = saisie.versBoutiqueId.trim();
  if (!vers) return "Choisissez la boutique de destination.";
  if (vers === origineId) return "Cette moto est déjà dans cette boutique.";
  if (saisie.motif.trim().length > LONGUEUR_MOTIF_MAX) {
    return `Le motif dépasse ${LONGUEUR_MOTIF_MAX} caractères.`;
  }
  return null;
}
