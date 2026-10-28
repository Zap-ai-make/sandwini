"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import {
  EtatChargement,
  EtatErreur,
  EtatErreurSaisie,
} from "@/components/patrons/Etats";
import { Champ } from "@/components/patrons/Champ";
import { Modale } from "@/components/patrons/Modale";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_ADRESSE_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  LIBELLE_METIER,
  METIERS,
  engendrerCode,
  validerBoutique,
  type Boutique,
  type Metier,
  type SaisieBoutique,
} from "@/lib/domain/boutique";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import {
  changerActivationBoutique,
  creerBoutique,
  messageErreurBoutique,
  modifierBoutique,
} from "@/lib/repositories/boutiques";

/**
 * Les boutiques de l’entreprise.
 *
 * Écran d’administration, mais qui suit la même règle que les écrans de vente :
 * il fonctionne sans réseau. Une boutique se déclare rarement ; rien ne
 * justifie pour autant qu’elle exige une connexion quand la vente, elle, n’en
 * exige pas.
 */
export default function PageBoutiques() {
  return (
    <GardeCapacite capacite="gerer_boutiques">
      <Boutiques />
    </GardeCapacite>
  );
}

const VIDE: SaisieBoutique = { nom: "", code: "", metiers: [], adresse: "", telephone: "" };

const FORMULAIRE_BOUTIQUE = "creer-boutique";

