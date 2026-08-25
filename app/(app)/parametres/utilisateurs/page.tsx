"use client";

import { ArrowLeft, CircleAlert, LoaderCircle, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import { LIBELLE_ROLE } from "@/lib/domain/roles";
import {
  changerActivation,
  creerGerant,
  ecouterUtilisateurs,
  messageErreurUtilisateur,
  type FicheUtilisateur,
} from "@/lib/repositories/utilisateurs";

export default function PageUtilisateurs() {
  return (
    <GardeCapacite capacite="gerer_utilisateurs">
      <Utilisateurs />
    </GardeCapacite>
  );
}

function Utilisateurs() {
  const session = useSession();
  const [liste, setListe] = useState<FicheUtilisateur[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);

  useEffect(
    () =>
      ecouterUtilisateurs(setListe, () => {
        setListe([]);
        setErreurLecture("La liste des comptes n’a pas pu être chargée.");
      }),
    [],
  );

  const moi = session.statut === "connecte" ? session.utilisateur.uid : "";

  return (
    <div>
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Utilisateurs</h1>

      <FormulaireGerant />

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Comptes existants
      </h2>

      {erreurLecture && <p className="mt-3 text-sm text-alerte">{erreurLecture}</p>}

      {liste === null ? (
        <p className="mt-3 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des comptes…
        </p>
      ) : liste.length === 0 && !erreurLecture ? (
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucun compte pour l’instant. Le formulaire ci-dessus crée le premier gérant.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {liste.map((utilisateur) => (
            <LigneUtilisateur key={utilisateur.uid} utilisateur={utilisateur} estMoi={utilisateur.uid === moi} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LigneUtilisateur({
  utilisateur,
  estMoi,
}: {
  utilisateur: FicheUtilisateur;
  estMoi: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer() {
    setErreur(null);
    setEnCours(true);
    try {
      await changerActivation(utilisateur.uid, !utilisateur.actif);
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause));
    } finally {
      setEnCours(false);
    }
  }

  const desactivable = !estMoi && utilisateur.role !== "responsable";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium text-encre">{utilisateur.nom}</span>
          {/* L’état ne passe jamais par la seule couleur (DESIGN.md §5). */}
          {!utilisateur.actif && (
            <span className="rounded-plaque border border-bord px-1.5 py-0.5 text-xs font-medium text-alerte">
              Désactivé
            </span>
          )}
        </span>
        <span className="block truncate text-sm text-encre-doux">{utilisateur.email}</span>
        <span className="block text-sm text-encre-doux">
          {LIBELLE_ROLE[utilisateur.role]}
          {utilisateur.role === "gerant" &&
            (utilisateur.boutiqueId ? (
              <> · <span className="plaque-code">{utilisateur.boutiqueId}</span></>
            ) : (
              <> · sans boutique</>
            ))}
        </span>
        {erreur && <span className="mt-1 block text-sm text-alerte">{erreur}</span>}
      </span>

      {desactivable && (
        <button
          type="button"
          onClick={basculer}
          disabled={enCours}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond disabled:opacity-60"
        >
          {enCours ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : utilisateur.actif ? (
            <UserX aria-hidden="true" className="size-4" />
          ) : (
            <UserCheck aria-hidden="true" className="size-4" />
          )}
          {utilisateur.actif ? "Désactiver" : "Réactiver"}
        </button>
      )}
    </li>
  );
}

function FormulaireGerant() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [boutiqueId, setBoutiqueId] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    try {
      await creerGerant({
        nom: nom.trim(),
        email: email.trim().toLowerCase(),
        motDePasse,
        boutiqueId: boutiqueId.trim() || null,
      });
      setSucces(`Compte créé pour ${nom.trim()}. Communiquez-lui son mot de passe de vive voix.`);
      setNom("");
      setEmail("");
      setMotDePasse("");
      setBoutiqueId("");
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="mt-6 rounded-plaque border border-bord bg-papier p-4" noValidate>
      <h2 className="font-semibold text-encre">Créer un gérant</h2>
      <p className="mt-1 flex gap-2 text-sm text-encre-doux">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>Cette action demande du réseau, contrairement au reste de l’application.</span>
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="nom" className="block text-sm font-medium text-encre">
            Nom
          </label>
          <input
            id="nom"
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
          />
        </div>
        <div>
          <label htmlFor="email-gerant" className="block text-sm font-medium text-encre">
            Adresse e-mail
          </label>
          <input
            id="email-gerant"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
          />
        </div>
        <div>
          <label htmlFor="mot-de-passe-gerant" className="block text-sm font-medium text-encre">
            Mot de passe provisoire
          </label>
          <input
            id="mot-de-passe-gerant"
            type="text"
            required
            minLength={10}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 font-code text-encre"
          />
          <p className="mt-1 text-sm text-encre-doux">
            Au moins 10 caractères. Il est affiché en clair pour que vous puissiez le dicter.
          </p>
        </div>
        <div>
          <label htmlFor="boutique-gerant" className="block text-sm font-medium text-encre">
            Boutique <span className="font-normal text-encre-doux">(facultatif pour l’instant)</span>
          </label>
          <input
            id="boutique-gerant"
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
          />
          <p className="mt-1 text-sm text-encre-doux">
            Les boutiques se choisiront dans une liste à partir de la spec S3.
          </p>
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
        disabled={envoi}
        className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe disabled:opacity-60"
      >
        {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        {envoi ? "Création…" : "Créer le compte"}
      </button>
    </form>
  );
}
