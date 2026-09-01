"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSession } from "@/lib/auth/session";
import { reunirMetiers, type Boutique, type Metier } from "@/lib/domain/boutique";
import { ecouterBoutique, ecouterBoutiques } from "@/lib/repositories/boutiques";
import { ecouterPerimetreMemorise, lirePerimetreMemorise, memoriserPerimetre } from "./memoire";

/**
 * Le périmètre : dans quelle boutique on est en train de travailler.
 *
 * C’est la question la plus coûteuse à se tromper dans une application
 * multi-boutique — une vente enregistrée dans la mauvaise boutique fausse deux
 * stocks à la fois. Elle est donc répondue en permanence dans le bandeau, et
 * non cachée dans un menu.
 *
 * Deux personnes, deux rapports à cette question : le responsable **choisit**
 * (une boutique ou toutes), le gérant **constate** (la sienne, posée dans son
 * jeton). Un gérant n’a pas de sélecteur parce qu’il n’a pas de choix : les
 * règles Firestore ne lui donneraient rien d’autre de toute façon.
 *
 * Aujourd’hui, ce périmètre est **publié, pas appliqué** : il n’existe encore
 * aucune donnée opérationnelle à filtrer. Les specs suivantes y branchent leurs
 * requêtes.
 */

/** Le code de l’entreprise, affiché quand aucune boutique précise n’est en vue. */
export const CODE_ENTREPRISE = "SDI";

export type Perimetre = {
  /** `toutes` : l’entreprise entière · `boutique` : une seule · `aucune` : rien à montrer encore. */
  type: "toutes" | "boutique" | "aucune";
  boutiqueId: string | null;
  code: string;
  nom: string;
  /**
   * Ce que ce périmètre vend, et donc quels espaces s’ouvrent (D62).
   *
   * Vide tant que la réponse n’est pas connue — chargement en cours, ou aucune
   * boutique déclarée. La navigation ne rend alors que les espaces certains
   * plutôt qu’une entrée qui disparaîtrait sous le doigt.
   */
  metiers: Metier[];
};

export type EtatPerimetre = {
  chargement: boolean;
  /** Les boutiques que ce compte a le droit de voir : toutes, ou la sienne. */
  boutiques: Boutique[];
  perimetre: Perimetre;
  peutChoisir: boolean;
  choisir: (boutiqueId: string | null) => void;
  erreur: string | null;
};

const TOUTES: Perimetre = {
  type: "toutes",
  boutiqueId: null,
  code: CODE_ENTREPRISE,
  nom: "Toutes les boutiques",
  metiers: [],
};

const PAR_DEFAUT: EtatPerimetre = {
  chargement: true,
  boutiques: [],
  perimetre: TOUTES,
  peutChoisir: false,
  choisir: () => {},
  erreur: null,
};

const Contexte = createContext<EtatPerimetre>(PAR_DEFAUT);

function versPerimetre(boutique: Boutique): Perimetre {
  return {
    type: "boutique",
    boutiqueId: boutique.id,
    code: boutique.code,
    nom: boutique.nom,
    metiers: boutique.metiers,
  };
}

export function FournisseurPerimetre({ children }: { children: ReactNode }) {
  const session = useSession();
  const utilisateur = session.statut === "connecte" ? session.utilisateur : null;
  const uid = utilisateur?.uid ?? null;
  const role = utilisateur?.role ?? null;
  const boutiqueDuGerant = utilisateur?.boutiqueId ?? null;

  const [boutiques, setBoutiques] = useState<Boutique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /* Le choix mémorisé vit hors de React (`localStorage`). On s’y abonne plutôt
     que de le recopier dans un état depuis un effet : au rendu serveur il
     n’existe pas, et `useSyncExternalStore` sait gérer cet écart à
     l’hydratation sans rendu en cascade. */
  const choix = useSyncExternalStore(
    ecouterPerimetreMemorise,
    () => (uid ? lirePerimetreMemorise(uid) : null),
    () => null,
  );

  useEffect(() => {
    if (!role) return;

    const enEchec = (cause: unknown) => {
      setBoutiques([]);
      setErreur(
        (cause as { code?: string }).code?.includes("permission-denied")
          ? "Vos droits ne permettent pas de lire les boutiques."
          : "La liste des boutiques n’a pas pu être chargée.",
      );
    };

    if (role === "responsable") {
      return ecouterBoutiques((liste) => {
        setBoutiques(liste);
        setErreur(null);
      }, enEchec);
    }

    /* Le gérant ne lit qu’un document : le sien. Une requête sur la collection
       lui serait refusée par les règles, et il n’a rien à y chercher. */
    if (boutiqueDuGerant) {
      return ecouterBoutique(
        boutiqueDuGerant,
        (boutique) => {
          setBoutiques(boutique ? [boutique] : []);
          setErreur(null);
        },
        enEchec,
      );
    }
  }, [role, boutiqueDuGerant]);

  const choisir = useCallback(
    (boutiqueId: string | null) => {
      if (uid) memoriserPerimetre(uid, boutiqueId);
    },
    [uid],
  );

  const valeur = useMemo<EtatPerimetre>(() => {
    /* Un gérant sans boutique n’a aucun écouteur ouvert : rien ne chargera
       jamais, et dire « chargement » indéfiniment serait un mensonge. */
    const attendUnEcouteur = role === "responsable" || Boolean(boutiqueDuGerant);
    const chargement = Boolean(role) && attendUnEcouteur && boutiques === null;
    const visibles = boutiques ?? [];

    let perimetre: Perimetre;
    if (role === "gerant") {
      const sienne = visibles.find((boutique) => boutique.id === boutiqueDuGerant);
      perimetre = sienne
        ? versPerimetre(sienne)
        : {
            type: boutiqueDuGerant && chargement ? "boutique" : "aucune",
            boutiqueId: boutiqueDuGerant,
            code: boutiqueDuGerant ?? CODE_ENTREPRISE,
            nom: boutiqueDuGerant ? "" : "Aucune boutique attribuée",
            metiers: [],
          };
    } else if (visibles.length === 0 && !chargement) {
      perimetre = { ...TOUTES, type: "aucune", nom: "Aucune boutique" };
    } else {
      /* Une boutique fermée ne peut pas rester le périmètre courant : on
         retomberait sur un écran de saisie qui n’a plus de destination. */
      const choisie = visibles.find((boutique) => boutique.id === choix && boutique.actif);
      /* « Toutes les boutiques » ouvre l’union des métiers : le responsable
         garde les deux espaces sous la main tant qu’il n’a pas choisi. Une
         boutique fermée n’y contribue pas — on ne saisit plus dedans. */
      perimetre = choisie
        ? versPerimetre(choisie)
        : { ...TOUTES, metiers: reunirMetiers(visibles.filter((boutique) => boutique.actif)) };
    }

    return {
      chargement,
      boutiques: visibles,
      perimetre,
      /* Pendant le chargement, on parie sur le cas courant — le responsable a
         des boutiques — plutôt que d'afficher une plaque fixe qui se
         transformerait en liste déroulante une seconde plus tard. */
      peutChoisir:
        role === "responsable" && (chargement || visibles.some((boutique) => boutique.actif)),
      choisir,
      erreur,
    };
  }, [role, boutiqueDuGerant, boutiques, choix, erreur, choisir]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function usePerimetre(): EtatPerimetre {
  return useContext(Contexte);
}
