"use client";

import { LogOut, Settings } from "lucide-react";
import { useCallback, useState } from "react";
import { IdentiteEntreprise } from "@/components/IdentiteEntreprise";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { Hub, type Destination } from "@/components/patrons/Hub";
import { TetePage } from "@/components/patrons/Page";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import { ecransVisibles } from "@/lib/domain/espaces";
import type { Prestataire } from "@/lib/domain/prestataire";
import { LIBELLE_ROLE, peut } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterBoutiques } from "@/lib/repositories/boutiques";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { ecouterUtilisateurs, type FicheUtilisateur } from "@/lib/repositories/utilisateurs";

/**
 * Les réglages : ce qui est posé une fois, et ce qui change.
 *
 * **L’identité de l’entreprise se lit ici, à plat.** Elle occupait un écran
 * qu’il fallait ouvrir pour découvrir qu’on n’y saisissait rien. Or c’est
 * précisément ce qu’il faut apprendre : ces mentions font partie du logiciel,
 * elles s’impriment sur chaque reçu, et elles ne se modifient pas depuis
 * l’application (D71). Posée sur le hub, la carte le dit sans qu’on ait à la
 * chercher.
 *
 * **Chaque destination annonce ce qu’on y trouvera.** « 3 prestataires » et
 * « aucun prestataire » ne demandent pas la même visite ; sur une installation
 * neuve, ce compte est ce qui dit quel écran reste à remplir. C’est le sens de
 * « atteints sans les chercher » : on ne va pas voir pour savoir.
 *
 * **Ce qui appartient à cet ordinateur est rangé à part.** La file d’envoi
 * n’est pas un réglage de l’entreprise : ce qui attend ici n’attend pas
 * ailleurs, et le mélanger aux boutiques ferait croire l’inverse.
 */
