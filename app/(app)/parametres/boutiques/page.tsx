"use client";

import { ArrowLeft, LoaderCircle, Pencil, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_ADRESSE_MAX,
  LONGUEUR_CODE,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  normaliserCode,
  validerBoutique,
  type Boutique,
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

const VIDE: SaisieBoutique = { nom: "", code: "", adresse: "", telephone: "" };

function Boutiques() {
  const { boutiques, chargement, erreur } = usePerimetre();

  return (
    <div>
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Boutiques</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Le code de trois lettres apparaît sur chaque reçu et ouvre les numéros de vente. Il ne peut
        plus changer une fois la boutique créée.
      </p>

      <FormulaireCreation existantes={boutiques} />

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Boutiques déclarées
      </h2>

      {erreur && (
        <p role="alert" className="mt-3 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="mt-3 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des boutiques…
        </p>
      ) : boutiques.length === 0 && !erreur ? (
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucune boutique pour l’instant. Le formulaire ci-dessus crée la première&nbsp;; tant
          qu’elle n’existe pas, aucun gérant ne peut être rattaché.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
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
            {[boutique.adresse, boutique.telephone].filter(Boolean).join(" · ") ||
              "Adresse et téléphone à compléter"}
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

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {edition && <FormulaireEdition boutique={boutique} surFin={() => setEdition(false)} />}
    </li>
  );
}

function ChampsBoutique({
  saisie,
  changer,
  prefixe,
  codeModifiable,
}: {
  saisie: SaisieBoutique;
  changer: (partie: Partial<SaisieBoutique>) => void;
  prefixe: string;
  codeModifiable: boolean;
}) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <label htmlFor={`${prefixe}-nom`} className="block text-sm font-medium text-encre">
          Nom de la boutique
        </label>
        <input
          id={`${prefixe}-nom`}
          required
          maxLength={LONGUEUR_NOM_MAX}
          value={saisie.nom}
          onChange={(e) => changer({ nom: e.target.value })}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        />
      </div>

      <div>
        <label htmlFor={`${prefixe}-code`} className="block text-sm font-medium text-encre">
          Code {!codeModifiable && <span className="font-normal text-encre-doux">(définitif)</span>}
        </label>
        <input
          id={`${prefixe}-code`}
          required
          disabled={!codeModifiable}
          maxLength={LONGUEUR_CODE}
          value={saisie.code}
          onChange={(e) => changer({ code: normaliserCode(e.target.value) })}
          className="plaque-code mt-1.5 h-12 w-24 rounded-plaque border border-bord bg-papier px-3 text-encre disabled:opacity-60"
        />
        <p className="mt-1 text-sm text-encre-doux">
          {codeModifiable
            ? "Trois lettres — PTG pour Pouytenga, par exemple. Elles ouvrent les numéros de reçus : PTG-2608-0042."
            : "Des reçus portent déjà ce code : le changer rendrait leurs numéros faux."}
        </p>
      </div>

      <div>
        <label htmlFor={`${prefixe}-adresse`} className="block text-sm font-medium text-encre">
          Adresse <span className="font-normal text-encre-doux">(imprimée sur les reçus)</span>
        </label>
        <input
          id={`${prefixe}-adresse`}
          maxLength={LONGUEUR_ADRESSE_MAX}
          value={saisie.adresse}
          onChange={(e) => changer({ adresse: e.target.value })}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        />
      </div>

      <div>
        <label htmlFor={`${prefixe}-telephone`} className="block text-sm font-medium text-encre">
          Téléphone
        </label>
        <input
          id={`${prefixe}-telephone`}
          type="tel"
          inputMode="tel"
          maxLength={LONGUEUR_TELEPHONE_MAX}
          value={saisie.telephone}
          onChange={(e) => changer({ telephone: e.target.value })}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        />
      </div>
    </div>
  );
}

function FormulaireCreation({ existantes }: { existantes: Boutique[] }) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieBoutique>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;
    setSucces(null);

    const probleme = validerBoutique(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* L’unicité du code est garantie par la base — il est l’identifiant du
       document. Le formulaire le dit avant, parce qu’un refus qui n’arrive
       qu’à la synchronisation arrive trop tard. */
    const code = normaliserCode(saisie.code);
    if (existantes.some((boutique) => boutique.id === code)) {
      setErreur(`Le code ${code} est déjà pris par une autre boutique.`);
      return;
    }

    setErreur(null);
    const nom = saisie.nom.trim();
    creerBoutique(saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurBoutique(cause)));

    setSaisie(VIDE);
    setSucces(`Boutique ${nom} créée, code ${code}.`);
  }

  return (
    <form
      onSubmit={soumettre}
      className="mt-6 rounded-plaque border border-bord bg-papier p-4"
      noValidate
    >
      <h2 className="flex items-center gap-2 font-semibold text-encre">
        <Store aria-hidden="true" className="size-5 text-encre-doux" />
        Ajouter une boutique
      </h2>

      <ChampsBoutique
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe="nouvelle"
        codeModifiable
      />

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
        className="mt-3 inline-flex h-12 items-center justify-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
      >
        Créer la boutique
      </button>
    </form>
  );
}

function FormulaireEdition({ boutique, surFin }: { boutique: Boutique; surFin: () => void }) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieBoutique>({
    nom: boutique.nom,
    code: boutique.code,
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
        codeModifiable={false}
      />

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
        {erreur ?? ""}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={surFin}
          className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
