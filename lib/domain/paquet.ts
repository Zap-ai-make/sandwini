/**
 * Le paquet de cartes grises (S53, arbitrages 2, 6 et 9).
 *
 * Le commanditaire : « *la remise au prestataire se fait par paquet. On tend
 * dix cartes grises.* » Le produit ne savait confier qu'une carte à la fois —
 * dix dépôts, dix sorties de caisse, dix fois le même nom de prestataire tapé.
 *
 * **Un paquet groupe, il ne remplace pas.** Chaque document `carte_grise`
 * continue de porter son `prestataireId`, son `deposeLe` et son `avance` : les
 * règles Firestore évaluent chaque écriture d'un lot contre l'état d'**avant**
 * le lot (la leçon de S5, redite en S17), donc un document validé contre un
 * paquet créé dans le même lot serait refusé. `depotRenseigne` reste vrai mot
 * pour mot, et les écrans de dossier existants continuent de fonctionner.
 */

import { estEnRetard, joursEcoules, lireJour, type DossierEnAttente } from "./dossier";
import { type DossierCarteGrise } from "./dossier-carte-grise";
import { lireMontant, MONTANT_MAX, type DocumentDossier } from "./vente";

/**
 * Le nombre de cartes qu'un paquet peut porter.
 *
 * **La borne vient du calcul, pas du confort.** Un lot Firestore accepte 500
 * écritures. Un paquet en fait au pire `4N + 1` : le document du paquet, puis
 * par carte la mise à jour du document sous la vente et sa ligne d'historique,
 * plus celles du dossier dans sa collection. `4N + 1 <= 500` donne `N <= 124`.
 *
 * **Elle était de 249, et elle a baissé** (S59). Le dépôt écrivait `2N + 2` :
 * deux écritures par carte, plus la sortie de caisse. Celle-ci a disparu avec
 * l'arbitrage du 21 octobre, mais chaque carte en demande maintenant deux de
 * plus — l'ancien document pour les écrans d'avant la bascule, le nouveau
 * dossier pour celle qui traite les papiers. Les deux coexistent le temps que
 * la migration passe, et la borne remontera quand le vieux chemin tombera.
 *
 * C'est un **plafond**, pas une cible : le geste réel en tend dix. Mais une
 * borne choisie au hasard se révèle un jour fausse dans le mauvais sens, alors
 * que celle-ci est la limite au-delà de laquelle l'écriture échouerait en bloc,
 * sans message utile.
 */
export const CARTES_PAR_PAQUET_MAX = 124;

export type SaisiePaquet = {
  prestataireId: string;
  /** Recopié sur le paquet et sur chaque document : une ligne se lit sans
      rouvrir une fiche de prestataire. Même raison qu'au dépôt unitaire. */
  prestataireNom: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  deposeLe: string;
  avance: string;
  /** Facultatif. Même format. */
  disponibleLe: string;
  /**
   * Les dossiers qui partent. Un par carte.
   *
   * **Des dossiers, et plus des ventes** (S59) : un dossier venu du dehors se
   * confie dans les mêmes paquets, et il n'a pas de vente d'où tirer une clé.
   * La bascule ne coûte aucune migration de données parce qu'un dossier né
   * d'une vente porte l'identifiant de cette vente : les listes déjà écrites
   * sont valides telles quelles.
   */
  dossierIds: readonly string[];
};

/**
 * Le refus à montrer, ou `null` si le paquet peut partir.
 *
 * **Les mêmes règles que le dépôt unitaire, plus celles du nombre.** L'avance
 * strictement positive et la date annoncée postérieure au dépôt ne sont pas
 * redites par confort : ce sont les conditions que `depotRenseigne` impose côté
 * serveur à **chaque** document du lot, et les faire échouer là-bas donnerait un
 * refus illisible sur un geste déjà affiché comme fait.
 */
