/**
 * L'arrivage — un lot de motos entrées ensemble, d'un même fournisseur (S42).
 *
 * Un lot vient d'un seul fournisseur, mais il peut mêler plusieurs marques et
 * modèles : on le saisit donc par **groupes**. Un groupe fixe une fois sa
 * marque, son modèle et son prix d'achat, puis liste les motos qui le
 * composent — chaque ligne ne porte que ce qui varie d'une moto à l'autre : son
 * numéro de châssis, et sa couleur.
 *
 * Le prix d'achat reste cloisonné (D2/S39) : il n'est saisi et validé, groupe
 * par groupe, que lorsque le rôle courant voit les coûts ; sinon il n'est ni lu
 * ni transmis.
 */

import {
  ANNEE_MIN,
  LONGUEUR_CHASSIS_MAX,
  LONGUEUR_TEXTE_MAX,
  MONTANT_MAX,
  chassisDejaPris,
  lireEntier,
  normaliserChassis,
  validerChassis,
  type EtatMoto,
  type Moto,
  type StatutMoto,
} from "./moto";

export type Arrivage = {
  id: string;
  boutiqueId: string;
  nom: string;
  fournisseurId: string;
  date: Date | null;
  description: string;
  dateCreation: Date | null;
  /* Annulation douce (S43) : un lot fautif qui porte déjà des motos ne s'efface
     pas — les motos existent et sont citées ailleurs. On le masque, réversible. */
  annule: boolean;
};

/** L'entête du lot : ce qui vaut pour tout l'arrivage, quel que soit le groupe. */
export type SaisieArrivage = {
  nom: string;
  fournisseurId: string;
  date: string; // AAAA-MM-JJ, ou vide
  description: string;
};

export const ARRIVAGE_VIDE: SaisieArrivage = {
  nom: "",
  fournisseurId: "",
  date: "",
  description: "",
};

/** Une ligne du tableau : ce qui distingue une moto du groupe des autres. */
export type LigneLot = {
  numeroChassis: string;
  couleur: string;
};

export const LIGNE_VIDE: LigneLot = { numeroChassis: "", couleur: "" };

/**
 * Un groupe de motos du lot : une marque, un modèle et un prix communs, et les
 * motos qui les partagent. Un même arrivage en compte un ou plusieurs.
 *
 * Le prix d'achat n'est rempli et validé que pour le responsable ; ignoré,
 * jamais transmis, pour un gérant.
 */
export type SousLot = {
  marqueId: string;
  modeleId: string;
  prixAchat: string;
  lignes: LigneLot[];
};

export const SOUS_LOT_VIDE: SousLot = {
  marqueId: "",
  modeleId: "",
  prixAchat: "",
  lignes: [{ ...LIGNE_VIDE }],
};

export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_DESCRIPTION_MAX = 200;

/* Un lot passe par un writeBatch (arrivage + N motos + N coûts), et un batch
   Firestore plafonne à 500 opérations. Bien en dessous, pour laisser de la
   marge et parce qu'au-delà la relecture d'un tel tableau devient illisible.
   Le plafond vaut pour tout le lot, groupes confondus. */
export const LIGNES_MAX = 80;

function estDateValide(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
}

export function validerArrivage(saisie: SaisieArrivage): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Donnez un nom à l’arrivage.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (!saisie.fournisseurId) return "Choisissez ou ajoutez un fournisseur : on doit savoir de qui vient ce lot.";

  if (saisie.date.trim() && !estDateValide(saisie.date.trim())) {
    return "La date d’arrivée n’est pas une date valide.";
  }
  if (saisie.description.trim().length > LONGUEUR_DESCRIPTION_MAX) {
    return `La description dépasse ${LONGUEUR_DESCRIPTION_MAX} caractères.`;
  }
  return null;
}

