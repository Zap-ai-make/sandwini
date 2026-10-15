/**
 * Le dossier documents — sa machine à états (`prompt.md` §7).
 *
 * Un dossier est l'ensemble vente + paiements + ses documents (§13). Ce
 * module ne sait rien de Firestore ni de React : il dit ce qu'un document a le
 * droit de devenir, et quand un dossier est fini. Ces règles sont réutilisées
 * telles quelles par la page client (S13) et la page prestataire (S15), qui les
 * appliqueront côté serveur — d'où le fait qu'elles vivent ici, en fonctions
 * pures, plutôt qu'en conditions dispersées dans des composants.
 *
 * **Les documents ne suivent pas le même chemin** (`DECISIONS.md` D65).
 * Deux d'entre eux arrivent déjà faits, deux passent par un prestataire ; le
 * chemin dépend donc du type, pas seulement du statut de départ.
 */

import {
  lireMontant,
  MONTANT_MAX,
  TYPES_DOCUMENT,
  type DocumentDossier,
  type MoyenPaiement,
  type PapiersEmportes,
  type StatutDocument,
  type StatutDossier,
  type TypeDocument,
} from "./vente";

/**
 * Ce qui arrive avec la moto : la **quittance** et le **CMC**.
 *
 * **Ils n'ont plus d'étapes depuis S53.** Leur disponibilité vit sur la moto
 * (`quittanceRecue`, `cmcRecu`) et leur remise sur la vente (`emporte`) : le
 * dossier n'a plus rien à stocker pour eux, sinon le fait qu'ils soient
 * écartés. Le seul passage qui subsiste est donc vers « sans objet ».
 *
 * Suivre deux fois le même papier était la contradiction B de la spec : une
 * moto dont le CMC avait été coché à l'arrivage ouvrait quand même un document
 * à `a_faire`, qu'il fallait repromener à la main jusqu'à `remis_client`.
 */
const CHEMIN_SANS_ETAPE: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["non_applicable"],
  chez_prestataire: [],
  revenu_magasin: [],
  remis_client: [],
  non_applicable: [],
};

/**
 * Ce qui passe par un prestataire : la **carte grise**. Le dépôt exige un
 * prestataire, une date et une avance versée (§7.1), et l'étape ne se saute pas
 * — c'est elle qui dit qui détient le document.
 *
 * La plaque suivait le même chemin jusqu'à S48 ; elle a quitté le dossier,
 * l'immatriculation étant obtenue avec la carte grise et chez le même
 * prestataire. Le chemin reste écrit à part : il n'a aucune raison d'être
 * fondu dans son unique usage, et la prochaine pièce confiée à l'extérieur le
 * reprendra tel quel.
 */
const CHEMIN_PRESTATAIRE: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["chez_prestataire", "non_applicable"],
  chez_prestataire: ["revenu_magasin"],
  /* **Le retour est le terme** (arbitrage 7 de la spec). La carte grise n'a que
     deux gestes : partie chez le prestataire, revenue. Sa preuve de remise
     n'est plus un troisième statut à promener, c'est le scan et la plaque
     saisis sur la fiche de vente. */
  revenu_magasin: [],
  remis_client: [],
  non_applicable: [],
};

const CHEMIN: Record<TypeDocument, Record<StatutDocument, readonly StatutDocument[]>> = {
  quittance: CHEMIN_SANS_ETAPE,
  cmc: CHEMIN_SANS_ETAPE,
  carte_grise: CHEMIN_PRESTATAIRE,
};

/** Ce document est-il confié à un intervenant externe ? */
export function passeParUnPrestataire(type: TypeDocument): boolean {
  return CHEMIN[type] === CHEMIN_PRESTATAIRE;
}

/** Ce passage est-il permis pour ce type de document ? */
export function transitionAutorisee(
  type: TypeDocument,
  de: StatutDocument,
  vers: StatutDocument,
): boolean {
  return CHEMIN[type][de].includes(vers);
}

/** Ce qu'on propose à l'écran. Vide sur un statut terminal. */
export function statutsSuivants(type: TypeDocument, de: StatutDocument): readonly StatutDocument[] {
  return CHEMIN[type][de];
}

