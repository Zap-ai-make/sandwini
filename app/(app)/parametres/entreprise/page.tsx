"use client";

import { ArrowLeft, ImageOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import {
  ENTREPRISE_VIDE,
  LOGO_LARGEUR_MAX,
  LOGO_TYPES_ACCEPTES,
  LONGUEUR_ADRESSE_MAX,
  LONGUEUR_IDENTIFIANT_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  validerEntreprise,
  type Entreprise,
} from "@/lib/domain/entreprise";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterEntreprise, enregistrerEntreprise, reduireLogo } from "@/lib/repositories/entreprise";
import { messageErreurReferentiel } from "@/lib/repositories/referentiels";

/**
 * L'identité de l'entreprise.
 *
 * Tout ce qui est saisi ici s'imprime en haut d'un reçu remis à un client.
 * C'est la seule raison d'être de cet écran, et c'est ce que son texte dit —
 * plutôt que « paramètres généraux », qui ne dirait rien de ce à quoi ça sert.
 */
export default function PageEntreprise() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <FicheEntreprise />
    </GardeCapacite>
  );
}

function FicheEntreprise() {
  const session = useSession();
  const souscrire = useCallback(
    (auChangement: (v: Entreprise) => void, enErreur: (c: unknown) => void) =>
      ecouterEntreprise(auChangement, enErreur),
    [],
  );
  const { valeur, erreur: erreurLecture } = useAbonnement(
    souscrire,
    "La fiche de l’entreprise n’a pas pu être chargée.",
  );

  const [brouillon, setBrouillon] = useState<Entreprise | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [logoEnCours, setLogoEnCours] = useState(false);

  /* Tant que rien n'a été touché, l'écran montre ce que dit la base ; dès la
     première frappe, il montre le brouillon et ne s'en écarte plus. Recopier
     les instantanés suivants dans l'état ferait sauter le texte sous les doigts
     de celui qui tape — ce sont d'ailleurs nos propres écritures qui
     reviennent. */
  const saisie = brouillon ?? valeur;

  if (erreurLecture) {
    return (
      <Cadre>
        <p role="alert" className="text-alerte">
          {erreurLecture}
        </p>
      </Cadre>
    );
  }

  if (!saisie) {
    return (
      <Cadre>
        <p className="flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement de la fiche…
        </p>
      </Cadre>
    );
  }

  const changer = (partie: Partial<Entreprise>) =>
    setBrouillon((actuel) => ({ ...(actuel ?? valeur ?? ENTREPRISE_VIDE), ...partie }));

  async function choisirLogo(fichier: File) {
    setErreur(null);
    setSucces(null);
    setLogoEnCours(true);
    try {
      changer({ logo: await reduireLogo(fichier) });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Cette image n’a pas pu être lue.");
    } finally {
      setLogoEnCours(false);
    }
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !saisie) return;
    setSucces(null);

    const probleme = validerEntreprise(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    enregistrerEntreprise(saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurReferentiel(cause)));
    setSucces("Fiche enregistrée. Les prochains reçus la porteront.");
  }

  return (
    <Cadre>
      <form onSubmit={soumettre} className="max-w-prose" noValidate>
        <div className="rounded-plaque border border-bord bg-papier p-4">
          <h2 className="font-semibold text-encre">Ce qui s’imprime sur les reçus</h2>

          <Champ
            id="nom-entreprise"
            libelle="Nom de l’entreprise"
            valeur={saisie.nom}
            maximum={LONGUEUR_NOM_MAX}
            changer={(nom) => changer({ nom })}
          />
          <Champ
            id="adresse-entreprise"
            libelle="Adresse"
            valeur={saisie.adresse}
            maximum={LONGUEUR_ADRESSE_MAX}
            changer={(adresse) => changer({ adresse })}
          />
          <Champ
            id="telephone-entreprise"
            libelle="Téléphone"
            type="tel"
            valeur={saisie.telephone}
            maximum={LONGUEUR_TELEPHONE_MAX}
            changer={(telephone) => changer({ telephone })}
          />
          <Champ
            id="telephone2-entreprise"
            libelle="Second téléphone"
            type="tel"
            facultatif
            valeur={saisie.telephone2}
            maximum={LONGUEUR_TELEPHONE_MAX}
            changer={(telephone2) => changer({ telephone2 })}
          />
          <Champ
            id="identifiant-entreprise"
            libelle="Numéro d’identification"
            facultatif
            valeur={saisie.identifiant}
            maximum={LONGUEUR_IDENTIFIANT_MAX}
            changer={(identifiant) => changer({ identifiant })}
            aide="Imprimé sur les reçus s’il est renseigné."
          />
        </div>

        <div className="mt-6 rounded-plaque border border-bord bg-papier p-4">
          <h2 className="font-semibold text-encre">Logo</h2>
          <p className="mt-1 text-sm text-encre-doux">
            Réduit à {LOGO_LARGEUR_MAX} pixels et gardé avec vos données, pour qu’un reçu s’imprime
            même sans réseau.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-plaque border border-bord bg-fond">
              {saisie.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: local, jamais distant
                <img src={saisie.logo} alt="Logo de l’entreprise" className="max-h-full max-w-full" />
              ) : (
                <ImageOff aria-hidden="true" className="size-6 text-encre-doux" />
              )}
            </span>

            <span className="flex flex-wrap gap-2">
              <label
                htmlFor="fichier-logo"
                className="inline-flex h-11 cursor-pointer items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
              >
                {logoEnCours ? "Lecture…" : saisie.logo ? "Remplacer" : "Choisir une image"}
              </label>
              <input
                id="fichier-logo"
                type="file"
                accept={LOGO_TYPES_ACCEPTES.join(",")}
                className="sr-only"
                onChange={(evenement) => {
                  const fichier = evenement.target.files?.[0];
                  evenement.target.value = "";
                  if (fichier) void choisirLogo(fichier);
                }}
              />
              {saisie.logo && (
                <button
                  type="button"
                  onClick={() => changer({ logo: null })}
                  className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
                >
                  Retirer le logo
                </button>
              )}
            </span>
          </div>
        </div>

        <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
          {erreur ?? ""}
        </p>
        {succes && (
          <p role="status" aria-live="polite" className="text-sm text-solde">
            {succes}
          </p>
        )}

        <button
          type="submit"
          className="mt-3 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Enregistrer la fiche
        </button>
      </form>
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Entreprise</h1>
      <p className="mt-2 mb-6 max-w-prose text-encre-doux">
        Ces informations forment l’en-tête de chaque reçu remis à un client.
      </p>
      {children}
    </div>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  maximum,
  changer,
  type = "text",
  facultatif = false,
  aide,
}: {
  id: string;
  libelle: string;
  valeur: string;
  maximum: number;
  changer: (valeur: string) => void;
  type?: string;
  facultatif?: boolean;
  aide?: string;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
        {facultatif && <span className="font-normal text-encre-doux"> (facultatif)</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        value={valeur}
        maxLength={maximum}
        onChange={(evenement) => changer(evenement.target.value)}
        className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
      />
      {aide && <p className="mt-1 text-sm text-encre-doux">{aide}</p>}
    </div>
  );
}