/**
 * Un groupe est valide s'il a sa marque. Le modèle est facultatif.
 *
 * **Pourquoi le modèle a cessé d'être exigé.** Un lot se réceptionne au
 * comptoir, caisses encore fermées : la marque se lit sur le carton, le modèle
 * souvent pas. L'exiger obligeait à inventer une entrée de référentiel pour
 * pouvoir enregistrer le lot — c'est-à-dire à salir le catalogue pour
 * contourner un champ, et à produire des « modèles » qui ne désignent rien.
 * Une moto sans modèle est une information exacte ; un modèle inventé est une
 * information fausse. On préfère la première.
 *
 * La marque, elle, reste exigée : c'est par elle que le stock se range et se
 * compte, et on la connaît toujours.
 */
export function validerSousLot(sousLot: SousLot): string | null {
  if (!sousLot.marqueId) return "Choisissez une marque : elle est commune au groupe de motos.";
  return null;
}

/** Une ligne est « engagée » — donc comptée et écrite — dès qu'elle a un châssis. */
export function ligneEngagee(l: LigneLot): boolean {
  return normaliserChassis(l.numeroChassis) !== "";
}

export function validerLigneLot(l: LigneLot): string | null {
  const messageChassis = validerChassis(l.numeroChassis);
  if (messageChassis) return messageChassis;
  if (l.couleur.trim().length > LONGUEUR_TEXTE_MAX) {
    return `La couleur dépasse ${LONGUEUR_TEXTE_MAX} caractères.`;
  }
  return null;
}

/**
 * Porte la liste des lignes à `nombre` éléments, sans jamais descendre sous une
 * ligne ni dépasser le plafond. Ce qui est déjà saisi est préservé — agrandir
 * puis rétrécir ne perd pas les châssis tapés entre-temps au-delà de la coupe.
 */
export function ajusterNombreDeLignes(lignes: LigneLot[], nombre: number): LigneLot[] {
  const cible = Math.max(1, Math.min(LIGNES_MAX, Math.floor(nombre) || 0));
  if (cible <= lignes.length) return lignes.slice(0, cible);
  return [...lignes, ...Array.from({ length: cible - lignes.length }, () => ({ ...LIGNE_VIDE }))];
}

export type Ecoulement = { total: number; vendues: number; restant: number };

/** Combien de motos d'un lot sont vendues, combien restent à écouler. */
export function ecoulement(motos: Pick<Moto, "arrivageId" | "statut">[], arrivageId: string): Ecoulement {
  const duLot = motos.filter((m) => m.arrivageId === arrivageId);
  const vendues = duLot.filter((m) => (m.statut as StatutMoto) === "vendue").length;
  return { total: duLot.length, vendues, restant: duLot.length - vendues };
}

export type CompletudePapiers = {
  total: number;
  cmcManquants: number;
  quittancesManquantes: number;
};

/**
 * Ce qui manque à un lot, papier par papier (S53).
 *
 * Le compteur d'avant ne regardait que le CMC. La quittance a la même nature et
 * se perd de la même façon ; n'en compter qu'un était ce qui faisait croire que
 * le produit « ne suit pas le vrai circuit ». Un compteur laissé derrière
 * redirait la moitié de la vérité.
 */
export function completudePapiers(
  motos: readonly Pick<Moto, "arrivageId" | "cmcRecu" | "quittanceRecue">[],
  arrivageId: string,
): CompletudePapiers {
  const duLot = motos.filter((m) => m.arrivageId === arrivageId);
  return {
    total: duLot.length,
    cmcManquants: duLot.filter((m) => !m.cmcRecu).length,
    quittancesManquantes: duLot.filter((m) => !m.quittanceRecue).length,
  };
}

/** Un lot est écoulé quand il a des motos et que toutes sont vendues. */
export function estEcoule(motos: Pick<Moto, "arrivageId" | "statut">[], arrivageId: string): boolean {
  const compte = ecoulement(motos, arrivageId);
  return compte.total > 0 && compte.restant === 0;
}