export function validerPaquet(saisie: SaisiePaquet): string | null {
  if (!saisie.prestataireId) {
    return "Choisissez le prestataire à qui vous confiez les cartes grises.";
  }

  if (saisie.dossierIds.length === 0) {
    return "Choisissez au moins une carte grise à confier.";
  }

  /* Deux écritures sur le même document dans un lot Firestore font échouer le
     lot entier, sans dire laquelle. Le doublon se refuse donc ici, où le
     message est lisible. */
  if (new Set(saisie.dossierIds).size !== saisie.dossierIds.length) {
    return "Le même dossier figure deux fois dans la sélection.";
  }

  if (saisie.dossierIds.length > CARTES_PAR_PAQUET_MAX) {
    return `Un paquet porte au plus ${CARTES_PAR_PAQUET_MAX} cartes grises. Faites-en deux.`;
  }

  const depose = lireJour(saisie.deposeLe);
  if (!depose) return "Indiquez la date du dépôt.";

  const montant = lireMontant(saisie.avance);
  if (montant === null) {
    return "L’avance doit être un montant en francs, sans virgule ni centimes.";
  }
  /* Zéro n'est pas une avance : c'est un travail confié à crédit, et le crédit
     se modélise ailleurs. Les confondre ferait apparaître des cartes déposées
     sans contrepartie en caisse, que rien ne viendrait solder. */
  if (montant <= 0) {
    return "Une avance est un premier versement : sans montant, le travail est confié à crédit.";
  }
  if (montant > MONTANT_MAX) return "L’avance dépasse le maximum admis.";

  if (saisie.disponibleLe) {
    const disponible = lireJour(saisie.disponibleLe);
    if (!disponible) return "La date de disponibilité annoncée n’est pas une date.";
    if (disponible < depose) return "La date annoncée est antérieure au dépôt.";
  }

  return null;
}

/** Un paquet tel qu'il est stocké. Aucun champ d'état : il se calcule. */
export type PaquetCartesGrises = {
  id: string;
  boutiqueId: string;
  prestataireId: string;
  prestataireNom: string;
  deposeLe: Date | null;
  disponibleLe: Date | null;
  avance: number;
  dossierIds: readonly string[];
};

export type EtatPaquet = {
  total: number;
  dehors: number;
  revenues: number;
  /** Plus rien dehors, et les documents ont répondu. Jamais un champ stocké. */
  solde: boolean;
  /** Les documents du paquet sont-ils parvenus ? Faux : on ne sait pas encore. */
  lu: boolean;
  joursDehors: number | null;
  enRetard: boolean;
};


/**
 * Ce qu'un paquet montre, recompté à chaque lecture (D61).
 *
 * **Un paquet n'a pas d'état « rendu », et c'est délibéré.** Lui en donner un
 * rouvrirait la contradiction B sous un autre nom : le champ dirait « soldé »
 * pendant qu'une carte serait encore chez le prestataire, et il faudrait un
 * geste pour les raccorder. Ici, le solde **est** l'absence de carte dehors —
 * ce qui rend gratuit le retour partiel de l'arbitrage 9.
 *
 * Le rapprochement se fait sur `venteId`. Une vente renumérotée garde le sien —
 * seul son numéro affiché gagne un `-B` (D5) —, donc un paquet ne perd jamais
 * une carte parce que deux appareils se sont disputé un numéro.
 */
export function etatPaquet(
  paquet: PaquetCartesGrises,
  documents: readonly DocumentDossier[],
  aujourdhui: Date,
): EtatPaquet {
  const siennes = new Set(paquet.dossierIds);
  const cartes = documents.filter(
    (document) => document.type === "carte_grise" && siennes.has(document.venteId),
  );

  const dehors = cartes.filter((carte) => carte.statut === "chez_prestataire").length;
  const revenues = cartes.filter((carte) => carte.statut === "revenu_magasin").length;

  /* **Une liste vide n'est pas un paquet soldé.** Les deux rendent zéro carte
     dehors ; sans ce drapeau, un paquet dont l'écoute n'a pas encore répondu
     s'afficherait rendu, sur un écran qu'on vient justement consulter pour
     savoir ce qui reste dehors (D95). */
  const lu = cartes.length > 0;

  return {
    total: paquet.dossierIds.length,
    dehors,
    revenues,
    solde: lu && dehors === 0,
    lu,
    joursDehors: joursEcoules(paquet.deposeLe, aujourdhui),
    /* Le retard d'un paquet soldé n'intéresse personne : les cartes sont là, et
       la date annoncée est de l'histoire. */
    enRetard:
      lu &&
      dehors > 0 &&
      paquet.disponibleLe !== null &&
      estEnRetard(paquet.disponibleLe, aujourdhui),
  };
}

