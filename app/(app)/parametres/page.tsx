"use client";

import { LogOut, Settings } from "lucide-react";
import { useCallback, useState } from "react";
import { IdentiteEntreprise } from "@/components/IdentiteEntreprise";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { Avis } from "@/components/patrons/Avis";
import { Hub, type Destination } from "@/components/patrons/Hub";
import { TetePage, TitreSection } from "@/components/patrons/Page";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import { formaterTelephone } from "@/lib/domain/client";
import { IDENTITE } from "@/lib/domain/entreprise";
import { ecransVisibles } from "@/lib/domain/espaces";
import type { Prestataire } from "@/lib/domain/prestataire";
import { LIBELLE_ROLE, peut } from "@/lib/domain/roles";
import { faitsDeVersion } from "@/lib/domain/version";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterBoutiques } from "@/lib/repositories/boutiques";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { ecouterUtilisateurs, type FicheUtilisateur } from "@/lib/repositories/utilisateurs";
import { VERSION_COURANTE } from "@/lib/version/courante";
import { useMiseAJour } from "@/lib/version/mise-a-jour";

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
 * **La boutique du périmètre se lit ici aussi** (S44). Son nom, son code, son
 * adresse et son téléphone forment le second en-tête du reçu ; ils vivaient
 * dans une ligne de la liste des boutiques, qu’il fallait ouvrir et parcourir.
 *
 * **Le sommaire des destinations n’existe plus que sur petit écran** (S44).
 * Au-dessus de 1024 px, la colonne de gauche liste exactement les mêmes écrans,
 * dans le même ordre et avec les mêmes droits — les deux dérivent de
 * `GROUPES_DE.reglages`, et un test unitaire les empêche de diverger. Ouvrir
 * « Réglages » pour tomber sur une seconde table des matières ne menait nulle
 * part qu’on n’ait déjà sous les yeux. En dessous, la colonne est masquée et
 * rien ne la remplace : le hub y redevient le seul chemin, et il reste.
 *
 * **Chaque destination annonce ce qu’on y trouvera**, là où elle s’affiche.
 * « 3 prestataires » et « aucun prestataire » ne demandent pas la même visite ;
 * sur une installation neuve, ce compte est ce qui dit quel écran reste à
 * remplir.
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
        surTitre={`Réglages · ${IDENTITE.raisonSociale}`}
        titre="Réglages"
        sousTitre="Ce que vous changez ici s’applique à toutes les boutiques."
      />

      <section aria-labelledby="titre-identite" className="mb-8">
        <TitreSection id="titre-identite">L’identité de l’entreprise</TitreSection>
        {/* 20 px tout autour, comme `.identite` (`socle.css:992`) : la carte
            porte désormais le monogramme, et deux pixels de haut le collaient
            au filet du cadre. */}
        <div className="cadre p-4 sm:p-5">
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

      {/* La boutique du périmètre, en clair et tout de suite (S44). Ce qui
          s'imprime sous l'en-tête de l'entreprise sur chaque reçu — le code,
          le nom, l'adresse et le téléphone du comptoir — se lisait jusqu'ici
          en ouvrant « Boutiques » et en cherchant la bonne ligne. */}
      <IdentiteBoutique boutiques={boutiques} boutiqueId={perimetre.boutiqueId} />

      {/* « Ce qui change » ne survit que là où la colonne de gauche n'est pas.
          Au-dessus de 1024 px elle liste exactement ces écrans, dans le même
          ordre et avec les mêmes droits : le hub y était un second sommaire, et
          l'écran des réglages n'ouvrait que sur une table des matières.
          En dessous, la colonne est masquée (`.colonne` est en `max-lg:hidden`)
          et rien ne la remplace : ce hub est alors le **seul** chemin vers les
          six écrans d'administration, et le retirer partout les rendrait
          inatteignables au comptoir. */}
      {administration.length > 0 && (
        <section aria-labelledby="titre-administration" className="mb-8 lg:hidden">
          <TitreSection id="titre-administration">Ce qui change</TitreSection>
          <Hub destinations={administration} />
        </section>
      )}

      {/* La section ne dépend plus de la présence du lien de synchronisation :
          ce qui tourne sur cet appareil se lit quel que soit le rôle, et c'est
          le gérant — celui dont l'écran est le plus susceptible d'être en
          retard — qui appelle pour décrire un comportement (S34). */}
      <section aria-labelledby="titre-appareil" className="mb-8">
        <TitreSection id="titre-appareil">Cet appareil</TitreSection>
        <dl className="cadre cadre-liste">
          {faitsDeVersion(VERSION_COURANTE).map(({ titre, valeur }) => (
            <Fait key={titre} titre={titre}>
              {titre === "Empreinte" ? <span className="font-code">{valeur}</span> : valeur}
            </Fait>
          ))}
        </dl>
        <MiseAJour />
        {appareil.length > 0 && (
          <div className="mt-3">
            <Hub destinations={appareil} />
          </div>
        )}
        <p className="mt-3 max-w-prose text-corps text-encre-doux">
          Cette page est propre à l’appareil du comptoir : ce qui est en attente ici n’est pas en
          attente ailleurs.
        </p>
      </section>

      <section aria-labelledby="titre-compte">
        <TitreSection id="titre-compte">Votre compte</TitreSection>
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

