"use client";

import { Plus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Champ } from "@/components/patrons/Champ";
import { ErreurDeLecture, EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import { formaterTelephone, normaliserNom } from "@/lib/domain/client";
import { formaterDateCourte } from "@/lib/domain/format";
import {
  LONGUEUR_NOM_MAX,
  LONGUEUR_NUMERO_MOTO_MAX,
  LONGUEUR_TELEPHONE_MAX,
  RETRAIT_CMC_VIDE,
  chercherRetraitsCmc,
  validerRetraitCmc,
  type RetraitCmc,
  type SaisieRetraitCmc,
} from "@/lib/domain/retrait-cmc";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  ecouterRetraitsCmc,
  enregistrerRetraitCmc,
  messageErreurRetraitCmc,
} from "@/lib/repositories/retraits-cmc";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Le registre des CMC retirés (26 octobre 2026, demande du commanditaire).
 *
 * « Ajoute un nouveau sous-onglet CMC, pour enregistrer ceux qui viennent
 * récupérer les CMC : nom, prénom, numéro, numéro de la moto. »
 *
 * **Ce n'est pas le suivi des papiers, et c'est volontaire.** Le produit sait
 * déjà si le CMC d'une moto est en main — la case de l'inspection du lot — et
 * si l'acheteur l'a emporté — la case de la fiche de vente. Cet écran-ci
 * répond à une autre question, qui n'avait nulle part où se poser : **qui est
 * venu le chercher**. Celui qui se présente au comptoir n'est pas toujours
 * l'acheteur, et la moto pas toujours une moto vendue par la maison.
 *
 * **Du texte libre, et c'est la forme juste.** On note ce que la personne
 * déclare et ce qu'elle présente. Exiger de retrouver la moto au stock
 * bloquerait le geste quand elle vient d'ailleurs, et transformerait une
 * signature de registre en enquête.
 *
 * La garde du métier est posée par `app/(app)/motos/layout.tsx`, comme pour
 * les autres écrans de cet espace.
 */