/**
 * Les cartes grises qu'un paquet peut emporter.
 *
 * **Une carte déjà dehors n'y entre pas**, et ce filtre n'est pas décoratif :
 * la transition `chez_prestataire -> chez_prestataire` n'existe pas, donc le lot
 * entier serait refusé par la base — sans dire laquelle des dix cartes a fauté,
 * et après que l'écran a montré le dépôt comme fait. Verser deux fois une avance
 * pour le même travail serait le vrai dégât.
 */
export function cartesConfiables(
  documents: readonly DocumentDossier[],
): readonly DocumentDossier[] {
  return documents.filter(carteConfiable);
}

/**
 * La règle, écrite une seule fois.
 *
 * Les deux portes d'entrée du dépôt — l'écran des dossiers et la fiche d'un
 * prestataire — doivent répondre la même chose à « celle-ci peut-elle
 * partir ? ». Deux prédicats auraient fini par diverger, et la divergence ne
 * se verrait qu'au refus du lot.
 */
function carteConfiable(document: DocumentDossier): boolean {
  return document.type === "carte_grise" && document.statut === "a_faire";
}

/**
 * Une carte grise proposée au dépôt, avec de quoi la reconnaître.
 *
 * Le numéro et le client ne vivent pas sur le document : ils sont sur la vente
 * et dans le fichier des clients. On les recopie ici parce que la liste doit
 * se lire sans ouvrir une fiche — dix lignes « carte_grise » sans numéro ne
 * désignent rien.
 */
export type CarteAConfier = {
  /**
   * L'identifiant du dossier.
   *
   * Égal au `venteId` pour une carte née d'une vente, et c'est ce qui rend la
   * bascule de S59 gratuite.
   */
  dossierId: string;
  /**
   * Ce qui désigne la ligne à l'écran.
   *
   * Le numéro de vente quand il y en a une, le numéro de châssis sinon : un
   * dossier venu du dehors n'a pas de numéro de vente, et dix lignes sans
   * repère ne désignent rien.
   */
  repere: string;
  client: string;
  /**
   * Depuis quand le client attend — la date de la vente.
   *
   * `null` pour un dossier venu du dehors : il n'y a pas de vente à dater, et
   * il vient d'être ouvert.
   */
  date: Date | null;
  /**
   * Le document sous la vente, que les écrans d'avant la bascule lisent encore.
   *
   * `null` pour un dossier venu du dehors : il n'y a pas de vente sous laquelle
   * le ranger — c'est toute la raison d'être de la nouvelle collection.
   */
  document: DocumentDossier | null;
  /**
   * Le dossier dans sa collection, dès qu'il y est.
   *
   * `null` pour une carte d'avant la migration : son dossier n'existe pas
   * encore. **Les deux ne sont jamais nuls en même temps** — une carte sans
   * aucune des deux faces n'existe nulle part.
   */
  dossier: DossierCarteGrise | null;
};

/**
 * Ce qu'on peut confier, vu depuis un prestataire (20 octobre 2026).
 *
 * **L'autre porte du même dépôt.** L'écran des dossiers part des dossiers et
 * coche des lignes déjà affichées ; ici on part de la personne — « voici
 * Ouédraogo, que lui donne-t-on aujourd'hui ? » — et la liste n'existe pas
 * encore. C'est la demande du client : « depuis le prestataire, ça doit ouvrir
 * une modale de tous les dossiers en cours à cocher ».
 *
 * **Du plus ancien au plus récent**, comme la file des dossiers : c'est une
 * file qu'on vide, et ce qui traîne depuis le plus longtemps est ce qu'il faut
 * sortir en premier.
 *
 * Un dossier dont le document n'est pas encore parvenu du serveur n'y figure
 * pas : `null` ne veut pas dire « à faire » mais « on ne sait pas encore », et
 * le proposer monterait un lot qui mettrait à jour un document inexistant.
 */