function Boutiques() {
  const { boutiques, chargement, erreur } = usePerimetre();
  const [creation, setCreation] = useState(false);

  return (
    <div>
      {/* La liste d'abord, la création en modale (S54). Le formulaire occupait
          le haut de l'écran en permanence : on venait presque toujours pour
          consulter ou corriger, et il fallait le dépasser à chaque fois. Un
          bouton en tête, et l'écran redevient ce qu'il est — une liste. */}
      <TetePage
        retour={{ href: "/parametres", libelle: "Paramètres" }}
        titre="Boutiques"
        actions={
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bouton bouton-principal"
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter une boutique
          </button>
        }
      />

      {creation && (
        <FormulaireCreation existantes={boutiques} onFermer={() => setCreation(false)} />
      )}

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Boutiques déclarées
      </h2>

      <EtatErreur message={erreur} className="mt-3" />

      {chargement ? (
        <EtatChargement className="mt-3">Chargement des boutiques…</EtatChargement>
      ) : boutiques.length === 0 && !erreur ? (
        null
      ) : (
        <ul className="mt-3 cadre cadre-liste">
          {boutiques.map((boutique) => (
            <LigneBoutique key={boutique.id} boutique={boutique} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LigneBoutique({ boutique }: { boutique: Boutique }) {
  const session = useSession();
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function basculerOuverture() {
    if (session.statut !== "connecte") return;
    setErreur(null);
    /* Pas d’attente : hors ligne, la promesse ne se résout qu’au retour du
       réseau, mais l’écriture est déjà appliquée au cache — la liste bouge tout
       de suite et le bandeau compte la saisie en attente. */
    changerActivationBoutique(boutique.id, !boutique.actif, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurBoutique(cause)));
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={[
            "plaque-code flex h-8 shrink-0 items-center rounded-plaque border px-2 text-sm leading-none",
            boutique.actif
              ? "border-plaque-bord bg-plaque text-encre-fixe"
              : "border-bord text-encre-doux",
          ].join(" ")}
        >
          {boutique.code}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-encre">{boutique.nom}</span>
            {/* L’état ne passe jamais par la seule couleur (DESIGN.md §5). */}
            {!boutique.actif && (
              <span className="rounded-plaque border border-bord px-1.5 py-0.5 text-xs font-medium text-alerte">
                Fermée
              </span>
            )}
          </span>
          <span className="block text-sm text-encre-doux">
            {[
              boutique.metiers.map((metier) => LIBELLE_METIER[metier]).join(" et "),
              boutique.adresse,
              boutique.telephone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        <span className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEdition((ouvert) => !ouvert)}
            aria-expanded={edition}
            className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            <Pencil aria-hidden="true" className="size-4" />
            {edition ? "Annuler" : "Modifier"}
          </button>
          <button
            type="button"
            onClick={basculerOuverture}
            className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            {boutique.actif ? "Fermer" : "Rouvrir"}
          </button>
        </span>
      </div>

      <EtatErreur message={erreur} className="mt-2" />

      {edition && <FormulaireEdition boutique={boutique} surFin={() => setEdition(false)} />}
    </li>
  );
}

/** Coche ou décoche un métier, en gardant l’ordre de `METIERS`. */
function basculerMetier(actuels: Metier[], metier: Metier): Metier[] {
  const suivants = actuels.includes(metier)
    ? actuels.filter((autre) => autre !== metier)
    : [...actuels, metier];
  return METIERS.filter((candidat) => suivants.includes(candidat));
}

/**
 * Les champs d'une boutique.
 *
 * **Le code a disparu du formulaire le 23 octobre 2026**, à la demande du
 * commanditaire. On demandait trois lettres dont il n'a que faire : elles
 * n'existent que pour la numérotation des reçus et pour identifier le document.
 * Un champ qu'on ne comprend pas se remplit au hasard, et ce hasard-là se
 * retrouvait ensuite sur chaque reçu imprimé — définitivement, puisqu'un code
 * ne se change pas. Il se déduit maintenant du nom.
 */
function ChampsBoutique({
  saisie,
  changer,
  prefixe,
}: {
  saisie: SaisieBoutique;
  changer: (partie: Partial<SaisieBoutique>) => void;
  prefixe: string;
}) {
  return (
    <div className="colonne-formulaire mt-4 max-w-[40rem] space-y-4">
      <Champ id={`${prefixe}-nom`} libelle="Nom de la boutique">
        <input
          id={`${prefixe}-nom`}
          required
          maxLength={LONGUEUR_NOM_MAX}
          value={saisie.nom}
          onChange={(e) => changer({ nom: e.target.value })}
          className="saisie"
        />
      </Champ>

      {/* Un `fieldset` avec sa `legend` : c’est le regroupement que les lecteurs
          d’écran annoncent avant chaque case, et il n’y a rien à écrire de plus
          (DESIGN.md §11). */}
      <fieldset>
        <legend className="block text-sm font-medium text-encre">Ce que cette boutique vend</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {METIERS.map((metier) => {
            const coche = saisie.metiers.includes(metier);
            return (
              <label
                key={metier}
                className={[
                  "inline-flex h-12 cursor-pointer items-center gap-2.5 rounded-plaque border px-3 text-sm font-medium",
                  coche
                    ? "border-2 border-encre bg-papier font-semibold text-encre"
                    : "border-bord bg-papier text-encre",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={coche}
                  onChange={() => changer({ metiers: basculerMetier(saisie.metiers, metier) })}
                  className="size-4 accent-encre-fixe"
                />
                {LIBELLE_METIER[metier]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Champ
        id={`${prefixe}-adresse`}
        libelle="Adresse"
      >
        <input
          id={`${prefixe}-adresse`}
          maxLength={LONGUEUR_ADRESSE_MAX}
          value={saisie.adresse}
          onChange={(e) => changer({ adresse: e.target.value })}
          className="saisie"
        />
      </Champ>

      <Champ id={`${prefixe}-telephone`} libelle="Téléphone">
        <input
          id={`${prefixe}-telephone`}
          type="tel"
          inputMode="tel"
          maxLength={LONGUEUR_TELEPHONE_MAX}
          value={saisie.telephone}
          onChange={(e) => changer({ telephone: e.target.value })}
          className="saisie"
        />
      </Champ>
    </div>
  );
}

function FormulaireCreation({
  existantes,
  onFermer,
}: {
  existantes: Boutique[];
  onFermer: () => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieBoutique>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerBoutique(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* **Le code se déduit du nom**, et son unicité est cherchée ici contre les
       boutiques déjà déclarées. La base la garantit de toute façon — le code
       est l'identifiant du document — mais un refus qui n'arriverait qu'à la
       synchronisation arriverait trop tard. */
    const code = engendrerCode(saisie.nom, new Set(existantes.map((boutique) => boutique.id)));
    if (code === null) {
      setErreur(
        "Le nom de la boutique doit contenir au moins une lettre : c’est de lui qu’est tiré le code des reçus.",
      );
      return;
    }

    setErreur(null);
    /* On ne guette pas l'accusé du serveur (D76) : Firestore écrit au cache
       local sur-le-champ, donc la boutique est déjà dans la liste derrière la
       modale. C'est elle, la confirmation — mieux qu'une phrase verte. */
    creerBoutique({ ...saisie, code }, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurBoutique(cause)));

    setSaisie(VIDE);
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Ajouter une boutique"
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="submit" form={FORMULAIRE_BOUTIQUE} className="bouton bouton-principal">
            Créer la boutique
          </button>
          {/* « Annuler » et non « Fermer » : on abandonne une saisie, on ne
              referme pas une consultation. Sur l'écran des boutiques, le mot
              « Fermer » est déjà pris — il désigne la fermeture d'un point de
              vente, à deux centimètres de là. */}
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
    <form id={FORMULAIRE_BOUTIQUE} onSubmit={soumettre} noValidate>
      <ChampsBoutique
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe="nouvelle"
      />

      <EtatErreurSaisie message={erreur} className="mt-3" />
    </form>
    </Modale>
  );
}

function FormulaireEdition({ boutique, surFin }: { boutique: Boutique; surFin: () => void }) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieBoutique>({
    nom: boutique.nom,
    code: boutique.code,
    metiers: boutique.metiers,
    adresse: boutique.adresse,
    telephone: boutique.telephone,
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerBoutique(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    modifierBoutique(boutique.id, saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurBoutique(cause)));
    surFin();
  }

  return (
    <form
      onSubmit={soumettre}
      className="mt-3 rounded-plaque border border-bord bg-fond p-4"
      noValidate
    >
      <h3 className="text-sm font-semibold text-encre">Modifier {boutique.nom}</h3>

      <ChampsBoutique
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe={`edition-${boutique.id}`}
      />

      <EtatErreurSaisie message={erreur} className="mt-3" />

      <div className="mt-3 flex gap-2">
        <button type="submit" className="bouton bouton-principal">
          Enregistrer
        </button>
        <button type="button" onClick={surFin} className="bouton bouton-neutre">
          Annuler
        </button>
      </div>
    </form>
  );
}