/** Un statut dont plus rien ne peut sortir : le document a fini sa vie. */
export function estStatutTerminal(type: TypeDocument, statut: StatutDocument): boolean {
  return CHEMIN[type][statut].length === 0;
}

/** Ce qu'un papier montre à l'écran, tous faits réunis. */
export type EtatPapier = "sans_objet" | "emporte" | "au_magasin" | "chez_prestataire" | "a_faire";

export const LIBELLE_ETAT_PAPIER: Record<EtatPapier, string> = {
  sans_objet: "Sans objet",
  emporte: "Emporté par le client",
  au_magasin: "Au magasin",
  chez_prestataire: "Chez le prestataire",
  a_faire: "À faire",
};

/**
 * L'état affiché d'un papier, **calculé et jamais stocké** (D61).
 *
 * Trois sources, une réponse : le document dit s'il est écarté, la moto dit si
 * le papier est en main, la vente dit si le client l'a emporté. Les recoller à
 * la lecture rend la contradiction B *inexprimable* — un CMC coché trois jours
 * après la vente fait bouger l'écran du dossier sans qu'une seule écriture ne
 * touche le dossier.
 *
 * La carte grise échappe à la règle : elle a une vie chez quelqu'un, que ni la
 * moto ni la vente ne connaissent. Son statut stocké fait foi.
 */
export function etatPapier(entree: {
  type: TypeDocument;
  statut: StatutDocument;
  /** La moto porte-t-elle ce papier ? Ignoré pour la carte grise. */
  enMain: boolean;
  /** Le client l'a-t-il emporté ? Ignoré pour la carte grise. */
  emporte: boolean;
}): EtatPapier {
  if (entree.statut === "non_applicable") return "sans_objet";

  if (passeParUnPrestataire(entree.type)) {
    if (entree.statut === "chez_prestataire") return "chez_prestataire";
    /* `remis_client` n'est plus écrit, mais la préversion en porte : une carte
       grise ainsi marquée est revenue au magasin, et c'est tout ce qu'on peut
       en dire sans inventer. */
    if (entree.statut === "revenu_magasin" || entree.statut === "remis_client") {
      return "au_magasin";
    }
    return "a_faire";
  }

  if (entree.emporte) return "emporte";
  if (entree.enMain) return "au_magasin";
  return "a_faire";
}

/** Ce que la clôture regarde. Rien d'autre n'entre en compte (§7.1). */
export type EtatDossier = {
  documents: readonly { type: TypeDocument; statut: StatutDocument }[];
  /**
   * Ce que le client a emporté, tel que la vente le porte (S53).
   *
   * **La clôture ne lit jamais la moto**, et c'est une propriété à tenir : sans
   * elle, il faudrait réveiller la clôture à chaque case cochée sur un arrivage,
   * et une moto dont le CMC arrive clôturerait un dossier que personne n'a
   * touché. La remise au client est un geste, donc un fait écrit sur la vente.
   */
  emporte: PapiersEmportes;
  /** `statutPaiement === 'solde'` : plus rien n'est dû. */
  soldee: boolean;
  /** La moto est chez le client. Fausse tant que des tranches ne sont pas soldées. */
  motoRemise: boolean;
};

/**
 * Un document réglé, du seul point de vue du DOSSIER.
 *
 * `dossierCloturable` ne s'en sert plus depuis S53 — un papier se clôt sur ce
 * que la vente dit, pas sur un statut promené. Il ne reste utile qu'à l'écran
 * des dossiers, qui ne lit pas encore les motos ; `etatPapier` le remplacera
 * là-bas aussi.
 */
function estRegle(statut: StatutDocument): boolean {
  return statut === "remis_client" || statut === "non_applicable";
}

