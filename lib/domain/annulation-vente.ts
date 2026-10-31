import type { DossierCarteGrise } from "./dossier-carte-grise";
import { numeroLisible } from "./numerotation";
import {
  estEngagement,
  type MoyenPaiement,
  type SaisieVenteGroupee,
  type Vente,
  type Versement,
} from "./vente";

/**
 * Annuler et corriger une vente de moto (S25).
 *
 * **Rien ne s'efface** (D10). Une vente annulée reste en base, marquée ; ce qui
 * la neutralise s'écrit à côté — un encaissement de sens inverse par versement,
 * la moto rendue au stock, le dossier de carte grise écarté ou marqué. Ce
 * module calcule ces écritures ; `lib/repositories/ventes.ts` les pose en un
 * seul lot.
 *
 * **Une correction est une annulation suivie d'une nouvelle vente**, sous un
 * nouveau numéro (arbitrage du 31 octobre 2026). Il n'existe pas de vente
 * réécrite : c'est ce qui garde chaque reçu remis au client fidèle à ce qui a
 * été enregistré sous son numéro.
 */

/** La borne du motif, la même que la règle (`firestore.rules`). */
export const LONGUEUR_MOTIF_ANNULATION_MAX = 200;

/** Le motif est obligatoire : c'est lui qui rend une annulation lisible des mois plus tard. */
export function validerMotifAnnulation(motif: string): string | null {
  const propre = motif.trim();
  if (propre === "") return "Dites pourquoi la vente est annulée : le motif est obligatoire.";
  if (propre.length > LONGUEUR_MOTIF_ANNULATION_MAX) {
    return `Le motif ne doit pas dépasser ${LONGUEUR_MOTIF_ANNULATION_MAX} caractères.`;
  }
  return null;
}

/** Un remboursement : ce qui ressort de la caisse pour un versement. */
export type Remboursement = {
  versementId: string;
  montant: number;
  moyenPaiement: MoyenPaiement;
  /**
   * Repris de la nature de l'argent rendu : un dépôt de tranches, moto encore
   * au magasin, était un engagement et non une recette (§6.2). Le rendre ne
   * doit pas faire baisser la recette du jour.
   */
  categorieTranches: boolean;
};

/**
 * L'argent à rendre, versement par versement.
 *
 * **Un remboursement par versement, et non un total.** Chaque versement a été
 * reçu par un moyen — espèces, Orange Money… — et c'est par ce moyen qu'il
 * ressort : la caisse des espèces et celle du mobile money ne se compensent
 * pas. Les versements eux-mêmes ne bougent pas : un versement ne se retouche
 * pas, pour personne (D58).
 */
export function remboursementsDAnnulation(
  vente: Pick<Vente, "id" | "modePaiement" | "motoRemise">,
  versements: readonly Versement[],
): Remboursement[] {
  const categorieTranches = estEngagement(vente.modePaiement, vente.motoRemise);
  return versements
    .filter((versement) => versement.venteId === vente.id && versement.montant > 0)
    .map((versement) => ({
      versementId: versement.id,
      montant: versement.montant,
      moyenPaiement: versement.moyenPaiement,
      categorieTranches,
    }));
}

/** La somme rendue au client, annoncée avant le geste. */
export function totalARendre(
  vente: Pick<Vente, "id" | "modePaiement" | "motoRemise">,
  versements: readonly Versement[],
): number {
  return remboursementsDAnnulation(vente, versements).reduce(
    (somme, remboursement) => somme + remboursement.montant,
    0,
  );
}

/**
 * Ce que devient le dossier de carte grise d'une vente annulée.
 *
 * - **Jamais parti** : il passe « sans objet » et quitte le classeur. Il n'y a
 *   plus de carte à faire pour une vente qui n'existe plus.
 * - **Déjà parti** — un dépôt, un prestataire, une plaque, un retour : il
 *   reste, marqué « vente annulée » (arbitrage du 31 octobre 2026). La carte
 *   est quelque part ; l'effacer du classeur la ferait perdre de vue.
 */
export function dossierApresAnnulation(
  dossier: Pick<
    DossierCarteGrise,
    "deposeLe" | "prestataireNom" | "immatriculation" | "revenuLe" | "remisLe"
  >,
): { statut: "non_applicable" } | { venteAnnulee: true } {
  const parti =
    dossier.deposeLe !== null ||
    dossier.prestataireNom.trim() !== "" ||
    dossier.immatriculation.trim() !== "" ||
    dossier.revenuLe !== null ||
    dossier.remisLe !== null;
  return parti ? { venteAnnulee: true } : { statut: "non_applicable" };
}

/** Le motif posé sur la vente que corrige une autre : il dit laquelle. */
export function motifDeCorrection(numeroNouvelle: string): string {
  return `Corrigée par la vente ${numeroLisible(numeroNouvelle)}`;
}

/**
 * La saisie d'où repart une correction : la vente telle qu'elle a été saisie.
 *
 * Le montant reçu est **tout ce qui a été versé**, et pas seulement l'acompte
 * du jour : la correction rend l'ancien argent et encaisse le nouveau, et si
 * rien ne change, les deux s'annulent au franc près. Le moyen et la référence
 * sont ceux du dernier versement — le geste de caisse le plus récent.
 */
export function saisieDeCorrection(
  vente: Pick<
    Vente,
    "id" | "motoId" | "clientId" | "prixConvenu" | "modePaiement" | "carteGrise" | "casque"
  >,
  versements: readonly Versement[],
): SaisieVenteGroupee {
  const siens = versements
    .filter((versement) => versement.venteId === vente.id)
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  const verse = siens.reduce((somme, versement) => somme + versement.montant, 0);
  const dernier = siens.at(-1);

  return {
    motos: [{ motoId: vente.motoId, prixConvenu: String(vente.prixConvenu) }],
    clientId: vente.clientId,
    modePaiement: vente.modePaiement,
    /* Une vente d'avant S44 ne disait rien des deux cases : on repart du cas
       ordinaire, cochées, comme une vente neuve. */
    carteGrise: vente.carteGrise ?? true,
    casque: vente.casque ?? true,
    montantEncaisse: verse > 0 ? String(verse) : "",
    moyenPaiement: dernier?.moyenPaiement ?? "especes",
    reference: dernier?.reference ?? "",
  };
}