/**
 * « Une version plus récente est prête », et ce qu’il faut faire pour l’avoir.
 *
 * C’est la moitié du problème que le numéro seul ne résout pas : sans elle,
 * personne au comptoir ne sait que son appareil est en retard, ni pourquoi la
 * correction déployée hier ne change rien chez lui (S34, réponse 4).
 *
 * Rien tant qu’il n’y a rien à dire — pas de carte « aucune mise à jour », qui
 * serait une carte à zéro (D63). Le ton est `transit` et non `alerte` : la
 * version est arrivée, elle n’est pas encore en vigueur ; rien n’est cassé.
 * Et `role="status"` plutôt qu’`alert`, parce que l’avis décrit un état déjà
 * là à l’ouverture de l’écran, et non la réponse à un geste qu’on vient de
 * faire.
 *
 * **Pourquoi il n’y a pas de bouton « Recharger maintenant ».** Il y en avait
 * un, et la vérification a montré qu’il ne pouvait pas tenir sa promesse : tant
 * qu’un écran de l’application est ouvert, ses écoutes Firestore gardent le
 * service worker actif occupé, et la version en attente ne prend jamais la
 * main — pas même après un rechargement complet. Mesuré, chiffré, expliqué en
 * D85. Un bouton qui ne fait rien est pire que pas de bouton : il apprend à ne
 * plus croire l’écran. La phrase dit donc ce qui marche vraiment — fermer
 * l’application, la rouvrir — et le bouton est au backlog, avec sa mesure.
 */
function MiseAJour() {
  const { enAttente } = useMiseAJour();
  if (!enAttente) return null;
  return (
    <Avis ton="transit" role="status" titre="Une version plus récente est prête" className="mt-3">
      <p>
        Elle est déjà téléchargée sur cet appareil, et aucune saisie en cours ne sera interrompue :
        elle s’installera quand vous aurez <strong className="font-semibold">fermé complètement
        l’application, puis rouverte</strong> — à la réouverture du magasin, par exemple.
      </p>
    </Avis>
  );
}

/**
 * L'identité de la boutique du périmètre (S44).
 *
 * C'est le second en-tête du reçu : sous la raison sociale, le client lit le
 * comptoir où il est passé — et c'est là qu'il revient. Cette carte le montre
 * à l'endroit où l'on vient vérifier « qu'est-ce qui est imprimé ».
 *
 * Elle ne s'affiche pas sur « toutes les boutiques » : il n'y a alors pas une
 * identité à montrer mais plusieurs, et la liste a son écran. Rien non plus
 * tant que la collection n'est pas revenue — une carte vide se lirait comme
 * une boutique sans adresse (D63).
 */
function IdentiteBoutique({
  boutiques,
  boutiqueId,
}: {
  boutiques: Boutique[] | null;
  boutiqueId: string | null;
}) {
  if (!boutiqueId || boutiques === null) return null;
  const boutique = boutiques.find((fiche) => fiche.id === boutiqueId);
  if (!boutique) return null;

  return (
    <section aria-labelledby="titre-boutique" className="mb-8">
      <TitreSection id="titre-boutique">La boutique</TitreSection>
      <dl className="cadre cadre-liste">
        <Fait titre="Nom">{boutique.nom}</Fait>
        <Fait titre="Code">
          <span className="plaque-code">{boutique.code}</span>
        </Fait>
        <Fait titre="Adresse">{boutique.adresse || "Non renseignée"}</Fait>
        <Fait titre="Téléphone">
          {boutique.telephone ? formaterTelephone(boutique.telephone) : "Non renseigné"}
        </Fait>
      </dl>
      <p className="mt-3 max-w-prose text-corps text-encre-doux">
        C’est ce qui s’imprime sous l’en-tête de l’entreprise, sur les reçus remis à ce comptoir.
      </p>
    </section>
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
