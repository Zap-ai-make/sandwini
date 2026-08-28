/**
 * Une moto en stock.
 *
 * Le document est coupé en deux, et ce n'est pas un détail d'implémentation :
 * `motos/{id}` est lisible par le gérant de la boutique, `motos/{id}/prive/cout`
 * par le seul responsable. Firestore ne sait pas masquer un champ — un document
 * lisible est lisible en entier — donc le cahier des charges (§8 : la marge est
 * réservée au responsable) impose cette coupure (`DECISIONS.md` D2).
 *
 * Tout ce qui touche à l'argent d'achat vit du côté privé. Ce qui reste ici est
 * ce dont on a besoin pour vendre : quelle moto, quel châssis, quel état.
 */

import { ecrireLignes, lireLignes } from "./saisie";

export const ETATS = ["neuve", "occasion"] as const;
export type EtatMoto = (typeof ETATS)[number];

export const LIBELLE_ETAT: Record<EtatMoto, string> = {
  neuve: "Neuve",
  occasion: "Occasion",
};

/** Les quatre statuts du cahier des charges. S5 n'en produit qu'un. */
export const STATUTS = ["en_stock", "reservee", "vendue", "transferee"] as const;
export type StatutMoto = (typeof STATUTS)[number];

export const LIBELLE_STATUT: Record<StatutMoto, string> = {
  en_stock: "En stock",
  reservee: "Réservée",
  vendue: "Vendue",
  transferee: "Transférée",
};

export type Moto = {
  id: string;
  boutiqueId: string;
  etat: EtatMoto;
  marqueId: string;
  modeleId: string;
  couleur: string;
  annee: number | null;
  numeroChassis: string;
  numeroMoteur: string;
  prixVenteConseille: number | null;
  provenanceId: string;
  papiersFournis: string[];
  photos: string[];
  statut: StatutMoto;
  dateEntree: Date | null;
};

/** Une ligne de frais d'entrée : remise en état, transport, commission… */
export type FraisEntree = {
  typeFraisId: string;
  montant: number;
  note: string;
};

/** Le côté privé : jamais lu par un gérant, écrit par lui à la saisie (D4). */
export type CoutMoto = {
  prixAchat: number;
  fraisEntree: FraisEntree[];
  coutTotal: number;
};

export type SaisieMoto = {
  etat: EtatMoto;
  marqueId: string;
  modeleId: string;
  couleur: string;
  annee: string;
  numeroChassis: string;
  numeroMoteur: string;
  prixVenteConseille: string;
  provenanceId: string;
  papiersFournis: string;
  prixAchat: string;
  fraisEntree: { typeFraisId: string; montant: string; note: string }[];
};

export const SAISIE_VIDE: SaisieMoto = {
  etat: "neuve",
  marqueId: "",
  modeleId: "",
  couleur: "",
  annee: "",
  numeroChassis: "",
  numeroMoteur: "",
  prixVenteConseille: "",
  provenanceId: "",
  papiersFournis: "",
  prixAchat: "",
  fraisEntree: [],
};

export const LONGUEUR_CHASSIS_MAX = 32;
export const LONGUEUR_TEXTE_MAX = 60;
export const LONGUEUR_NOTE_MAX = 120;
export const MONTANT_MAX = 1_000_000_000;
export const ANNEE_MIN = 1950;

/**
 * Forme canonique d'un numéro de châssis.
 *
 * C'est l'identité physique de la moto, relevée à la main sur le cadre, parfois
 * sous la poussière. Les espaces et la casse ne veulent rien dire ; les
 * confondre évite de créer deux fois la même moto — ou de ne pas la retrouver
 * en la cherchant.
 */
export function normaliserChassis(brut: string): string {
  return brut.replace(/[\s-]+/g, "").toUpperCase();
}

/** Le nombre saisi, ou `null` si le champ ne contient pas un entier utilisable. */
export function lireEntier(brut: string): number | null {
  const propre = brut.replace(/[\s ]/g, "");
  if (!/^\d+$/.test(propre)) return null;
  const valeur = Number(propre);
  return Number.isSafeInteger(valeur) ? valeur : null;
}

/** Le coût réel d'entrée : prix d'achat plus tous les frais (`prompt.md` §5.2). */
export function coutTotal(prixAchat: number, frais: { montant: number }[]): number {
  return frais.reduce((somme, ligne) => somme + ligne.montant, prixAchat);
}

/** Les papiers fournis, un par ligne — on ne les invente pas en référentiel. */
export function lirePapiers(brut: string): string[] {
  return lireLignes(brut);
}

export function ecrirePapiers(papiers: string[]): string {
  return ecrireLignes(papiers);
}