export function cartesAConfier(
  dossiers: readonly DossierEnAttente[],
  /**
   * Les dossiers de la nouvelle collection.
   *
   * **Les deux sources sont disjointes, et c'est ce qui rend l'union sûre** :
   * les cartes nées d'une vente viennent des documents, les dossiers venus du
   * dehors de cette liste. Aucune carte ne figure dans les deux, donc il n'y a
   * pas de fusion à arbitrer. Les dossiers de vente de cette liste servent
   * seulement à retrouver la seconde face d'une carte qu'on connaît déjà.
   */
  dossiersCarteGrise: readonly DossierCarteGrise[],
  nomDuClient: (clientId: string) => string,
): CarteAConfier[] {
  const parVente = new Map(
    dossiersCarteGrise
      .filter((dossier) => dossier.venteId !== null)
      .map((dossier) => [dossier.venteId as string, dossier]),
  );

  const nees = dossiers.flatMap((dossier): CarteAConfier[] => {
    const carte = dossier.documents.carte_grise;
    if (!carte || !carteConfiable(carte)) return [];
    return [
      {
        dossierId: dossier.venteId,
        repere: dossier.numero,
        client: nomDuClient(dossier.clientId),
        date: dossier.date,
        document: carte,
        dossier: parVente.get(dossier.venteId) ?? null,
      },
    ];
  });

  /* Un dossier du dehors n'a pas de document sous une vente : son état ne se
     lit que sur lui-même. On ne propose que ceux qui attendent encore. */
  const duDehors = dossiersCarteGrise
    .filter((dossier) => dossier.origine === "exterieur" && dossier.statut === "a_faire")
    .map(
      (dossier): CarteAConfier => ({
        dossierId: dossier.id,
        repere: dossier.numeroChassis,
        client: dossier.clientNom,
        date: null,
        document: null,
        dossier,
      }),
    );

  /* **Les sans-date passent derrière, pas devant.** Une carte sans vente n'a
     pas d'ancienneté à faire valoir : elle vient d'être ouverte, et la placer
     en tête repousserait les clients qui attendent depuis des mois. */
  return [...nees, ...duDehors].sort((a, b) => {
    if (a.date === null && b.date === null) return a.client.localeCompare(b.client);
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.getTime() - b.date.getTime();
  });
}

/* --- L'historique des départs --------------------------------------------- */

/** Une carte dans un départ, avec ce qu'on sait de son retour. */
export type CartePartie = {
  dossierId: string;
  numero: string;
  client: string;
  /**
   * Le jour où elle est revenue au magasin, lu dans le journal des passages.
   *
   * `null` ne veut pas dire « jamais revenue » : elle peut être encore dehors
   * — `dehors` le dit —, ou son passage n'avoir pas encore été lu. Les deux se
   * taisent plutôt que d'afficher une date qu'on n'a pas.
   */
  revenueLe: Date | null;
  /** Chez le prestataire en ce moment même. */
  dehors: boolean;
};

/**
 * Un départ : ce qu'on a tendu à quelqu'un, en une fois.
 *
 * C'est un paquet dans le cas ordinaire, et une carte seule quand elle a été
 * confiée depuis le relais de son dossier — un geste qui ne crée pas de paquet
 * et qui sort pourtant de l'argent de la caisse.
 */