export type BilanArrivages = {
  arrivages: number;
  motosRecues: number;
  enStock: number;
  vendues: number;
  cmcManquants: number;
  quittancesManquantes: number;
};

/**
 * Les cinq compteurs de tête, lus sur les lots **non annulés** et leurs motos.
 * Une moto de saisie unitaire (sans `arrivageId`) n'entre pas dans un bilan
 * d'arrivages.
 */
export function bilanArrivages(
  arrivages: Pick<Arrivage, "id" | "annule">[],
  motos: Pick<Moto, "arrivageId" | "statut" | "cmcRecu" | "quittanceRecue">[],
): BilanArrivages {
  const actifs = arrivages.filter((a) => !a.annule);
  const ids = new Set(actifs.map((a) => a.id));
  const duLot = motos.filter((m) => m.arrivageId !== null && ids.has(m.arrivageId));
  return {
    arrivages: actifs.length,
    motosRecues: duLot.length,
    enStock: duLot.filter((m) => (m.statut as StatutMoto) === "en_stock").length,
    vendues: duLot.filter((m) => (m.statut as StatutMoto) === "vendue").length,
    cmcManquants: duLot.filter((m) => !m.cmcRecu).length,
    quittancesManquantes: duLot.filter((m) => !m.quittanceRecue).length,
  };
}

export type LotDuFournisseur = {
  arrivage: Arrivage;
  /** Les motos venues de ce lot, dans l'ordre où l'écoute les a rendues. */
  motos: Moto[];
  ecoulement: Ecoulement;
};

/**
 * Tous les lots pris chez un fournisseur, du plus récent au plus ancien.
 *
 * **Rien n'est lu ici.** La fonction reçoit les arrivages et les motos déjà
 * chargés, donc déjà bornés par les règles Firestore — la boutique du gérant,
 * toutes pour le responsable. C'est ce qui permet au même code de servir les
 * deux rôles sans savoir lequel regarde, et de répondre coupure faite (D66).
 *
 * **Les lots annulés restent.** L'annulation de S43 est douce : un lot fautif
 * qui porte déjà des motos ne s'efface pas, puisque ces motos existent et sont
 * citées ailleurs. Le masquer ferait mentir l'historique — ce lot a bien été
 * pris chez ce fournisseur. À l'écran de le marquer, pas à cette fonction de
 * l'oublier.
 *
 * **Un lot sans date passe devant.** Même lecture que `dansLaPeriode` : un lot
 * saisi hors ligne n'a pas encore l'horodatage du serveur, son champ vaut
 * `null` jusqu'à la synchronisation. Ce n'est pas un lot ancien, c'est le plus
 * récent de tous — celui qu'on vient d'enregistrer, et qu'on cherche du regard
 * pour vérifier qu'il est passé.
 */
export function lotsDuFournisseur(
  fournisseurId: string,
  arrivages: readonly Arrivage[],
  motos: readonly Moto[],
): LotDuFournisseur[] {
  return arrivages
    .filter((arrivage) => arrivage.fournisseurId === fournisseurId)
    .sort((a, b) => {
      if (a.date === null || b.date === null) {
        if (a.date === b.date) return a.nom.localeCompare(b.nom, "fr");
        return a.date === null ? -1 : 1;
      }
      return b.date.getTime() - a.date.getTime();
    })
    .map((arrivage) => ({
      arrivage,
      motos: motos.filter((moto) => moto.arrivageId === arrivage.id),
      ecoulement: ecoulement([...motos], arrivage.id),
    }));
}

export type FiltreArrivage = "tous" | "cmc-incomplets" | "ecoules";