export function validerMoto(saisie: SaisieMoto): string | null {
  if (!saisie.marqueId) return "Choisissez une marque.";
  if (!saisie.modeleId) return "Choisissez un modèle.";
  if (!saisie.provenanceId) return "Choisissez une provenance.";

  const chassis = normaliserChassis(saisie.numeroChassis);
  if (!chassis) return "Le numéro de châssis est obligatoire : c’est l’identité de la moto.";
  if (chassis.length > LONGUEUR_CHASSIS_MAX) {
    return `Le numéro de châssis dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`;
  }
  if (!/^[A-Z0-9]+$/.test(chassis)) {
    return "Le numéro de châssis ne contient que des lettres et des chiffres.";
  }

  if (normaliserChassis(saisie.numeroMoteur).length > LONGUEUR_CHASSIS_MAX) {
    return `Le numéro de moteur dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`;
  }
  if (saisie.couleur.trim().length > LONGUEUR_TEXTE_MAX) {
    return `La couleur dépasse ${LONGUEUR_TEXTE_MAX} caractères.`;
  }

  if (saisie.annee.trim()) {
    const annee = lireEntier(saisie.annee);
    const limite = new Date().getFullYear() + 1;
    if (annee === null || annee < ANNEE_MIN || annee > limite) {
      return `L’année doit être comprise entre ${ANNEE_MIN} et ${limite}.`;
    }
  }

  const prixAchat = lireEntier(saisie.prixAchat);
  if (prixAchat === null) return "Le prix d’achat est obligatoire, en chiffres entiers.";
  if (prixAchat > MONTANT_MAX) return "Le prix d’achat dépasse le maximum admis.";

  if (saisie.prixVenteConseille.trim()) {
    const conseille = lireEntier(saisie.prixVenteConseille);
    if (conseille === null) return "Le prix de vente conseillé doit être un nombre entier.";
    if (conseille > MONTANT_MAX) return "Le prix de vente conseillé dépasse le maximum admis.";
  }

  for (const ligne of saisie.fraisEntree) {
    if (!ligne.typeFraisId) return "Chaque frais doit avoir un type.";
    const montant = lireEntier(ligne.montant);
    if (montant === null || montant <= 0) {
      return "Chaque frais doit porter un montant en chiffres, supérieur à zéro.";
    }
    if (montant > MONTANT_MAX) return "Un frais dépasse le maximum admis.";
    if (ligne.note.trim().length > LONGUEUR_NOTE_MAX) {
      return `Une note de frais dépasse ${LONGUEUR_NOTE_MAX} caractères.`;
    }
  }

  return null;
}

/** Le coût total d'une saisie encore en cours, pour l'afficher pendant la frappe. */
export function coutTotalSaisie(saisie: SaisieMoto): number {
  const prixAchat = lireEntier(saisie.prixAchat) ?? 0;
  const frais = saisie.fraisEntree.map((ligne) => ({ montant: lireEntier(ligne.montant) ?? 0 }));
  return coutTotal(prixAchat, frais);
}

export type Filtres = {
  recherche: string;
  etat: EtatMoto | "";
  marqueId: string;
  modeleId: string;
};

export const FILTRES_VIDES: Filtres = { recherche: "", etat: "", marqueId: "", modeleId: "" };

/**
 * Filtre le stock en mémoire.
 *
 * Le stock d'une boutique se compte en dizaines : le charger entier et filtrer
 * ici donne une recherche instantanée qui marche sans réseau, là où une requête
 * indexée ne marcherait qu'en ligne.
 *
 * La recherche porte sur le châssis — c'est ce qu'on a sous les yeux quand on
 * cherche une moto précise — et accepte un fragment, parce qu'on relève souvent
 * les derniers caractères plutôt que la suite entière.
 */
export function filtrerMotos(motos: Moto[], filtres: Filtres): Moto[] {
  const recherche = normaliserChassis(filtres.recherche);
  return motos.filter((moto) => {
    if (filtres.etat && moto.etat !== filtres.etat) return false;
    if (filtres.marqueId && moto.marqueId !== filtres.marqueId) return false;
    if (filtres.modeleId && moto.modeleId !== filtres.modeleId) return false;
    if (recherche && !moto.numeroChassis.includes(recherche)) return false;
    return true;
  });
}

/** La moto qui porte déjà ce châssis, s'il y en a une. */
export function chassisDejaPris(chassis: string, stock: Moto[], sauf?: string): Moto | undefined {
  const cible = normaliserChassis(chassis);
  return stock.find((moto) => moto.id !== sauf && moto.numeroChassis === cible);
}
