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
  /* Le lot d'arrivage dont la moto vient (S42). Nul pour une saisie unitaire :
     une moto tient son origine soit d'une provenance, soit d'un arrivage. */
  arrivageId: string | null;
  papiersFournis: string[];
  photos: string[];
  statut: StatutMoto;
  dateEntree: Date | null;
  /* Les scans de la quittance et du CMC (D66). Chemins Storage, pas URL : une
     URL de téléchargement se redemande à chaque lecture et finit par expirer.
     Nuls tant que personne n'a envoyé le fichier — ce qui reste possible plus
     tard, l'envoi étant la seule opération de S11 qui exige du réseau. */
  quittanceChemin: string | null;
  cmcChemin: string | null;
  /* Le CMC de cette moto est-il en main ? Témoin coché à la main (S43), distinct
     du scan `cmcChemin` : on peut avoir reçu la carte sans l'avoir encore
     photographiée, et inversement. C'est lui qui nourrit le décompte des « CMC
     manquants » d'un arrivage. Rien à voir avec le stock de cartes de S16. */
  cmcRecu: boolean;
};

/** Les deux papiers qu'une moto peut porter en pièce jointe (D66). */
export const PAPIERS_MOTO = ["quittance", "cmc"] as const;
export type PapierMoto = (typeof PAPIERS_MOTO)[number];

export const LIBELLE_PAPIER: Record<PapierMoto, string> = {
  quittance: "Quittance",
  cmc: "CMC",
};

export const CHAMP_PAPIER: Record<PapierMoto, "quittanceChemin" | "cmcChemin"> = {
  quittance: "quittanceChemin",
  cmc: "cmcChemin",
};

/** 5 Mo : au-delà, un envoi depuis un téléphone en 3G n'aboutit pas. */
export const TAILLE_FICHIER_MAX = 5 * 1024 * 1024;

export const TYPES_FICHIER_ADMIS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Le fichier est-il envoyable ? Renvoie le refus, ou `null`.
 *
 * Vérifié ici **et** dans les règles Storage : ce contrôle-ci évite d'user une
 * connexion faible pour rien, celui des règles est le seul qui protège.
 */
export function validerFichierPapier(fichier: { type: string; size: number }): string | null {
  if (!TYPES_FICHIER_ADMIS.includes(fichier.type)) {
    return "Envoyez une photo (JPEG, PNG, WebP) ou un PDF.";
  }
  if (fichier.size > TAILLE_FICHIER_MAX) {
    return "Ce fichier dépasse 5 Mo. Photographiez le document plutôt que de le scanner en haute définition.";
  }
  if (fichier.size === 0) return "Ce fichier est vide.";
  return null;
}

/** Une ligne de frais d'entrée : remise en état, transport, commission… */
export type FraisEntree = {
  typeFraisId: string;
  montant: number;
  note: string;
};

/**
 * Le côté privé : lu et écrit par le seul responsable (D2, S39).
 *
 * Il l'était écrit par le gérant jusqu'à S39 — il saisissait un montant qu'il
 * ne pouvait pas relire (D4). Le commanditaire a tranché autrement : le gérant
 * fait entrer la moto, la supervision pose ce qu'elle a coûté.
 */
export type CoutMoto = {
  prixAchat: number;
  fraisEntree: FraisEntree[];
  coutTotal: number;
};

/**
 * La part « coût » d'une saisie, isolée parce qu'elle a deux points d'entrée.
 *
 * Le formulaire d'entrée en stock la porte — pour le responsable seulement — et
 * l'écran de supervision qui pose un coût après coup la porte aussi, seule.
 * Un seul type, une seule validation, donc une seule réponse à « ce coût
 * est-il bien formé ».
 */
export type SaisieCout = {
  prixAchat: string;
  fraisEntree: { typeFraisId: string; montant: string; note: string }[];
};

export const COUT_VIDE: SaisieCout = { prixAchat: "", fraisEntree: [] };

