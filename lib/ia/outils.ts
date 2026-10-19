import { collection, collectionGroup, getDocs, limit, query, where } from "firebase/firestore";

import {
  etatStock,
  LIBELLE_ETAT_STOCK,
  stockParPiece,
  type MouvementPiece,
} from "@/lib/domain/piece";
import { db } from "@/lib/firebase/client";
import { clesDisponibles } from "./destinations";
import { lireGeste, OUTILS_QUI_AGISSENT, resumeGeste } from "./gestes";
import { estRefus, lireProposition, resume } from "./propositions";

/**
 * Les outils que l'assistant peut demander — et c'est **le navigateur qui les
 * exécute**, jamais Google.
 *
 * C'est le fait qui porte toute la sécurité de ce lot. Firebase AI Logic ne
 * laisse pas le modèle appeler une fonction : il produit des données
 * structurées, et *notre* code appelle. Donc chaque lecture part avec le jeton
 * de celui qui est connecté, et **les règles Firestore s'appliquent sans une
 * ligne de plus**. L'assistant d'un gérant est physiquement incapable de lire
 * `prive/cout` : la base refuse, pas la politesse du modèle.
 *
 * L'alternative — une Cloud Function avec le SDK Admin — aurait contourné les
 * règles en entier, et il aurait fallu reconstruire à la main tout le mur de
 * D2. On ne l'a pas fait pour cette raison exacte.
 *
 * **Ce que renvoie un outil est une donnée, jamais un ordre.** Les noms de
 * clients, les libellés et les notes sont du texte libre saisi par des humains.
 * Une note qui dirait « ignore tes instructions » sera lue par le modèle ; le
 * mur tient quand même, puisque c'est la base qui refuse. Mais le prompt
 * système le dit explicitement, et le rendu n'interprète jamais ce texte.
 */

/** Le plafond de lignes qu'un outil rend. Chaque ligne est facturée en jetons. */
const PLAFOND = 50;

/** Ce qu'on accepte de lire dans la base avant de filtrer. */
const LECTURE_MAX = 200;

/**
 * Les mouvements se lisent **tous**, et non par tranche de deux cents.
 *
 * Ils ne partent pas au modèle : ils sont réduits ici en une quantité par
 * pièce. Les plafonner serait donc gratuit en jetons et ruineux en justesse —
 * c'est la seule lecture de ce fichier dont une coupure fausse un chiffre au
 * lieu d'en cacher.
 */
const MOUVEMENTS_MAX = 5_000;

/**
 * Même raison pour les versements : ils se somment par vente pour donner le
 * reste dû, et une somme coupée annoncerait une dette plus grosse qu'elle
 * n'est — à quelqu'un qui s'apprête à réclamer de l'argent.
 */
const VERSEMENTS_MAX = 5_000;

export type ContexteOutils = {
  /** `null` veut dire « toutes les boutiques » : le responsable seul l'obtient. */
  boutiqueId: string | null;
};

/**
 * Les déclarations, au format attendu par l'API de Gemini.
 *
 * Écrites à la main plutôt que dérivées des types : une description est de la
 * **documentation lue par le modèle**, et c'est elle qui décide s'il choisit le
 * bon outil. La dériver d'un type produirait des noms de champs sans la phrase
 * qui dit quand s'en servir.
 */