/**
 * Le dossier peut-il se clore ? (§7.1, révisé par S53)
 *
 * | Papier | Fini quand |
 * |--------|------------|
 * | Quittance | sans objet, **ou** emportée par le client |
 * | CMC | sans objet, **ou** emporté par le client |
 * | Carte grise | sans objet, **ou** revenue du prestataire |
 *
 * Plus la vente soldée et la moto partie : une vente en tranches entièrement
 * payée dont la moto dort encore au magasin n'est pas un dossier fini, et c'est
 * précisément la confusion que le cahier interdit entre crédit et tranches
 * (§13). S53 change ce qui finit un PAPIER, pas ce qui finit une vente.
 *
 * **Un papier ne se clôt plus en passant par `remis_client`** mais parce que la
 * vente dit que le client est parti avec. Un seul fait, à un seul endroit.
 *
 * `remis_client` continue de clore une carte grise : le statut ne s'écrit plus,
 * mais la préversion en porte, et l'ignorer laisserait les dossiers les plus
 * anciens ouverts pour toujours.
 *
 * Un type absent compte `a_faire` : un dossier dont les documents ne sont pas
 * encore lus ne doit pas passer pour un dossier complet.
 */
export function dossierCloturable(etat: EtatDossier): boolean {
  if (!etat.soldee || !etat.motoRemise) return false;

  return TYPES_DOCUMENT.every((type) => {
    const document = etat.documents.find((candidat) => candidat.type === type);
    const statut = document?.statut ?? "a_faire";
    if (statut === "non_applicable") return true;
    if (type === "carte_grise") return statut === "revenu_magasin" || statut === "remis_client";
    return etat.emporte[type];
  });
}

/**
 * La date annoncée au client est-elle dépassée ?
 *
 * Comparé de jour à jour, pas d'instant à instant : une carte grise attendue le
 * 2 n'est pas en retard à 8 h le 2 parce qu'elle a été saisie à 14 h la veille.
 *
 * Le calcul prend l'horloge de l'appareil, ce qui le rend juste même sans
 * réseau, où aucune horloge serveur n'est joignable.
 */
export function estEnRetard(estimee: Date | null, aujourdhui: Date): boolean {
  if (!estimee) return false;
  return debutDeJournee(estimee) < debutDeJournee(aujourdhui);
}

