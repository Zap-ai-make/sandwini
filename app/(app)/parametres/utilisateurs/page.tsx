"use client";

import { ArrowLeft, CircleAlert, LoaderCircle, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import { LIBELLE_ROLE } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { attribuerBoutique } from "@/lib/repositories/boutiques";
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
  const { boutiques } = usePerimetre();
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
  const ouvertes = boutiques.filter((boutique) => boutique.actif);

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

      <FormulaireGerant boutiques={ouvertes} />

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
            <LigneUtilisateur
              key={utilisateur.uid}
              utilisateur={utilisateur}
              estMoi={utilisateur.uid === moi}
              boutiques={ouvertes}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LigneUtilisateur({
  utilisateur,
  estMoi,
  boutiques,
}: {
  utilisateur: FicheUtilisateur;
  estMoi: boolean;
  boutiques: Boutique[];
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
  const boutique = boutiques.find((candidate) => candidate.id === utilisateur.boutiqueId);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                <>
                  {" · "}
                  <span className="plaque-code">{utilisateur.boutiqueId}</span>
                  {boutique ? ` ${boutique.nom}` : ""}
                </>
              ) : (
                <span className="text-alerte"> · aucune boutique</span>
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
      </div>

      {utilisateur.role === "gerant" && (
        <Rattachement utilisateur={utilisateur} boutiques={boutiques} />
      )}
    </li>
  );
}

/**
 * Rattacher un gérant à une boutique.
 *
 * Ce n’est pas un réglage d’affichage : le périmètre vit dans le jeton du
 * gérant, et le déplacer le déconnecte. On le dit avant, pas après — le
 * responsable choisit souvent pendant que le gérant est en train de vendre.
 *
 * Le sélecteur reste replié tant qu’on ne le demande pas. Déplié sur chaque
 * ligne, il transformait la liste des comptes en mur de listes déroulantes,
 * alors que la question « qui travaille où » se lit déjà dans la ligne
 * elle-même (DESIGN.md §14 : retirer un accessoire).
 */
function Rattachement({
  utilisateur,
  boutiques,
}: {
  utilisateur: FicheUtilisateur;
  boutiques: Boutique[];
}) {
  const actuelle = utilisateur.boutiqueId ?? "";
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(actuelle);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const idSelect = `boutique-${utilisateur.uid}`;

  async function enregistrer() {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    try {
      await attribuerBoutique(utilisateur.uid, choix || null);
      setSucces(
        choix
          ? `Rattaché à ${choix}. ${utilisateur.nom} devra se reconnecter.`
          : `Détaché de sa boutique. ${utilisateur.nom} devra se reconnecter.`,
      );
      setOuvert(false);
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause));
      setChoix(actuelle);
    } finally {
      setEnCours(false);
    }
  }

  if (boutiques.length === 0) {
    return (
      <p className="mt-2 text-sm text-encre-doux">
        Aucune boutique ouverte&nbsp;:{" "}
        <Link href="/parametres/boutiques" className="underline hover:text-encre">
          déclarez-en une
        </Link>{" "}
        pour pouvoir rattacher ce compte.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={() => {
            setChoix(actuelle);
            setSucces(null);
            setOuvert(true);
          }}
          className="text-sm text-encre-doux underline hover:text-encre"
        >
          {actuelle ? "Changer de boutique" : "Rattacher à une boutique"}
        </button>
        {succes && (
          <p role="status" className="mt-1 text-sm text-solde">
            {succes}
          </p>
        )}
        {erreur && (
          <p role="alert" className="mt-1 text-sm text-alerte">
            {erreur}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-plaque border border-bord bg-fond p-3">
      <span>
        <label htmlFor={idSelect} className="block text-sm text-encre-doux">
          Boutique
        </label>
        <select
          id={idSelect}
          value={choix}
          onChange={(evenement) => setChoix(evenement.target.value)}
          className="mt-1 h-11 rounded-plaque border border-bord bg-papier px-2 text-sm text-encre"
        >
          <option value="">Aucune</option>
          {boutiques.map((boutique) => (
            <option key={boutique.id} value={boutique.id}>
              {boutique.code} · {boutique.nom}
            </option>
          ))}
        </select>
      </span>

      <button
        type="button"
        onClick={enregistrer}
        disabled={enCours || choix === actuelle}
        className="inline-flex h-11 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-3 text-sm font-semibold text-encre-fixe disabled:opacity-60"
      >
        {enCours && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        {enCours ? "Enregistrement…" : "Rattacher"}
      </button>

      <button
        type="button"
        onClick={() => setOuvert(false)}
        disabled={enCours}
        className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-papier disabled:opacity-60"
      >
        Annuler
      </button>

      <p className="w-full text-sm text-encre-doux">
        Changer de boutique ferme la session du gérant&nbsp;: il devra se reconnecter pour voir la
        nouvelle.
      </p>

      {erreur && (
        <p role="alert" className="w-full text-sm text-alerte">
          {erreur}
        </p>
      )}
    </div>
  );
}

function FormulaireGerant({ boutiques }: { boutiques: Boutique[] }) {
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
        boutiqueId: boutiqueId || null,
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
    <form
      onSubmit={soumettre}
      className="mt-6 rounded-plaque border border-bord bg-papier p-4"
      noValidate
    >
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
            Boutique
          </label>
          <select
            id="boutique-gerant"
            value={boutiqueId}
            onChange={(e) => setBoutiqueId(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
          >
            <option value="">Aucune pour l’instant</option>
            {boutiques.map((boutique) => (
              <option key={boutique.id} value={boutique.id}>
                {boutique.code} · {boutique.nom}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-encre-doux">
            {boutiques.length === 0 ? (
              <>
                Aucune boutique ouverte —{" "}
                <Link href="/parametres/boutiques" className="underline hover:text-encre">
                  déclarez-en une
                </Link>{" "}
                d’abord. Le compte peut aussi être créé maintenant et rattaché plus tard.
              </>
            ) : (
              "Le gérant ne verra que le stock, les ventes et la caisse de cette boutique."
            )}
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