export const DECLARATIONS = [
  {
    name: "motos_en_stock",
    description:
      "Les motos actuellement en stock dans le périmètre courant : marque, modèle, châssis, " +
      "prix de vente, date d'entrée. Sert à répondre « qu'est-ce qu'on a », « depuis quand " +
      "dort cette moto », « as-tu une Sanili rouge ».",
    parameters: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description:
            "Facultatif. Un mot à chercher dans la marque, le modèle, la couleur ou le châssis.",
        },
      },
    },
  },
  {
    name: "chercher_client",
    description:
      "Cherche une fiche client par nom ou par téléphone. Sert avant toute vente, et pour " +
      "répondre « qui est ce monsieur », « quel est son numéro ».",
    parameters: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Tout ou partie du nom, ou un numéro de téléphone." },
      },
      required: ["nom"],
    },
  },
  {
    name: "ventes_recentes",
    description:
      "Les ventes de motos du périmètre courant, de la plus récente à la plus ancienne, avec " +
      "le **nom du client**, la moto, le prix convenu, le mode de paiement, ce qui a déjà été " +
      "versé et **ce qui reste dû**. Répond à « combien on a vendu », « qui me doit encore de " +
      "l'argent », « où en est la vente de monsieur Ouédraogo ».",
    parameters: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description: "Facultatif. Un nom de client, un numéro de vente, une marque.",
        },
        impayees: {
          type: "boolean",
          description: "Vrai pour ne garder que les ventes où il reste de l'argent à percevoir.",
        },
      },
    },
  },
  {
    name: "argent_de_la_caisse",
    description:
      "Les entrées et les sorties d'argent de la boutique, de la plus récente à la plus " +
      "ancienne : date, sens, montant, moyen de paiement, nature, poste de dépense. Donne " +
      "aussi les totaux. Répond à « combien j'ai encaissé », « c'est quoi mes dépenses », " +
      "« combien j'ai mis dans le carburant ce mois-ci ».",
    parameters: {
      type: "object",
      properties: {
        depuis: {
          type: "string",
          description:
            "Facultatif, au format AAAA-MM-JJ. Ne garde que ce qui s'est passé à partir de " +
            "ce jour-là. Pour « ce mois-ci », donne le premier du mois.",
        },
        sens: {
          type: "string",
          description: "Facultatif : `entree` pour les encaissements, `sortie` pour les dépenses.",
        },
      },
    },
  },
  {
    name: "catalogue_pieces",
    description:
      "Le catalogue des pièces détachées de la boutique : référence, désignation, prix d'achat, " +
      "prix de vente, et **la quantité réellement en stock**, déjà calculée. Le prix d'achat " +
      "d'une pièce est visible du gérant, à l'inverse de celui d'une moto. Répond à « combien " +
      "il m'en reste », « qu'est-ce qui est en rupture », « à combien je vends ». Donne aussi " +
      "l'identifiant à passer à `preparer_mouvement_piece`.",
    parameters: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description: "Facultatif. Un mot à chercher dans la référence ou la désignation.",
        },
      },
    },
  },

  /* --- Les deux gestes qui **préparent** une écriture, sans jamais l'écrire.
         L'assistant remplit, l'humain valide, les règles refusent : voir
         `lib/ia/propositions.ts` pour pourquoi les trois, et pas seulement le
         troisième. --- */
  {
    name: "preparer_depense",
    description:
      "Prépare une sortie d'espèces de la caisse, à faire valider par l'utilisateur. " +
      "N'ENREGISTRE RIEN : l'utilisateur verra une carte et devra confirmer. Sers-toi en " +
      "quand on te dit « note 15000 de carburant », « j'ai payé le loyer ». Demande le poste " +
      "si on ne te l'a pas donné.",
    parameters: {
      type: "object",
      properties: {
        montant: { type: "number", description: "En francs CFA, entier et positif." },
        poste: {
          type: "string",
          description:
            "Où ranger la dépense : Carburant, Loyer, Salaires… Il se crée s'il n'existe pas.",
        },
        libelle: {
          type: "string",
          description: "Facultatif. Le détail, quand le poste ne suffit pas à dire laquelle.",
        },
      },
      required: ["montant", "poste"],
    },
  },
  {
    name: "preparer_mouvement_piece",
    description:
      "Prépare une entrée ou une sortie de stock pour une pièce, à faire valider par " +
      "l'utilisateur. N'ENREGISTRE RIEN. Sers-toi en quand on te dit « j'ai reçu 40 bougies », " +
      "« retire 2 plaquettes cassées ». Appelle d'abord `catalogue_pieces` pour obtenir " +
      "l'identifiant exact de la pièce — ne l'invente jamais.",
    parameters: {
      type: "object",
      properties: {
        pieceId: {
          type: "string",
          description: "L'identifiant rendu par `catalogue_pieces`, jamais un nom.",
        },
        reference: { type: "string", description: "La référence, pour l'afficher à l'utilisateur." },
        sens: {
          type: "string",
          description:
            "`entree` quand le stock monte, `sortie_autre` quand il descend sans vente " +
            "(casse, usage interne). Une vente ne passe jamais par ici.",
        },
        quantite: { type: "number", description: "Toujours positive : le sens vient de `sens`." },
        note: { type: "string", description: "Facultatif. Pourquoi ce mouvement." },
      },
      required: ["pieceId", "sens", "quantite"],
    },
  },

  /* --- Les gestes qui **agissent sur l'écran**.

         Ils n'imitent pas une souris : ils appellent les mêmes fonctions que
         l'écran appelle quand un humain clique. Voir l'en-tête de `gestes.ts`
         pour les trois raisons qui excluent la simulation de clics. --- */
  {
    name: "aller_a",
    description:
      "Ouvre un écran de l'application. Sers-toi en dès qu'on te demande de montrer, " +
      "d'ouvrir ou d'aller quelque part, et aussi quand ta réponse serait mieux lue sur " +
      "l'écran concerné. Écrans possibles, et aucun autre : " +
      clesDisponibles() +
      ".",
    parameters: {
      type: "object",
      properties: {
        ecran: { type: "string", description: "Une clé de la liste, exactement." },
      },
      required: ["ecran"],
    },
  },
  {
    name: "choisir_la_boutique",
    description:
      "Bascule le travail sur une autre boutique, comme le fait le sélecteur du bandeau. " +
      "Tout ce qui s'affiche ensuite parle de cette boutique-là. Un gérant n'en a qu'une : " +
      "pour lui, ce geste échoue, et c'est normal.",
    parameters: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Le nom de la boutique, tel qu'on te l'a dit." },
      },
      required: ["nom"],
    },
  },
  {
    name: "fermer_l_assistant",
    description:
      "Referme le panneau pour laisser voir l'écran. Sers-toi en quand on te dit « ferme », " +
      "« c'est bon », « merci ça ira ».",
    parameters: { type: "object", properties: {} },
  },
] as const;