function debutDeJournee(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/* --- Le dépôt chez un prestataire ---------------------------------------- */

/**
 * Ce que le gérant saisit en confiant un document à un prestataire (§7.2).
 *
 * `disponibleLe` est la seule ligne facultative : c'est une estimation, et le
 * prestataire ne la donne pas toujours. Son absence ne bloque rien — elle prive
 * seulement le dossier du filtre « en retard », ce que la liste dit elle-même.
 */
export type SaisieDepot = {
  prestataireId: string;
  /** Le nom du prestataire choisi, recopié sur le document : la liste des
      dossiers doit dire qui détient quoi sans relire une fiche par ligne. */
  prestataireNom: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  deposeLe: string;
  avance: string;
  /** L'avance sort de la caisse : par quel moyen, il faut le dire. */
  moyenPaiement: MoyenPaiement;
  /** Facultatif. Même format. */
  disponibleLe: string;
};

/** Un jour saisi dans un `<input type="date">`, à midi pour échapper aux fuseaux. */
export function lireJour(brut: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;
  const [annee, mois, jour] = brut.split("-").map(Number);
  const date = new Date(annee, mois - 1, jour, 12);
  /* `new Date(2026, 1, 31)` donne le 3 mars sans se plaindre. On refuse plutôt
     que d'enregistrer une date que personne n'a voulue. */
  if (date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) {
    return null;
  }
  return date;
}

export function validerDepot(saisie: SaisieDepot): string | null {
  if (!saisie.prestataireId) {
    return "Choisissez le prestataire à qui vous confiez le document.";
  }

  const depose = lireJour(saisie.deposeLe);
  if (!depose) return "Indiquez la date du dépôt.";

  const montant = lireMontant(saisie.avance);
  if (montant === null) {
    return "L’avance doit être un montant en francs, sans virgule ni centimes.";
  }
  /* Zéro n'est pas une avance : c'est un travail confié à crédit, et le crédit
     se modélise ailleurs (§13). Les confondre ferait apparaître des documents
     déposés sans contrepartie en caisse, que rien ne viendrait solder. */
  if (montant <= 0) {
    return "Une avance est un premier versement : sans montant, le travail est confié à crédit.";
  }
  if (montant > MONTANT_MAX) return "L’avance dépasse le maximum admis.";

  if (saisie.disponibleLe) {
    const disponible = lireJour(saisie.disponibleLe);
    if (!disponible) return "La date de disponibilité annoncée n’est pas une date.";
    if (disponible < depose) {
      return "La date annoncée est antérieure au dépôt.";
    }
  }

  return null;
}

/* --- Le relais d'un document (§7.3) --------------------------------------- */

/** Où en est une étape du parcours, vue depuis le statut d'aujourd'hui. */
export type EtatEtape = "fait" | "cours" | "attente";

export type EtapeRelais = {
  statut: StatutDocument;
  etat: EtatEtape;
};

/* Les deux parcours, mis à plat. Ce sont les mêmes chemins que `CHEMIN`, lus
   dans l'autre sens : `CHEMIN` dit ce qu'un statut a le droit de devenir,
   ceux-ci disent dans quel ordre on les traverse. */
const PARCOURS_ARRIVE_FAIT: readonly StatutDocument[] = [
  "a_faire",
  "revenu_magasin",
  "remis_client",
];
const PARCOURS_PRESTATAIRE: readonly StatutDocument[] = [
  "a_faire",
  "chez_prestataire",
  "revenu_magasin",
  "remis_client",
];

/**
 * Le parcours d'un document, et l'étape où il se trouve.
 *
 * Les statuts ne sont pas des cases à cocher : ce sont les étapes d'un
 * déplacement physique entre le magasin, un prestataire et le client. L'ordre
 * porte une information vraie — c'est ce qui autorise une suite numérotée à
 * l'écran, la seule du produit (`DESIGN.md` §6), et ce qui répond d'un coup
 * d'œil à « où est ce papier, et qu'est-ce qui vient après ».
 *
 * **Le parcours dépend du type.** La quittance et le CMC n'ont pas d'étape chez
 * un prestataire ; en dessiner une, vide, ferait attendre un retour que
 * personne n'a promis (D65).
 *
 * Un document écarté n'a pas de parcours : la liste est vide, et l'écran dit
 * « Sans objet » plutôt que de tracer un chemin que rien n'empruntera.
 */
export function etapesRelais(type: TypeDocument, statut: StatutDocument): EtapeRelais[] {
  const parcours = passeParUnPrestataire(type) ? PARCOURS_PRESTATAIRE : PARCOURS_ARRIVE_FAIT;
  const rang = parcours.indexOf(statut);
  if (rang === -1) return [];

  return parcours.map((etape, position) => ({
    statut: etape,
    etat:
      position < rang
        ? "fait"
        : position > rang
          ? "attente"
          : /* L'étape d'où plus rien ne sort n'est pas « en cours » : le document
               a fini son voyage, et un point bleu le dirait encore en route. */
            estStatutTerminal(type, statut)
            ? "fait"
            : "cours",
  }));
}

/**
 * Le nombre de jours écoulés, compté de jour à jour.
 *
 * Même règle que `estEnRetard` : un dépôt d'hier à 17 h fait un jour ce matin,
 * pas zéro. C'est ainsi qu'un gérant compte l'attente d'un client.
 */
export function joursEcoules(depuis: Date | null, aujourdhui: Date): number | null {
  if (!depuis) return null;
  const jours = Math.round((debutDeJournee(aujourdhui) - debutDeJournee(depuis)) / 86_400_000);
  return jours < 0 ? 0 : jours;
}

/* --- La liste des dossiers en attente (§7.3) ------------------------------ */

/**
 * Qui détient un papier de ce dossier, en ce moment.
 *
 * `null` ne veut pas dire « on ne sait pas » mais « rien n'est encore parti » :
 * les documents sont tous à faire, et il n'y a personne à relancer.
 */
export type Detention =
  { chez: "prestataire"; nom: string; depuisJours: number | null } | { chez: "magasin" } | null;

/** Un dossier ouvert, réduit à ce que la liste doit montrer. */
export type DossierEnAttente = {
  venteId: string;
  numero: string;
  boutiqueId: string;
  clientId: string;
  date: Date | null;
  /**
   * Les documents du dossier, par type. `null` tant que le document n'est pas
   * parvenu du serveur : une colonne vide dit « on ne sait pas encore », ce qui
   * n'est pas la même chose que « rien à faire ».
   */
  documents: Readonly<Record<TypeDocument, DocumentDossier | null>>;
  /** Les documents qui restent à traiter, dans l'ordre de `TYPES_DOCUMENT`. */
  enCours: readonly DocumentDossier[];
  /** Au moins un document est chez un prestataire au-delà de la date annoncée. */
  enRetard: boolean;
  detention: Detention;
};

/** Ce qu'un dossier a besoin de porter pour entrer dans la liste. */
export type VenteDuDossier = {
  id: string;
  numero: string;
  boutiqueId: string;
  clientId: string;
  date: Date | null;
  statutDossier: StatutDossier;
};

/**
 * Les trois questions qu'on pose à une file de dossiers.
 *
 * Ce ne sont pas des catégories mais des gestes : ce qui a dépassé la date
 * annoncée est à relancer, ce qui est chez un prestataire est à aller chercher,
 * ce qui est revenu au magasin est à remettre à son client aujourd'hui.
 */
export const FILTRES_ETAT = ["en_retard", "chez_prestataire", "a_remettre"] as const;
export type FiltreEtat = (typeof FILTRES_ETAT)[number];

export const LIBELLE_FILTRE_ETAT: Record<FiltreEtat, string> = {
  en_retard: "En retard",
  chez_prestataire: "Chez un prestataire",
  a_remettre: "À remettre",
};

export type FiltresDossiers = {
  /** Vide : tous les dossiers ouverts. */
  etat: FiltreEtat | "";
};

export const FILTRES_DOSSIERS_VIDES: FiltresDossiers = { etat: "" };

/**
 * Les dossiers ouverts, du plus ancien au plus récent (§7.3).
 *
 * Du plus ancien d'abord, et non l'inverse : cette liste n'est pas un journal
 * qu'on parcourt, c'est une file d'attente qu'on vide. Ce qui traîne depuis le
 * plus longtemps est ce qu'il faut traiter en premier — et c'est aussi le
 * client qui a le plus de raisons d'appeler.
 *
 * **Tous les documents sortent ensemble, réglés compris.** La liste ne
 * rendait que les documents en cours ; l'écran montre désormais une colonne par
 * document, où « Remis au client » compte autant que « À faire » — c'est en
 * voyant les trois premiers remis qu'on comprend qu'il ne manque que le
 * quatrième. `enCours` reste ce qui décide de la présence dans la file.
 *
 * **L'état est calculé ici, pas demandé à Firestore.** Le retard dépend de la
 * date du jour : une requête figée serait fausse dès le lendemain. Le calcul
 * local reste juste sans réseau, où aucune horloge serveur n'est joignable
 * (D38) — et le nombre de dossiers ouverts reste modeste par construction : un
 * dossier ouvert est un dossier vivant.
 */
export function dossiersEnAttente(
  ventes: readonly VenteDuDossier[],
  documents: readonly DocumentDossier[],
  filtres: FiltresDossiers,
  aujourdhui: Date,
): DossierEnAttente[] {
  const parVente = new Map<string, DocumentDossier[]>();
  for (const document of documents) {
    const liste = parVente.get(document.venteId);
    if (liste) liste.push(document);
    else parVente.set(document.venteId, [document]);
  }

  return (
    ventes
      .filter((vente) => vente.statutDossier === "ouvert")
      .map((vente) => {
        /* **Filtré sur les types connus, et ce filtre n'est pas décoratif.**
           Un dossier ouvert avant S48 porte encore un document `plaque` en
           base. `dossierCloturable` ne le regarde plus — il itère
           `TYPES_DOCUMENT` —, mais tout ce qui suit lit la liste brute : sans
           ce filtre, la plaque resterait « en cours », compterait dans la
           détention et pourrait marquer le dossier en retard, sur un dossier
           que le serveur vient de clore. Deux lectures contradictoires du même
           dossier, à deux centimètres l'une de l'autre. */
        const tous = (parVente.get(vente.id) ?? []).filter((document) =>
          TYPES_DOCUMENT.includes(document.type),
        );
        const parType = Object.fromEntries(
          TYPES_DOCUMENT.map((type) => [
            type,
            tous.find((document) => document.type === type) ?? null,
          ]),
        ) as Record<TypeDocument, DocumentDossier | null>;

        const enCours = tous
          .filter((document) => !estRegle(document.statut))
          .sort((a, b) => TYPES_DOCUMENT.indexOf(a.type) - TYPES_DOCUMENT.indexOf(b.type));

        return {
          venteId: vente.id,
          numero: vente.numero,
          boutiqueId: vente.boutiqueId,
          clientId: vente.clientId,
          date: vente.date,
          documents: parType,
          enCours,
          enRetard: enCours.some((document) => estEnRetard(document.disponibleLe, aujourdhui)),
          detention: detentionDe(enCours, aujourdhui),
        };
      })
      /* Un dossier sans document en cours n'a rien à faire dans une file
       d'attente. Il n'est pas encore clos — la clôture demande aussi le
       paiement soldé et la moto remise — mais côté documents, il n'attend
       plus rien. */
      .filter((dossier) => dossier.enCours.length > 0)
      .filter((dossier) => correspondALEtat(dossier, filtres.etat))
      .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
  );
}

/**
 * Qui détient le dossier : celui qui attend depuis le plus longtemps.
 *
 * Deux documents peuvent être chez deux prestataires différents. La colonne n'en
 * nomme qu'un, et c'est le plus ancien dépôt — celui dont le délai s'allonge,
 * pas celui qu'on vient de confier. Le détail des quatre est sur la même ligne,
 * dans les colonnes des documents. Depuis S48 ils sont trois.
 */
function detentionDe(enCours: readonly DocumentDossier[], aujourdhui: Date): Detention {
  const dehors = enCours
    .filter((document) => document.statut === "chez_prestataire")
    .sort((a, b) => (a.deposeLe?.getTime() ?? 0) - (b.deposeLe?.getTime() ?? 0));

  const premier = dehors[0];
  if (premier) {
    return {
      chez: "prestataire",
      nom: premier.prestataireNom || "un prestataire",
      depuisJours: joursEcoules(premier.deposeLe, aujourdhui),
    };
  }

  /* Revenu au magasin, donc détenu par le magasin : c'est ce qui se remet au
     client aujourd'hui, sans attendre personne. */
  if (enCours.some((document) => document.statut === "revenu_magasin")) {
    return { chez: "magasin" };
  }
  return null;
}

function correspondALEtat(dossier: DossierEnAttente, etat: FiltreEtat | ""): boolean {
  switch (etat) {
    case "":
      return true;
    case "en_retard":
      return dossier.enRetard;
    case "chez_prestataire":
      return dossier.enCours.some((document) => document.statut === "chez_prestataire");
    case "a_remettre":
      return dossier.enCours.some((document) => document.statut === "revenu_magasin");
  }
}

/** Un dossier accompagné de ce qui ne vit pas dans la vente : le nom du client. */
export type DossierCherchable = {
  dossier: DossierEnAttente;
  /** Déjà normalisé par l'appelant, qui tient le fichier des clients. */
  nomNormalise: string;
};

/**
 * La recherche de la file : un numéro, un client, un prestataire.
 *
 * Les trois façons dont un dossier revient à l'esprit au comptoir. Le client
 * appelle et donne son nom ; il tend un reçu et on lit le numéro ; le
 * prestataire passe et on cherche tout ce qu'il détient. Le numéro se compare
 * sans ses tirets — personne ne les retape à l'identique depuis un reçu
 * froissé.
 *
 * C'est cette recherche qui remplace les listes déroulantes « Prestataire » et
 * « Document » de l'écran précédent : la première est ici, et la seconde n'a
 * plus lieu d'être puisque chaque document a sa colonne.
 */
export function chercherDossiers<T extends DossierCherchable>(
  lignes: readonly T[],
  recherche: string,
  normaliserNom: (brut: string) => string,
): T[] {
  const texte = recherche.trim();
  if (!texte) return [...lignes];

  const nom = normaliserNom(texte);
  const brut = texte.toUpperCase().replace(/[\s-]+/g, "");

  return lignes.filter((ligne) => {
    if (nom.length > 0 && ligne.nomNormalise.includes(nom)) return true;
    if (
      nom.length > 0 &&
      ligne.dossier.enCours.some((document) => normaliserNom(document.prestataireNom).includes(nom))
    ) {
      return true;
    }
    return brut.length >= 3 && ligne.dossier.numero.replace(/-/g, "").includes(brut);
  });
}