export default function PageRetraitsCmc() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const surTitre = useSurTitre("Motos");
  const boutiqueId = perimetre.boutiqueId;

  const [recherche, setRecherche] = useState("");
  const [creation, setCreation] = useState(false);

  const souscrire = useCallback(
    (auChangement: (lignes: RetraitCmc[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterRetraitsCmc(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur, erreur, echec, reessayer } = useAbonnement(
    souscrire,
    "Le registre n’a pas pu être lu.",
  );

  const trouves = useMemo(
    () => chercherRetraitsCmc(valeur ?? [], recherche, normaliserNom),
    [valeur, recherche],
  );

  const colonnes: Colonne<RetraitCmc>[] = useMemo(
    () => [
      {
        cle: "date",
        titre: "Date",
        rendu: (ligne) => (ligne.date ? formaterDateCourte(ligne.date) : "—"),
      },
      {
        cle: "nom",
        titre: "Nom et prénom",
        principal: true,
        rendu: (ligne) => (
          <span className="font-medium text-encre">
            {[ligne.nom, ligne.prenom].filter(Boolean).join(" ")}
          </span>
        ),
      },
      {
        cle: "telephone",
        titre: "Numéro",
        chiffre: true,
        rendu: (ligne) => (ligne.telephone ? formaterTelephone(ligne.telephone) : "—"),
      },
      {
        cle: "numeroMoto",
        titre: "Numéro de la moto",
        chiffre: true,
        rendu: (ligne) => ligne.numeroMoto,
      },
      {
        cle: "auteur",
        titre: "Remis par",
        rendu: (ligne) => ligne.auteur || "—",
      },
    ],
    [],
  );

  if (session.statut !== "connecte") return null;
  const auteur: Auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

  return (
    <div>
      {surTitre}
      <TetePage
        titre="CMC"
        actions={
          boutiqueId !== null ? (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="bouton bouton-principal"
            >
              <Plus aria-hidden="true" className="size-4" />
              Inscrire un retrait
            </button>
          ) : undefined
        }
      />

      <div className="mt-6">
        <label htmlFor="recherche-cmc" className="block text-sm font-medium text-encre">
          Chercher dans le registre
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
          />
          <input
            id="recherche-cmc"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Un nom, un numéro de téléphone, un numéro de moto…"
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            className="saisie pr-3 pl-9 placeholder:text-encre-doux sm:max-w-96"
          />
        </div>
      </div>

      {erreur !== null ? (
        <ErreurDeLecture
          titre="Le registre n’a pas pu être lu"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/dossiers", libelle: "Voir les dossiers" }}
        >
          Sans cette lecture, impossible de dire qui est venu chercher un papier.
        </ErreurDeLecture>
      ) : trouves.length === 0 && valeur !== null ? (
        null
      ) : (
        <Tableau
          legende="Les CMC retirés, du plus récent au plus ancien."
          colonnes={colonnes}
          lignes={trouves}
          cleDe={(ligne) => ligne.id}
          chargement={valeur === null}
        />
      )}

      {creation && boutiqueId !== null && (
        <RetraitModale
          boutiqueId={boutiqueId}
          auteur={auteur}
          onFermer={() => setCreation(false)}
        />
      )}
    </div>
  );
}

/**
 * La saisie d'un retrait : quatre champs, et rien de plus.
 *
 * Ce sont les quatre que le commanditaire a nommés. Y ajouter la moto du stock,
 * la vente ou le dossier ferait d'un geste de comptoir une recherche — et
 * fermerait le registre aux motos qui ne viennent pas de la maison.
 */
function RetraitModale({
  boutiqueId,
  auteur,
  onFermer,
}: {
  boutiqueId: string;
  auteur: Auteur;
  onFermer: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieRetraitCmc>(RETRAIT_CMC_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (partie: Partial<SaisieRetraitCmc>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre() {
    const probleme = validerRetraitCmc(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    const { enregistre } = enregistrerRetraitCmc(saisie, boutiqueId, auteur);
    /* L'écriture n'est pas attendue : hors ligne elle part en file et ne
       revient jamais. La ligne est déjà dans le cache, donc déjà au registre
       (D66). */
    enregistre.catch((cause: unknown) =>
      console.error("Retrait CMC refusé", messageErreurRetraitCmc(cause)),
    );
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Inscrire un retrait de CMC"
      taille="moyenne"
      pied={
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={onFermer} className="bouton bouton-discret">
            Annuler
          </button>
          <button type="button" onClick={soumettre} className="bouton bouton-principal">
            Inscrire au registre
          </button>
        </div>
      }
    >
      <div className="colonne-formulaire rangee-champs">
        <Champ id="cmc-nom" libelle="Nom">
          <input
            id="cmc-nom"
            value={saisie.nom}
            maxLength={LONGUEUR_NOM_MAX}
            autoComplete="off"
            onChange={(evenement) => changer({ nom: evenement.target.value })}
            className="saisie"
          />
        </Champ>
        <Champ id="cmc-prenom" libelle="Prénom" facultatif>
          <input
            id="cmc-prenom"
            value={saisie.prenom}
            maxLength={LONGUEUR_NOM_MAX}
            autoComplete="off"
            onChange={(evenement) => changer({ prenom: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ
          id="cmc-telephone"
          libelle="Numéro"
          facultatif
          /* On ne refuse pas un CMC à quelqu'un qui n'a pas de téléphone : le
             registre note ce qu'on sait, pas ce qu'on exige. */
        >
          <input
            id="cmc-telephone"
            inputMode="tel"
            value={saisie.telephone}
            maxLength={LONGUEUR_TELEPHONE_MAX}
            autoComplete="off"
            onChange={(evenement) => changer({ telephone: evenement.target.value })}
            className="plaque-code saisie"
          />
        </Champ>

        <Champ
          id="cmc-moto"
          libelle="Numéro de la moto"
        >
          <input
            id="cmc-moto"
            value={saisie.numeroMoto}
            maxLength={LONGUEUR_NUMERO_MOTO_MAX}
            autoComplete="off"
            spellCheck={false}
            onChange={(evenement) => changer({ numeroMoto: evenement.target.value })}
            className="plaque-code saisie"
          />
        </Champ>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