export type SaisieMoto = SaisieCout & {
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
  ...COUT_VIDE,
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

/**
 * Le numéro de châssis est-il recevable ? Message à afficher, ou `null`.
 *
 * Isolé de `validerMoto` pour que la saisie d'un lot (S42) applique la même
 * règle à chaque ligne sans dupliquer la normalisation ni le motif.
 */
export function validerChassis(numero: string): string | null {
  const chassis = normaliserChassis(numero);
  if (!chassis) return "Le numéro de châssis est obligatoire : c’est l’identité de la moto.";
  if (chassis.length > LONGUEUR_CHASSIS_MAX) {
    return `Le numéro de châssis dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`;
  }
  if (!/^[A-Z0-9]+$/.test(chassis)) {
    return "Le numéro de châssis ne contient que des lettres et des chiffres.";
  }
  return null;
}

export function validerMoto(saisie: SaisieMoto): string | null {
  if (!saisie.marqueId) return "Choisissez une marque.";
  if (!saisie.modeleId) return "Choisissez un modèle.";
  if (!saisie.provenanceId) return "Choisissez une provenance.";

  const messageChassis = validerChassis(saisie.numeroChassis);
  if (messageChassis) return messageChassis;

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

  if (saisie.prixVenteConseille.trim()) {
    const conseille = lireEntier(saisie.prixVenteConseille);
    if (conseille === null) return "Le prix de vente conseillé doit être un nombre entier.";
    if (conseille > MONTANT_MAX) return "Le prix de vente conseillé dépasse le maximum admis.";
  }

  return validerCout(saisie);
}

/**
 * Un coût a-t-il été saisi ?
 *
 * Le prix d'achat est ce qui fait exister le coût : sans lui il n'y a rien à
 * écrire. Des frais seuls seraient un total sans son principal — c'est refusé
 * par `validerCout`, pas ignoré.
 */
export function coutRenseigne(saisie: SaisieCout): boolean {
  return saisie.prixAchat.trim() !== "";
}

/**
 * Valide la part « coût », **sans exiger qu'elle soit remplie**.
 *
 * Depuis S39 une moto peut entrer en stock sans coût : le gérant ne le saisit
 * plus, et la supervision le pose après coup. Un prix d'achat absent n'est donc
 * pas une erreur de saisie, c'est un état du stock.
 */
export function validerCout(saisie: SaisieCout): string | null {
  const renseigne = coutRenseigne(saisie);

  if (renseigne) {
    const prixAchat = lireEntier(saisie.prixAchat);
    if (prixAchat === null) return "Le prix d’achat s’écrit en chiffres entiers.";
    if (prixAchat > MONTANT_MAX) return "Le prix d’achat dépasse le maximum admis.";
  } else if (saisie.fraisEntree.length > 0) {
    /* Des frais sans prix d'achat donneraient un coût total égal aux seuls
       frais, donc une marge fausse et non pas absente. On refuse plutôt que
       d'écrire un chiffre qui a l'air d'un coût. */
    return "Les frais d’entrée accompagnent un prix d’achat : saisissez-le, ou retirez les frais.";
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

/**
 * La même validation, là où le prix d'achat **est** le sujet.
 *
 * L'écran de supervision sert à poser un coût manquant : y valider un
 * formulaire vide l'écrirait à zéro, c'est-à-dire « acquise gratuitement »
 * au lieu de « on ne sait pas » (D82).
 */
export function validerCoutPose(saisie: SaisieCout): string | null {
  if (!coutRenseigne(saisie)) return "Saisissez le prix d’achat de cette moto.";
  return validerCout(saisie);
}

/** Le coût prêt à écrire, ou `null` s'il n'y en a pas à écrire. */
export function construireCout(saisie: SaisieCout): CoutMoto | null {
  if (!coutRenseigne(saisie)) return null;
  const prixAchat = lireEntier(saisie.prixAchat) ?? 0;
  const fraisEntree = saisie.fraisEntree.map((ligne) => ({
    typeFraisId: ligne.typeFraisId,
    montant: lireEntier(ligne.montant) ?? 0,
    note: ligne.note.trim(),
  }));
  return { prixAchat, fraisEntree, coutTotal: coutTotal(prixAchat, fraisEntree) };
}

/** Le coût total d'une saisie encore en cours, pour l'afficher pendant la frappe. */
export function coutTotalSaisie(saisie: SaisieCout): number {
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
