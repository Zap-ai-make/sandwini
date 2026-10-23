import { champsDossierNeuf, type StatutCarteGrise } from "./dossier-carte-grise";
import { type DocumentDossier, type StatutDocument, type Vente } from "./vente";

/**
 * Faire entrer les cartes grises existantes dans leur collection (S59).
 *
 * **Pourquoi ce calcul vit dans le domaine et non dans un script.** Le SDK
 * Admin ne peut pas joindre le projet réel depuis le poste du commanditaire —
 * il n'y a pas d'identifiants applicatifs, et en fabriquer une clé de compte de
 * service n'entrera jamais dans ce dépôt. La migration passe donc par le
 * **navigateur du responsable connecté**, comme l'assistant : les règles
 * s'appliquent sans une ligne de code en plus, et chaque écriture porte son nom.
 *
 * **Ce que cela coûte, et il faut le savoir avant de cliquer.** Les règles
 * n'autorisent la création d'un dossier qu'au début de sa vie — « à faire », ou
 * « sans objet ». Un script Admin les contournait et écrivait l'état final
 * directement ; le navigateur ne peut pas. On rejoue donc les passages : le
 * dossier naît, puis avance jusqu'à l'état où il se trouve vraiment, par les
 * mêmes transitions que l'application emploie.
 *
 * **Chaque passage est une écriture séparée, et ce n'est pas un choix.** Les
 * règles évaluent chaque écriture d'un lot contre l'état d'**avant** le lot : un
 * `update` posé dans le même lot que le `create` serait jugé sur un document
 * qui n'existe pas encore, et refusé. Les étapes partent donc en vagues
 * successives — toutes les créations, puis tous les premiers passages, et ainsi
 * de suite.
 *
 * **Deux renoncements, dits une fois.** La date de création du dossier sera
 * celle du jour, parce que `traceCreation` exige `createdAt == request.time` :
 * l'âge réel du dossier reste lisible sur son dépôt et dans le journal des
 * documents, qu'on ne touche pas. Et les passages rejoués **n'écrivent aucune
 * ligne de journal** : fabriquer une trace datée d'aujourd'hui pour un geste de
 * l'an dernier mentirait sur ce qui s'est passé. La vraie histoire reste là où
 * elle a toujours été, dans le journal des documents d'origine.
 */

/** Les statuts de l'ancien modèle vers le nouveau. */
const STATUTS: Partial<Record<StatutDocument, StatutCarteGrise>> = {
  a_faire: "a_faire",
  chez_prestataire: "chez_prestataire",
  revenu_magasin: "revenu_magasin",
  /* S53 avait cessé de l'écrire, mais la préversion en porte — et c'est
     justement l'étape que S59 réhabilite. */
  remis_client: "remis",
  non_applicable: "non_applicable",
};

/**
 * Le chemin complet, du début à l'état réel.
 *
 * Les mêmes transitions que `lib/domain/dossier-carte-grise.ts` autorise : on
 * ne saute pas d'étape, donc on les traverse toutes.
 */
const CHEMIN_VERS: Record<StatutCarteGrise, readonly StatutCarteGrise[]> = {
  a_faire: [],
  non_applicable: [],
  chez_prestataire: ["chez_prestataire"],
  revenu_magasin: ["chez_prestataire", "revenu_magasin"],
  remis: ["chez_prestataire", "revenu_magasin", "remis"],
};

export type EntreesMigration = {
  /** Les documents `carte_grise`, toutes boutiques confondues. */
  documents: readonly DocumentDossier[];
  ventes: readonly Vente[];
  /** Le châssis, la marque et le modèle d'une moto, par identifiant de moto. */
  motos: ReadonlyMap<string, { numeroChassis: string; libelle: string }>;
  /** Le nom du propriétaire, par identifiant de client. */
  noms: ReadonlyMap<string, string>;
  /** Le jour du retour au magasin, par vente, lu dans le journal des passages. */
  retours: ReadonlyMap<string, Date>;
  /** Les dossiers déjà présents dans la nouvelle collection. */
  dejaMigres: ReadonlySet<string>;
};

/** Un passage à rejouer : le statut visé, et ce qu'il écrit avec lui. */
export type EtapeMigration = {
  statut: StatutCarteGrise;
  champs: Record<string, unknown>;
};

export type DossierAMigrer = {
  /** L'identifiant du dossier, **égal à celui de la vente**. */
  id: string;
  creation: ReturnType<typeof champsDossierNeuf>;
  etapes: readonly EtapeMigration[];
};