export default function Reglages() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const catalogue = useCatalogue();
  const [deconnexion, setDeconnexion] = useState(false);

  /* On n’écoute que ce que cette personne a le droit de lire. Un gérant ne voit
     pas la carte « Utilisateurs » ; s’abonner quand même à la collection des
     comptes lui vaudrait un refus des règles pour un compte qu’il n’affichera
     jamais. Les abonnements restent déclarés inconditionnellement — ce sont des
     hooks —, c’est la souscription elle-même qui devient muette. */
  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const litBoutiques = role !== null && peut(role, "gerer_boutiques");
  const litUtilisateurs = role !== null && peut(role, "gerer_utilisateurs");
  const litReferentiels = role !== null && peut(role, "gerer_referentiels");

  const souscrireBoutiques = useCallback(
    (auChangement: (boutiques: Boutique[]) => void, enErreur: (cause: unknown) => void) =>
      litBoutiques ? ecouterBoutiques(auChangement, enErreur) : () => {},
    [litBoutiques],
  );
  const { valeur: boutiques } = useAbonnement(
    souscrireBoutiques,
    "La liste des boutiques n’a pas pu être lue.",
  );

  const souscrireUtilisateurs = useCallback(
    (
      auChangement: (utilisateurs: FicheUtilisateur[]) => void,
      enErreur: (cause: unknown) => void,
    ) => (litUtilisateurs ? ecouterUtilisateurs(auChangement, enErreur) : () => {}),
    [litUtilisateurs],
  );
  const { valeur: utilisateurs } = useAbonnement(
    souscrireUtilisateurs,
    "La liste des utilisateurs n’a pas pu être lue.",
  );

  const souscrirePrestataires = useCallback(
    (auChangement: (prestataires: Prestataire[]) => void, enErreur: (cause: unknown) => void) =>
      litReferentiels ? ecouterPrestataires(auChangement, enErreur) : () => {},
    [litReferentiels],
  );
  const { valeur: prestataires } = useAbonnement(
    souscrirePrestataires,
    "La liste des prestataires n’a pas pu être lue.",
  );

  if (session.statut !== "connecte") return null;
  const { utilisateur } = session;

  /* Le compte de ce qu’on trouvera derrière chaque carte. `null` tant que la
     collection n’est pas revenue : « 0 boutique » sur une base qui n’a pas
     encore répondu enverrait déclarer une boutique qui existe déjà. */
  const etats: Record<string, string | undefined> = {
    "/parametres/boutiques": compte(
      boutiques?.filter((boutique) => boutique.actif).length,
      "boutique active",
      "boutiques actives",
      "aucune boutique active",
    ),
    "/parametres/utilisateurs": compte(utilisateurs?.length, "compte", "comptes", "aucun compte"),
    "/parametres/catalogue": catalogue.chargement
      ? undefined
      : `${compte(catalogue.marques.length, "marque", "marques", "aucune marque")} · ${compte(catalogue.modeles.length, "modèle", "modèles", "aucun modèle")}`,
    "/parametres/referentiels": catalogue.chargement
      ? undefined
      : compte(catalogue.provenances.length, "provenance", "provenances", "aucune provenance"),
    "/parametres/prestataires": compte(
      prestataires?.filter((prestataire) => prestataire.actif).length,
      "prestataire",
      "prestataires",
      "aucun prestataire",
    ),
  };

  const visibles = ecransVisibles("reglages", utilisateur.role).filter((ecran) => ecran.quoi);
  const versDestination = ({ href, libelle, quoi }: (typeof visibles)[number]): Destination => ({
    href,
    libelle,
    quoi: quoi ?? "",
    etat: etats[href],
    icone: ICONE_ECRAN[href] ?? Settings,
  });

  /* La file d’envoi appartient à l’appareil, pas à l’entreprise : elle a sa
     propre section, et sa propre phrase. */
  const administration = visibles
    .filter((ecran) => ecran.href !== "/diagnostic" && ecran.href !== "/parametres/entreprise")
    .map(versDestination);
  const appareil = visibles.filter((ecran) => ecran.href === "/diagnostic").map(versDestination);
  /* La fiche de l’entreprise suit l’identité, pas les cinq écrans de « Ce qui
     change » : ce qu’on va y faire, c’est régler le délai des tranches
     inactives — l’en-tête, lui, se lit juste au-dessus et ne se saisit pas.
     La voir en tête d’une section intitulée « Ce qui change » disait le
     contraire de la phrase qui la précède (vu sur capture). */
  const fiche = visibles
    .filter((ecran) => ecran.href === "/parametres/entreprise")
    .map(versDestination);

  return (
    <div>
      <TetePage
        titre="Réglages"
        sousTitre="Ce que vous changez ici s’applique à toutes les boutiques."
      />

      <section aria-labelledby="titre-identite" className="mb-8">
        <h2 id="titre-identite" className="mb-3 text-bloc font-bold tracking-tight text-encre">
          L’identité de l’entreprise
        </h2>
        <div className="cadre px-4 py-2">
          <IdentiteEntreprise />
        </div>
        <p className="mt-3 max-w-prose text-corps text-encre-doux">
          Ces informations sont posées à l’installation et s’impriment en tête de chaque reçu.{" "}
          <strong className="font-semibold text-encre">
            Elles ne se saisissent pas depuis l’application
          </strong>{" "}
          : elles ne changent pas d’une année sur l’autre, et un champ modifiable ne servirait qu’à
          les casser.
        </p>
        {fiche.length > 0 && (
          <div className="mt-3">
            <Hub destinations={fiche} />
          </div>
        )}
      </section>

      {administration.length > 0 && (
        <section aria-labelledby="titre-administration" className="mb-8">
          <h2
            id="titre-administration"
            className="mb-3 text-bloc font-bold tracking-tight text-encre"
          >
            Ce qui change
          </h2>
          <Hub destinations={administration} />
        </section>
      )}

      {appareil.length > 0 && (
        <section aria-labelledby="titre-appareil" className="mb-8">
          <h2 id="titre-appareil" className="mb-3 text-bloc font-bold tracking-tight text-encre">
            Cet appareil
          </h2>
          <Hub destinations={appareil} />
          <p className="mt-3 max-w-prose text-corps text-encre-doux">
            Cette page est propre à l’appareil du comptoir : ce qui est en attente ici n’est pas en
            attente ailleurs.
          </p>
        </section>
      )}

      <section aria-labelledby="titre-compte">
        <h2 id="titre-compte" className="mb-3 text-bloc font-bold tracking-tight text-encre">
          Votre compte
        </h2>
        <dl className="cadre cadre-liste">
          <Fait titre="Nom">{utilisateur.nom}</Fait>
          <Fait titre="Adresse e-mail">
            <span className="truncate">{utilisateur.email}</span>
          </Fait>
          <Fait titre="Rôle">{LIBELLE_ROLE[utilisateur.role]}</Fait>
          <Fait titre="Boutique">
            {utilisateur.role === "responsable" ? (
              "Toutes les boutiques"
            ) : perimetre.type === "boutique" ? (
              <>
                <span className="plaque-code">{perimetre.code}</span>
                {perimetre.nom ? ` ${perimetre.nom}` : ""}
              </>
            ) : (
              <span className="text-alerte">Aucune boutique attribuée</span>
            )}
          </Fait>
        </dl>

        {utilisateur.role === "gerant" && !utilisateur.boutiqueId && (
          <p className="mt-3 cadre p-4 text-corps text-encre">
            Aucune boutique ne vous est attribuée&nbsp;: vous ne verrez ni stock ni ventes tant que
            le responsable ne vous en aura pas donné une.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setDeconnexion(true);
            void seDeconnecter();
          }}
          disabled={deconnexion}
          className="mt-4 bouton bouton-neutre disabled:opacity-60"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {deconnexion ? "Déconnexion…" : "Se déconnecter"}
        </button>
        <p className="mt-2 max-w-prose text-corps text-encre-doux">
          La déconnexion efface les données gardées sur cet appareil. Sur un téléphone partagé,
          c’est ce qui empêche le gérant suivant de lire vos ventes.
        </p>
      </section>
    </div>
  );
}

function Fait({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-corps text-encre-doux">{titre}</dt>
      <dd className="min-w-0 text-right font-medium text-encre">{children}</dd>
    </div>
  );
}

/**
 * « 3 prestataires », « 1 boutique active », « aucun prestataire ».
 *
 * Le zéro s’écrit en toutes lettres et se donne en entier : l’article ne se
 * devine pas d’un nom français — « compte » est masculin et finit par un e.
 * Rien du tout tant que la collection n’est pas revenue : « 0 boutique » sur
 * une base qui n’a pas encore répondu enverrait déclarer ce qui existe déjà.
 */
function compte(
  nombre: number | undefined,
  singulier: string,
  pluriel: string,
  zero: string,
): string | undefined {
  if (nombre === undefined) return undefined;
  if (nombre === 0) return zero;
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}