/** Les lots actifs (jamais les annulés), restreints selon l'onglet choisi. */
export function filtrerArrivages(arrivages: Arrivage[], motos: Moto[], filtre: FiltreArrivage): Arrivage[] {
  const actifs = arrivages.filter((a) => !a.annule);
  /* Le filtre garde son nom d'URL — « cmc-incomplets » est dans les signets du
     commanditaire — mais compte les DEUX papiers depuis S53 : un lot dont les
     quittances manquent est tout aussi incomplet. Le libellé affiché, lui, dit
     « Papiers incomplets ». */
  if (filtre === "cmc-incomplets") {
    return actifs.filter((a) => {
      const papiers = completudePapiers(motos, a.id);
      return papiers.cmcManquants > 0 || papiers.quittancesManquantes > 0;
    });
  }
  if (filtre === "ecoules") return actifs.filter((a) => estEcoule(motos, a.id));
  return actifs;
}

/**
 * Retrouve une moto par son châssis : par égalité, ou par ses **derniers
 * caractères** (« les 5 derniers chiffres »). Casse et espaces ne comptent pas.
 * Une requête trop courte ne cherche rien — elle ramènerait tout le stock.
 */
export function chercherMotoParChassis(motos: Moto[], requete: string): Moto[] {
  const q = normaliserChassis(requete);
  if (q.length < 2) return [];
  return motos.filter((m) => normaliserChassis(m.numeroChassis).endsWith(q));
}

/** Une moto prête à écrire : ce qui vient de son groupe, plus ce qui lui est propre. */
export type MotoDuLot = {
  marqueId: string;
  modeleId: string;
  /* Prix du groupe, ou "" si aucun coût ne doit être écrit (gérant, ou prix
     vide) : ce champ ne porte jamais de coût pour qui ne voit pas les coûts. */
  prixAchat: string;
  numeroChassis: string;
  couleur: string;
};

export type ResultatLot = { ok: true; motos: MotoDuLot[] } | { ok: false; erreur: string };

/**
 * Prépare un lot avant écriture : valide l'entête, puis chaque groupe et ses
 * lignes engagées, refuse les doublons de châssis (dans **tout** le lot, groupes
 * confondus, **et** contre le stock), et rend la liste à plat des motos à écrire
 * — chacune portant la marque, le modèle et le prix de son groupe.
 *
 * Un groupe sans aucune moto est ignoré (comme une ligne vide). Le prix n'est
 * porté sur les motos que si `voitCouts` ; sinon il est mis à "" — aucun coût ne
 * franchit cette frontière (D2/S39).
 *
 * `stock` à `null` veut dire « pas encore lu » : on refuse de décider, comme les
 * six contrôles d'unicité de S40 (D95).
 */
export function preparerLot(
  saisie: SaisieArrivage,
  sousLots: SousLot[],
  stock: Moto[] | null,
  voitCouts: boolean,
): ResultatLot {
  const messageEntete = validerArrivage(saisie);
  if (messageEntete) return { ok: false, erreur: messageEntete };

  if (stock === null) {
    return { ok: false, erreur: "Le stock n’a pas fini d’arriver. Réessayez dans un instant." };
  }

  const motos: MotoDuLot[] = [];
  const vus = new Set<string>();

  for (const sousLot of sousLots) {
    const engagees = sousLot.lignes.filter(ligneEngagee);
    if (engagees.length === 0) continue; // groupe vide : ignoré

    const messageGroupe = validerSousLot(sousLot);
    if (messageGroupe) return { ok: false, erreur: messageGroupe };

    let prix = "";
    if (voitCouts && sousLot.prixAchat.trim()) {
      const montant = lireEntier(sousLot.prixAchat);
      if (montant === null) return { ok: false, erreur: "Le prix d’achat s’écrit en chiffres entiers." };
      if (montant > MONTANT_MAX) return { ok: false, erreur: "Le prix d’achat dépasse le maximum admis." };
      prix = sousLot.prixAchat;
    }

    for (const l of engagees) {
      const message = validerLigneLot(l);
      if (message) return { ok: false, erreur: message };

      const chassis = normaliserChassis(l.numeroChassis);
      if (vus.has(chassis)) {
        return { ok: false, erreur: `Le châssis ${chassis} apparaît deux fois dans le lot.` };
      }
      vus.add(chassis);

      if (chassisDejaPris(chassis, stock)) {
        return { ok: false, erreur: `Le châssis ${chassis} est déjà en stock.` };
      }

      motos.push({
        marqueId: sousLot.marqueId,
        modeleId: sousLot.modeleId,
        prixAchat: prix,
        numeroChassis: l.numeroChassis,
        couleur: l.couleur,
      });
    }
  }

  if (motos.length === 0) {
    return { ok: false, erreur: "Renseignez au moins une moto : son numéro de châssis." };
  }
  if (motos.length > LIGNES_MAX) {
    return { ok: false, erreur: `Un lot ne dépasse pas ${LIGNES_MAX} motos. Enregistrez-le en plusieurs fois.` };
  }

  return { ok: true, motos };
}