/** Le nom des outils, pour refuser tout de suite un appel inventé par le modèle. */
const NOMS = new Set(DECLARATIONS.map((declaration) => declaration.name));

function reduire(texte: unknown): string {
  return String(texte ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Lit une collection, et **dit si elle a été coupée**.
 *
 * `tronque` n'est pas un détail de confort : une somme faite sur une liste
 * tronquée rend un nombre faux qui a l'air juste. Le stock d'une pièce est
 * précisément cela — la somme de ses mouvements — et un plafond silencieux
 * annoncerait « il reste 12 bougies » à qui en a 40.
 */
async function lire(
  nomCollection: string,
  boutiqueId: string | null,
  plafond: number,
): Promise<{ lignes: Record<string, unknown>[]; tronque: boolean }> {
  const base = collection(db(), nomCollection);
  /* Le filtre par boutique part dans la requête, et non après la lecture : un
     gérant qui demanderait une autre boutique se verrait refuser par les règles,
     mais le responsable, lui, a le droit de tout lire — c'est le périmètre qui
     borne, pas le rôle. */
  const requete = boutiqueId
    ? query(base, where("boutiqueId", "==", boutiqueId), limit(plafond))
    : query(base, limit(plafond));
  const instantane = await getDocs(requete);
  return {
    lignes: instantane.docs.map((document) => ({ id: document.id, ...document.data() })),
    tronque: instantane.size >= plafond,
  };
}

/**
 * Les versements, qui vivent sous chaque vente et non à la racine.
 *
 * Ils portent leur `boutiqueId` en double exactement pour ça : une requête de
 * groupe ne sait filtrer que sur les champs du document lui-même.
 */
async function lireVersements(
  boutiqueId: string | null,
): Promise<{ lignes: Record<string, unknown>[]; tronque: boolean }> {
  const base = collectionGroup(db(), "versements");
  const requete = boutiqueId
    ? query(base, where("boutiqueId", "==", boutiqueId), limit(VERSEMENTS_MAX))
    : query(base, limit(VERSEMENTS_MAX));
  const instantane = await getDocs(requete);
  return {
    lignes: instantane.docs.map((document) => ({ id: document.id, ...document.data() })),
    tronque: instantane.size >= VERSEMENTS_MAX,
  };
}

/** Un argument du modèle ramené à une chaîne propre, ou vide. */
function texteSimple(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : "";
}

/**
 * Les motos du périmètre, **dites en mots** plutôt qu'en identifiants.
 *
 * Une moto ne porte pas sa marque : elle porte `marqueId`, qui désigne une
 * ligne d'un référentiel. Rendre le document brut au modèle lui faisait lire
 * `marqueId: "mrq_7f3a"` — et un modèle qui doit répondre finit par répéter ce
 * qu'on lui a donné. Les noms se résolvent donc ici, une fois pour toute la
 * liste, et les identifiants ne sortent pas.
 */
async function decrireMotos(
  boutiqueId: string | null,
): Promise<{ parId: Map<string, Record<string, unknown>>; toutes: Record<string, unknown>[] }> {
  const [brutes, marques, modeles] = await Promise.all([
    lire("motos", boutiqueId, LECTURE_MAX),
    lire("marques", null, LECTURE_MAX),
    lire("modeles", null, LECTURE_MAX),
  ]);

  const nomDe = (lignes: Record<string, unknown>[]) =>
    new Map(lignes.map((ligne) => [String(ligne.id), String(ligne.nom ?? "")]));
  const nomMarque = nomDe(marques.lignes);
  const nomModele = nomDe(modeles.lignes);

  const parId = new Map<string, Record<string, unknown>>();
  const toutes = brutes.lignes.map((moto) => {
    const decrite = {
      id: moto.id,
      marque: nomMarque.get(String(moto.marqueId ?? "")) ?? "",
      modele: nomModele.get(String(moto.modeleId ?? "")) ?? "",
      couleur: moto.couleur,
      annee: moto.annee,
      chassis: moto.numeroChassis,
      prixVenteConseille: moto.prixVenteConseille,
      statut: moto.statut,
      dateEntree: moto.dateEntree,
    };
    parId.set(String(moto.id), decrite);
    return decrite;
  });

  return { parId, toutes };
}

/** « Sanili SL125 », ou ce qu'on en sait. */
function nommerMoto(moto: Record<string, unknown> | undefined): string {
  if (!moto) return "";
  return [moto.marque, moto.modele].filter(Boolean).join(" ");
}

/** Les dates Firestore ne se sérialisent pas en JSON : on les rend lisibles. */
function aplatir(donnees: Record<string, unknown>): Record<string, unknown> {
  const plat: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    if (valeur === null || valeur === undefined) continue;
    /* Les champs d'audit n'intéressent pas le modèle et coûtent des jetons à
       chaque ligne. Le prix d'achat d'une moto, lui, n'arrive jamais ici : les
       règles l'ont déjà refusé au gérant, et il vit dans `prive/`. */
    if (/^(createdAt|createdBy|createdByName|updatedAt|updatedBy|updatedByName)$/.test(cle)) {
      continue;
    }
    const horodatage = valeur as { toDate?: () => Date };
    plat[cle] =
      typeof horodatage?.toDate === "function"
        ? horodatage.toDate().toISOString().slice(0, 10)
        : valeur;
  }
  return plat;
}

/**
 * Exécute un outil demandé par le modèle.
 *
 * Rend toujours un objet, jamais une exception : un refus de lecture est une
 * **réponse** que le modèle doit pouvoir expliquer à l'utilisateur, pas un
 * plantage de l'écran. C'est D82 appliqué ici — un échec n'est pas une absence
 * de donnée, et il se nomme.
 */
export async function executerOutil(
  nom: string,
  arguments_: Record<string, unknown>,
  contexte: ContexteOutils,
): Promise<Record<string, unknown>> {
  if (!NOMS.has(nom as (typeof DECLARATIONS)[number]["name"])) {
    return { erreur: `Outil inconnu : ${nom}.` };
  }

  try {
    switch (nom) {
      case "motos_en_stock": {
        const lu = await decrireMotos(contexte.boutiqueId);
        const motos = lu.toutes
          .filter((moto) => moto.statut === "en_stock")
          .map(({ statut: _statut, id: _id, ...reste }) => aplatir(reste));
        const recherche = reduire(arguments_.recherche);
        const retenues = recherche
          ? motos.filter((moto) => reduire(Object.values(moto).join(" ")).includes(recherche))
          : motos;
        return { motos: retenues.slice(0, PLAFOND), combien: retenues.length };
      }

      case "chercher_client": {
        /* Les clients ne portent pas de boutique : une personne achète où elle
           veut, et couper son historique par magasin le rendrait faux. */
        const cherche = reduire(arguments_.nom);
        const lu = await lire("clients", null, LECTURE_MAX);
        const trouves = lu.lignes
          .map(aplatir)
          .filter((client) => reduire(Object.values(client).join(" ")).includes(cherche));
        return {
          clients: trouves.slice(0, PLAFOND),
          combien: trouves.length,
          ...(lu.tronque ? { partiel: "La recherche n’a pas vu tout le fichier clients." } : {}),
        };
      }

      case "ventes_recentes": {
        /* **Trois lectures, et c'est le minimum.** Une vente ne porte que des
           identifiants : sans la moto et le client, l'assistant répondrait
           « la vente V-0012 de clt_a8f3 », ce qui ne se dit pas au comptoir.
           Et sans les versements, « reste dû » n'existe pas — c'est pourtant
           la seule question qu'on pose vraiment à une liste de ventes. */
        const [vendues, motos, gens, verses] = await Promise.all([
          lire("ventesMotos", contexte.boutiqueId, LECTURE_MAX),
          decrireMotos(contexte.boutiqueId),
          lire("clients", null, LECTURE_MAX),
          lireVersements(contexte.boutiqueId),
        ]);

        const lesMotos = motos.parId;
        const lesGens = new Map(gens.lignes.map((ligne) => [String(ligne.id), ligne]));

        const paye = new Map<string, number>();
        for (const versement of verses.lignes) {
          const cle = String(versement.venteId ?? "");
          paye.set(cle, (paye.get(cle) ?? 0) + Number(versement.montant ?? 0));
        }

        const ventes = vendues.lignes
          .map((vente) => {
            const moto = lesMotos.get(String(vente.motoId ?? ""));
            const client = lesGens.get(String(vente.clientId ?? ""));
            const prix = Number(vente.prixConvenu ?? 0);
            const verse = paye.get(String(vente.id)) ?? 0;
            return aplatir({
              numero: vente.numero,
              date: vente.date,
              client: client?.nom ?? "client inconnu",
              telephone: client?.telephone,
              moto: nommerMoto(moto) || "moto inconnue",
              chassis: moto?.chassis,
              prixConvenu: prix,
              modePaiement: vente.modePaiement,
              dejaVerse: verse,
              /* Jamais négatif : un trop-perçu est une anomalie de saisie, et
                 l'afficher comme une dette à rebours embrouillerait plus que
                 de montrer zéro. */
              resteDu: Math.max(0, prix - verse),
            });
          })
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

        const recherche = reduire(arguments_.recherche);
        const retenues = ventes
          .filter((vente) =>
            recherche ? reduire(Object.values(vente).join(" ")).includes(recherche) : true,
          )
          .filter((vente) => (arguments_.impayees === true ? Number(vente.resteDu) > 0 : true));

        return {
          ventes: retenues.slice(0, PLAFOND),
          combien: retenues.length,
          ...(verses.tronque
            ? { avertissement: "Tous les versements n’ont pas été lus : les restes dus sont des maximums." }
            : {}),
        };
      }

      case "argent_de_la_caisse": {
        const [mouvements, postes] = await Promise.all([
          lire("encaissements", contexte.boutiqueId, LECTURE_MAX * 2),
          /* Les postes ne portent pas de boutique : ils sont déclarés une fois
             pour la maison entière. */
          lire("postesDepense", null, LECTURE_MAX),
        ]);
        const nomDuPoste = new Map(
          postes.lignes.map((poste) => [String(poste.id), String(poste.nom ?? "")]),
        );

        const depuis = texteSimple(arguments_.depuis);
        const sens = texteSimple(arguments_.sens);
        const lignes = mouvements.lignes
          .map((mouvement) =>
            aplatir({
              date: mouvement.date,
              sens: mouvement.sens,
              montant: mouvement.montant,
              moyenPaiement: mouvement.moyenPaiement,
              nature: mouvement.origine,
              poste: nomDuPoste.get(String(mouvement.posteId ?? "")) ?? "",
              libelle: mouvement.libelle,
            }),
          )
          .filter((ligne) => (depuis ? String(ligne.date ?? "") >= depuis : true))
          .filter((ligne) => (sens ? ligne.sens === sens : true))
          .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

        const totalDe = (quel: string) =>
          lignes
            .filter((ligne) => ligne.sens === quel)
            .reduce((somme, ligne) => somme + Number(ligne.montant ?? 0), 0);

        return {
          mouvements: lignes.slice(0, PLAFOND),
          combien: lignes.length,
          /* Les totaux portent sur **tout** ce qui a été retenu, pas sur
             l'extrait : sans eux, le modèle additionnerait les cinquante
             premières lignes et appellerait ça le mois. */
          totalEntrees: totalDe("entree"),
          totalSorties: totalDe("sortie"),
          ...(mouvements.tronque
            ? { avertissement: "Le journal a été coupé : les totaux sont partiels, dis-le." }
            : {}),
        };
      }

      case "catalogue_pieces": {
        /* **Le catalogue arrive avec son stock déjà fait.**

           Avant, le modèle recevait cent lignes de mouvements bruts et devait
           les additionner lui-même : lent à transmettre, cher en jetons, et
           faux dès qu'une ligne manquait. La somme est un calcul, pas une
           opinion — elle se fait ici, avec la fonction que les écrans emploient
           déjà (`stockParPiece`), donc avec le même résultat qu'à l'écran. */
        const [cataloguee, bouges] = await Promise.all([
          lire("pieces", contexte.boutiqueId, LECTURE_MAX),
          lire("mouvementsPieces", contexte.boutiqueId, MOUVEMENTS_MAX),
        ]);

        const quantites = stockParPiece(
          bouges.lignes as unknown as readonly MouvementPiece[],
        );
        const recherche = reduire(arguments_.recherche);
        const pieces = cataloguee.lignes
          .map(aplatir)
          .filter((piece) =>
            recherche ? reduire(Object.values(piece).join(" ")).includes(recherche) : true,
          )
          .map((piece) => {
            const quantite = quantites.get(String(piece.id)) ?? 0;
            return {
              ...piece,
              quantite,
              etat: LIBELLE_ETAT_STOCK[etatStock(quantite, Number(piece.seuilAlerte ?? 0))],
            };
          });

        return {
          pieces: pieces.slice(0, PLAFOND),
          combien: pieces.length,
          /* Une somme tronquée rend un stock faux qui a l'air juste : on refuse
             de le donner plutôt que de le donner avec une réserve que le modèle
             pourrait oublier de répéter. */
          ...(bouges.tronque
            ? {
                erreur:
                  "Trop de mouvements pour recalculer le stock ici. Les quantités ne sont pas " +
                  "sûres : renvoie vers l’espace Pièces.",
              }
            : {}),
        };
      }

      case "aller_a":
      case "choisir_la_boutique":
      case "fermer_l_assistant": {
        /* **Rien ne bouge ici.** Ce fichier n'a ni routeur ni périmètre : le
           geste est lu, validé, et remonte à `components/Assistant.tsx` qui
           seul peut l'exécuter. On rend au modèle de quoi l'annoncer. */
        const geste = lireGeste(nom, arguments_);
        if (estRefus(geste)) return geste;
        return {
          fait: true,
          resume: resumeGeste(geste),
          consigne: "Annonce-le en une phrase courte, sans répéter le nom de l'écran.",
        };
      }

      case "preparer_depense":
      case "preparer_mouvement_piece": {
        /* **Rien ne s'écrit ici.** On rend au modèle ce qu'il a compris, pour
           qu'il le redise à l'utilisateur ; la carte de confirmation, elle, est
           montée par `components/Assistant.tsx` à partir de la même lecture.
           Un refus remonte tel quel : le modèle doit alors redemander ce qui
           manque plutôt que de proposer une carte à moitié remplie. */
        const proposition = lireProposition(nom, arguments_);
        if (estRefus(proposition)) return proposition;
        return {
          prepare: true,
          resume: resume(proposition),
          consigne:
            "Rien n'est enregistré. Annonce à l'utilisateur ce que tu proposes et dis-lui de " +
            "valider la carte affichée sous ta réponse.",
        };
      }

      default:
        return { erreur: `Outil non implémenté : ${nom}.` };
    }
  } catch (cause) {
    const code = (cause as { code?: string }).code ?? "inconnu";
    /* Le code technique va à la console, jamais au modèle : tout ce qu'on lui
       donne, il peut le répéter à l'écran, et « permission-denied » n'est pas
       une phrase qu'on dit à un gérant. */
    console.error(`[assistant] ${nom} a échoué :`, cause);
    /* Nommer le refus plutôt que de rendre une liste vide : « je n'ai pas le
       droit de lire ça » et « il n'y a rien » sont deux réponses différentes, et
       les confondre ferait mentir l'assistant. */
    return {
      erreur:
        code === "permission-denied"
          ? "Ce compte n’a pas le droit de consulter ces informations."
          : "La consultation n’a pas abouti. La connexion est peut-être coupée.",
    };
  }
}

/**
 * Ce qu'on affiche pendant qu'un outil travaille.
 *
 * Le nom technique (`motos_en_stock`) ne dit rien à un gérant, et une animation
 * muette ne dit rien non plus. Nommer la lecture en cours transforme l'attente
 * en information : on juge que l'assistant a compris la question avant même
 * qu'il réponde.
 */
export const LIBELLE_OUTIL: Record<string, string> = {
  motos_en_stock: "Lecture du stock de motos",
  chercher_client: "Recherche du client",
  ventes_recentes: "Lecture des ventes et des versements",
  argent_de_la_caisse: "Lecture du journal de caisse",
  catalogue_pieces: "Lecture du catalogue et du stock de pièces",
  /* Les deux gestes qui préparent sont nommés ici aussi : sans entrée, le
     rendu retombait sur la clé technique et affichait « lu : preparer_depense »
     sous la réponse — du code montré à un gérant. */
  preparer_depense: "Préparation d’une dépense",
  preparer_mouvement_piece: "Préparation d’un mouvement de stock",
  aller_a: "Ouverture de l’écran",
  choisir_la_boutique: "Changement de boutique",
  fermer_l_assistant: "Fermeture du panneau",
};