export type Depart = {
  /** L'identifiant du paquet, ou `carte:<venteId>` pour un départ solitaire. */
  cle: string;
  prestataireNom: string;
  deposeLe: Date | null;
  /** La date annoncée au client. C'est elle qui alimente le retard. */
  disponibleLe: Date | null;
  avance: number;
  cartes: readonly CartePartie[];
  /** Combien sont encore chez le prestataire. */
  dehors: number;
  /**
   * Le jour où la dernière est revenue, donc le jour où le départ est clos.
   *
   * `null` tant qu'une carte est dehors : une date de retour posée sur un
   * paquet incomplet se recopierait dans une discussion avec le client, pour
   * une carte qui n'est pas là.
   */
  soldeLe: Date | null;
  enRetard: boolean;
};

/**
 * Tout ce qui est parti chez un prestataire, du plus récent au plus ancien
 * (20 octobre 2026, demande du client).
 *
 * **Ce que le produit ne savait pas montrer.** `PaquetsEnCours` fait
 * disparaître un paquet à la dernière carte revenue : c'est juste pour une
 * file d'attente — il n'attend plus rien — et faux pour une mémoire, puisque
 * le travail s'efface au moment même où il se termine. La question « qu'a-t-on
 * confié à Ouédraogo cette année, et combien lui a-t-on avancé » n'avait aucun
 * écran pour répondre.
 *
 * **La date de retour ne vit pas sur le document.** Rien n'enregistre le jour
 * où une carte revient — seulement le fait qu'elle soit revenue. Elle est donc
 * lue dans le journal des passages, qui l'a toujours portée : c'est ce qui
 * rend l'historique complet dès le premier jour, au lieu de commencer
 * aujourd'hui.
 *
 * **Du plus récent d'abord, à l'inverse de la file des dossiers.** Une file se
 * vide par le bas — le plus vieux d'abord ; un historique se lit par le haut,
 * on y cherche ce qui vient de se passer.
 *
 * **L'état d'une carte se lit sur l'une de ses deux faces.** Le document sous
 * la vente d'abord, parce que c'est lui que le produit écrit depuis S11 et le
 * seul que l'existant porte ; le dossier de la nouvelle collection ensuite,
 * seule face d'une carte venue du dehors. Sans ce second recours, un dossier du
 * dehors paraîtrait **revenu alors que personne ne l'a vu rentrer** — il n'a
 * pas de document, donc rien ne le disait dehors.
 *
 * Une carte dont aucune face n'est encore parvenue est comptée au magasin. La
 * nuance « pas encore lu » est portée un cran plus haut, par `etatPaquet`, qui
 * refuse de solder un paquet dont les cartes n'ont pas répondu (D95).
 */