/* --- Corriger les motos d'un lot (26 octobre 2026) ------------------------ */

/**
 * Une moto du lot, telle qu'on la reprend ligne par ligne.
 *
 * **Pourquoi ce geste n'existait pas, et pourquoi il manquait.** Une moto
 * s'écrivait une fois, à la réception, et plus rien ne reprenait son identité :
 * ni la fiche, ni l'arrivage, dont la modale annonçait « l'entête seule ». Or
 * un châssis se relève à la main sur un cadre, parfois sous la poussière — le
 * commanditaire l'a dit ainsi : « au cas où si le client se trompe à
 * l'enregistrement ». Un chiffre faux restait faux pour toujours, sur
 * l'identité physique de l'engin.
 *
 * **Tout ce qui décrit la moto, et rien de ce qui lui est arrivé.** Marque,
 * modèle, châssis, moteur, couleur, année, état : ce que la réception a saisi.
 * Le statut, la boutique, les papiers, le coût et la date d'entrée n'y sont
 * pas — ce sont des faits qui se sont produits, pas des cases qu'on remplit, et
 * chacun a son geste ailleurs. Le coût en particulier vit dans une
 * sous-collection que le gérant ne lit pas (D2).
 *
 * Les montants sont du texte, comme partout dans les saisies de ce dépôt : un
 * champ vidé doit pouvoir rester vide sans devenir zéro.
 */
export type LigneCorrection = {
  motoId: string;
  marqueId: string;
  modeleId: string;
  numeroChassis: string;
  numeroMoteur: string;
  couleur: string;
  annee: string;
  etat: EtatMoto;
};

/** Ce qui part en base pour une moto corrigée — l'année déjà lue. */
export type ChampsCorrectionMoto = Omit<LigneCorrection, "annee"> & { annee: number | null };

export type CorrectionLot =
  | { ok: true; corrigees: ChampsCorrectionMoto[] }
  /** `rang` est l'indice de la ligne fautive : la grille l'allume. */
  | { ok: false; erreur: string; rang: number | null };

/** Les lignes de départ : ce que les motos du lot portent aujourd'hui. */
export function lignesDuLot(motos: readonly Moto[]): LigneCorrection[] {
  return motos.map((moto) => ({
    motoId: moto.id,
    marqueId: moto.marqueId,
    modeleId: moto.modeleId,
    numeroChassis: moto.numeroChassis,
    numeroMoteur: moto.numeroMoteur,
    couleur: moto.couleur,
    /* `null` veut dire « on ne sait pas » (D82) et s'écrit vide : un champ ne
       sait pas afficher l'ignorance autrement, et « 0 » serait une date. */
    annee: moto.annee === null ? "" : String(moto.annee),
    etat: moto.etat,
  }));
}

function ligneInchangee(ligne: LigneCorrection, avant: Moto): boolean {
  return (
    ligne.marqueId === avant.marqueId &&
    ligne.modeleId === avant.modeleId &&
    normaliserChassis(ligne.numeroChassis) === avant.numeroChassis &&
    normaliserChassis(ligne.numeroMoteur) === avant.numeroMoteur &&
    ligne.couleur.trim() === avant.couleur &&
    ligne.annee.trim() === (avant.annee === null ? "" : String(avant.annee)) &&
    ligne.etat === avant.etat
  );
}