export type PlanMigration = {
  aMigrer: readonly DossierAMigrer[];
  /** Déjà dans la nouvelle collection : on n'y touche pas. */
  dejaLa: number;
  /**
   * Laissés de côté faute de châssis, et nommés.
   *
   * **Les écrire serait pire que les omettre.** La création passerait, puis
   * l'application refuserait **toute modification** du dossier — elle exige un
   * châssis non vide à chaque écriture. Le dossier serait visible et
   * définitivement figé.
   */
  sansChassis: readonly string[];
  /** La vente ou la moto n'a pas été retrouvée : rien à recopier. */
  introuvables: readonly string[];
  statutInconnu: readonly string[];
  /** Le nombre total d'écritures que le plan demande, créations comprises. */
  ecritures: number;
};

export function preparerMigration(entrees: EntreesMigration): PlanMigration {
  const parVente = new Map(entrees.ventes.map((vente) => [vente.id, vente]));

  const aMigrer: DossierAMigrer[] = [];
  const sansChassis: string[] = [];
  const introuvables: string[] = [];
  const statutInconnu: string[] = [];
  let dejaLa = 0;

  for (const document of entrees.documents) {
    if (document.type !== "carte_grise") continue;
    const venteId = document.venteId;

    if (entrees.dejaMigres.has(venteId)) {
      dejaLa += 1;
      continue;
    }

    const statut = STATUTS[document.statut];
    if (!statut) {
      statutInconnu.push(venteId);
      continue;
    }

    const vente = parVente.get(venteId);
    const moto = vente ? entrees.motos.get(vente.motoId) : undefined;
    if (!vente || !moto) {
      introuvables.push(venteId);
      continue;
    }

    if (!moto.numeroChassis.trim()) {
      sansChassis.push(venteId);
      continue;
    }

    const debut: StatutCarteGrise = statut === "non_applicable" ? "non_applicable" : "a_faire";

    aMigrer.push({
      id: venteId,
      creation: champsDossierNeuf({
        boutiqueId: document.boutiqueId || vente.boutiqueId,
        venteId,
        origine: "vente",
        clientNom: entrees.noms.get(vente.clientId) ?? "",
        motoLibelle: moto.libelle,
        numeroChassis: moto.numeroChassis.trim(),
        statut: debut,
      }),
      etapes: etapesVers(statut, document, entrees.retours.get(venteId) ?? null),
    });
  }

  const ecritures = aMigrer.reduce((total, dossier) => total + 1 + dossier.etapes.length, 0);

  return { aMigrer, dejaLa, sansChassis, introuvables, statutInconnu, ecritures };
}

function etapesVers(
  cible: StatutCarteGrise,
  document: DocumentDossier,
  revenuLe: Date | null,
): EtapeMigration[] {
  return CHEMIN_VERS[cible].map((statut) => ({
    statut,
    champs: champsDeLEtape(statut, document, revenuLe),
  }));
}

function champsDeLEtape(
  statut: StatutCarteGrise,
  document: DocumentDossier,
  revenuLe: Date | null,
): Record<string, unknown> {
  if (statut === "chez_prestataire") {
    return {
      prestataireId: document.prestataireId,
      prestataireNom: document.prestataireNom,
      deposeLe: document.deposeLe,
      avance: document.avance,
      disponibleLe: document.disponibleLe,
    };
  }
  if (statut === "revenu_magasin") {
    /* Le numéro de plaque n'existe nulle part dans l'ancien modèle : il
       s'inscrira au prochain passage au comptoir. */
    return { revenuLe };
  }
  /* La remise : on a sa date, jamais le nom de qui est venu chercher — la
     question n'était pas posée avant S59. On ne l'invente pas. */
  return { remisLe: document.remisLe };
}

/**
 * Le plan découpé en vagues, prêtes à partir l'une après l'autre.
 *
 * La vague `0` porte les créations, la `1` les premiers passages, et ainsi de
 * suite. Chacune doit être confirmée par le serveur avant la suivante : un
 * `update` jugé contre un document que le lot précédent n'a pas encore écrit
 * serait refusé.
 */
export type Vague = {
  rang: number;
  ecritures: readonly { id: string; champs: Record<string, unknown> }[];
};

export function vaguesDeMigration(plan: PlanMigration): readonly Vague[] {
  const profondeur = plan.aMigrer.reduce(
    (max, dossier) => Math.max(max, dossier.etapes.length),
    0,
  );

  const vagues: Vague[] = [
    {
      rang: 0,
      ecritures: plan.aMigrer.map((dossier) => ({
        id: dossier.id,
        champs: { ...dossier.creation } as Record<string, unknown>,
      })),
    },
  ];

  for (let rang = 1; rang <= profondeur; rang += 1) {
    const ecritures = plan.aMigrer
      .filter((dossier) => dossier.etapes.length >= rang)
      .map((dossier) => {
        const etape = dossier.etapes[rang - 1];
        return { id: dossier.id, champs: { statut: etape.statut, ...etape.champs } };
      });
    if (ecritures.length > 0) vagues.push({ rang, ecritures });
  }

  return vagues;
}