export function historiqueDesDeparts(
  paquets: readonly PaquetCartesGrises[],
  documents: readonly DocumentDossier[],
  /** Les dossiers de la nouvelle collection : la seule face d'une carte du dehors. */
  dossiersCarteGrise: readonly DossierCarteGrise[],
  /** Le jour du retour, par vente, lu dans le journal des passages. */
  retours: ReadonlyMap<string, Date>,
  decrire: (venteId: string) => { numero: string; client: string },
  aujourdhui: Date,
): Depart[] {
  const cartes = new Map(
    documents.filter((document) => document.type === "carte_grise").map((d) => [d.venteId, d]),
  );
  const nouveaux = new Map(dossiersCarteGrise.map((dossier) => [dossier.id, dossier]));

  const decrireCarte = (dossierId: string): CartePartie => {
    const document = cartes.get(dossierId);
    const dossier = nouveaux.get(dossierId);

    /* Le numéro de vente quand il existe, le châssis sinon : un dossier du
       dehors n'a pas de vente à nommer. */
    const nomme = decrire(dossierId);
    const repere = document ? nomme.numero : (dossier?.numeroChassis ?? nomme.numero);
    const client = document ? nomme.client : (dossier?.clientNom ?? nomme.client);

    return {
      dossierId,
      numero: repere,
      client,
      revenueLe: document
        ? (retours.get(dossierId) ?? null)
        : (dossier?.revenuLe ?? null),
      dehors: document
        ? document.statut === "chez_prestataire"
        : dossier?.statut === "chez_prestataire",
    };
  };

  const assembler = (
    cle: string,
    prestataireNom: string,
    deposeLe: Date | null,
    disponibleLe: Date | null,
    avance: number,
    dossierIds: readonly string[],
  ): Depart => {
    const lignes = dossierIds.map(decrireCarte);
    const dehors = lignes.filter((ligne) => ligne.dehors).length;
    /* Le retour du départ est celui de sa dernière carte. Tant qu'il en reste
       dehors, il n'y a pas de retour à annoncer. */
    const dates = lignes
      .map((ligne) => ligne.revenueLe)
      .filter((date): date is Date => date !== null);
    return {
      cle,
      prestataireNom: prestataireNom || "un prestataire",
      deposeLe,
      disponibleLe,
      avance,
      cartes: lignes,
      dehors,
      soldeLe:
        dehors === 0 && dates.length > 0
          ? new Date(Math.max(...dates.map((date) => date.getTime())))
          : null,
      enRetard: dehors > 0 && disponibleLe !== null && estEnRetard(disponibleLe, aujourdhui),
    };
  };

  const departs = paquets.map((paquet) =>
    assembler(
      paquet.id,
      paquet.prestataireNom,
      paquet.deposeLe,
      paquet.disponibleLe,
      paquet.avance,
      paquet.dossierIds,
    ),
  );

  /* **Les cartes d'un paquet portent elles aussi leur dépôt** : les règles
     l'exigent, parce qu'elles évaluent chaque écriture d'un lot contre l'état
     d'avant le lot et ne peuvent pas lire un paquet créé dans le même lot.
     Sans cette exclusion, chaque carte d'un paquet de dix ferait une onzième
     ligne à elle seule, et l'avance paraîtrait versée deux fois. */
  const enPaquet = new Set(paquets.flatMap((paquet) => [...paquet.dossierIds]));

  for (const document of cartes.values()) {
    if (enPaquet.has(document.venteId)) continue;
    /* Jamais partie : pas de dépôt, donc rien à raconter. */
    if (document.deposeLe === null) continue;
    departs.push(
      assembler(
        `carte:${document.venteId}`,
        document.prestataireNom,
        document.deposeLe,
        document.disponibleLe,
        document.avance ?? 0,
        [document.venteId],
      ),
    );
  }

  /* Le symétrique pour les dossiers du dehors : ils n'ont pas de document, donc
     la boucle ci-dessus ne les voit pas. Sans celle-ci, un dossier du dehors
     confié hors paquet serait parti sans laisser de trace dans l'historique. */
  for (const dossier of nouveaux.values()) {
    if (dossier.origine !== "exterieur") continue;
    if (enPaquet.has(dossier.id) || dossier.deposeLe === null) continue;
    departs.push(
      assembler(
        `carte:${dossier.id}`,
        dossier.prestataireNom,
        dossier.deposeLe,
        dossier.disponibleLe,
        dossier.avance ?? 0,
        [dossier.id],
      ),
    );
  }

  return departs.sort((a, b) => (b.deposeLe?.getTime() ?? 0) - (a.deposeLe?.getTime() ?? 0));
}

/**
 * Ce qu'on vient de confier, retenu le temps de l'imprimer (24 octobre 2026).
 *
 * **Pourquoi le garder en mémoire plutôt que le relire.** Le paquet part dans
 * un lot qu'on n'attend pas (D76) : hors ligne, il n'est nulle part à relire
 * avant le retour du réseau. Or c'est précisément là, le papier à la main et
 * le transitaire devant soi, qu'on veut le bordereau. Il se construit donc à
 * partir de ce qu'on vient de saisir.
 *
 * Il ne vit pas plus longtemps que l'écran : rien ne s'écrit, rien ne se
 * relit. Fermer la fenêtre le perd, et c'est sans conséquence — le paquet, lui,
 * est enregistré.
 */
export type PaquetConfie = {
  prestataireNom: string;
  deposeLe: Date;
  disponibleLe: Date | null;
  avance: number | null;
  cartes: readonly CarteAConfier[];
};