/**
 * Valide la reprise d'un lot et rend les seules motos qui ont changé.
 *
 * **Seules celles qui ont changé.** Réécrire les trente motos d'un lot pour
 * une faute de frappe sur une seule gonflerait le lot d'écritures et salirait
 * la trace des vingt-neuf autres : leur `updatedAt` dirait qu'on les a
 * touchées, ce qui est faux et se lit ensuite comme un indice.
 *
 * **L'unicité du châssis est vérifiée contre tout le stock**, chaque moto
 * étant exemptée d'elle-même : sans cette exemption, corriger une couleur
 * ferait refuser la ligne pour un doublon avec elle-même. Un stock pas encore
 * lu (`null`) ne laisse rien décider — c'est D95, comme les six contrôles
 * d'unicité de S40.
 *
 * **Rien n'est bloqué sur le statut.** Une moto vendue au châssis faux est
 * précisément le cas qu'il faut pouvoir réparer : la vente pointe la moto par
 * son identifiant, jamais par son châssis, donc la correction remonte partout
 * d'un coup.
 */
export function preparerCorrectionLot(
  lignes: readonly LigneCorrection[],
  avant: readonly Moto[],
  stock: Moto[] | null,
): CorrectionLot {
  if (stock === null) {
    return {
      ok: false,
      erreur: "Le stock n’a pas fini d’arriver. Réessayez dans un instant.",
      rang: null,
    };
  }

  const parId = new Map(avant.map((moto) => [moto.id, moto]));
  const corrigees: ChampsCorrectionMoto[] = [];
  const vus = new Set<string>();
  const limiteAnnee = new Date().getFullYear() + 1;

  for (const [rang, ligne] of lignes.entries()) {
    const precedente = parId.get(ligne.motoId);
    if (!precedente) {
      return { ok: false, erreur: "Cette moto n’est plus dans le lot.", rang };
    }

    if (!ligne.marqueId) {
      return { ok: false, erreur: "Choisissez une marque : une moto en a toujours une.", rang };
    }

    const messageChassis = validerChassis(ligne.numeroChassis);
    if (messageChassis) return { ok: false, erreur: messageChassis, rang };

    const chassis = normaliserChassis(ligne.numeroChassis);
    if (vus.has(chassis)) {
      return { ok: false, erreur: `Le châssis ${chassis} apparaît deux fois dans le lot.`, rang };
    }
    vus.add(chassis);

    if (chassisDejaPris(chassis, stock, ligne.motoId)) {
      return { ok: false, erreur: `Le châssis ${chassis} est déjà en stock.`, rang };
    }

    const moteur = normaliserChassis(ligne.numeroMoteur);
    if (moteur.length > LONGUEUR_CHASSIS_MAX) {
      return {
        ok: false,
        erreur: `Le numéro de moteur dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`,
        rang,
      };
    }
    if (ligne.couleur.trim().length > LONGUEUR_TEXTE_MAX) {
      return { ok: false, erreur: `La couleur dépasse ${LONGUEUR_TEXTE_MAX} caractères.`, rang };
    }

    let annee: number | null = null;
    if (ligne.annee.trim()) {
      annee = lireEntier(ligne.annee);
      if (annee === null || annee < ANNEE_MIN || annee > limiteAnnee) {
        return {
          ok: false,
          erreur: `L’année doit être comprise entre ${ANNEE_MIN} et ${limiteAnnee}.`,
          rang,
        };
      }
    }

    if (ligneInchangee(ligne, precedente)) continue;

    corrigees.push({
      motoId: ligne.motoId,
      marqueId: ligne.marqueId,
      modeleId: ligne.modeleId,
      numeroChassis: chassis,
      numeroMoteur: moteur,
      couleur: ligne.couleur.trim(),
      annee,
      etat: ligne.etat,
    });
  }

  return { ok: true, corrigees };
}
