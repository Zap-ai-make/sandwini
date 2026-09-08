"use client";

import { CircleAlert, LoaderCircle, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import {
  EtatChargement,
  EtatErreur,
  EtatErreurSaisie,
  EtatSansResultat,
} from "@/components/patrons/Etats";
import { Champ } from "@/components/patrons/Champ";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import { LIBELLE_ROLE } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { attribuerBoutique } from "@/lib/repositories/boutiques";
import { useEtatReseau } from "@/lib/reseau/etat-reseau";
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
      <TetePage retour={{ href: "/parametres", libelle: "Réglages" }} titre="Utilisateurs" />

      <FormulaireGerant boutiques={ouvertes} />

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Comptes existants
      </h2>

      {erreurLecture && <p className="mt-3 text-sm text-alerte">{erreurLecture}</p>}

      {liste === null ? (
        <EtatChargement className="mt-3">Chargement des comptes…</EtatChargement>
      ) : liste.length === 0 && !erreurLecture ? (
        <EtatSansResultat className="mt-3">
          Aucun compte pour l’instant. Le formulaire ci-dessus crée le premier gérant.
        </EtatSansResultat>
      ) : (
        <ul className="mt-3 cadre cadre-liste">
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
 * Pourquoi le rattachement d’une boutique est momentanément impossible (D64).
 *
 * Deux chemins d’écriture coexistent et ne voient pas le même monde au même
 * instant. Une **boutique** s’écrit par le SDK Firestore : elle est prise par le
 * cache, apparaît dans la liste, et part au serveur quand le réseau le permet.
 * Un **rattachement** passe par une Cloud Function, parce qu’il pose un custom
 * claim — et cette fonction lit le serveur.
 *
 * Enchaîner les deux trop vite donnait « Cette boutique n’existe pas », alors
 * qu’elle existe, à l’écran, sous les yeux de qui vient de la déclarer. Le
 * message accusait l’existence quand la vérité était l’acheminement.
 *
 * On n’offre donc pas l’action tant que la file d’écritures n’est pas vidée, et
 * on écrit pourquoi. Corriger le message aurait suffi à ne plus mentir ; refuser
 * le geste évite en plus de le faire échouer.
 *
 * Renvoie `null` quand tout est acheminé, sinon la phrase à afficher.
 */
function useAcheminementBoutiques(): string | null {
  const { etat, enAttente } = useEtatReseau();
  if (etat === "a_jour") return null;
  if (etat === "hors_ligne") {
    return "Rattacher une boutique demande le serveur, qui vérifie qu’elle existe. Sans réseau, l’opération ne peut pas aboutir : elle attendra le retour de la connexion.";
  }
  return enAttente === 1
    ? "Une saisie n’est pas encore parvenue au serveur. Le rattachement se rouvrira dès qu’elle sera partie."
    : `${enAttente} saisies ne sont pas encore parvenues au serveur. Le rattachement se rouvrira dès qu’elles seront parties.`;
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
  const acheminement = useAcheminementBoutiques();
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
        <EtatErreur message={erreur} className="mt-1" />
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
          className="mt-1 h-11 cadre px-2 text-sm text-encre"
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
        disabled={enCours || choix === actuelle || acheminement !== null}
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

      {acheminement && <p className="w-full text-sm text-encre-doux">{acheminement}</p>}

      <p className="w-full text-sm text-encre-doux">
        Changer de boutique ferme la session du gérant&nbsp;: il devra se reconnecter pour voir la
        nouvelle.
      </p>

      <EtatErreur message={erreur} className="w-full" />
    </div>
  );
}

function FormulaireGerant({ boutiques }: { boutiques: Boutique[] }) {
  const acheminement = useAcheminementBoutiques();
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
    <form onSubmit={soumettre} className="mt-6 cadre p-4" noValidate>
      <h2 className="font-semibold text-encre">Créer un gérant</h2>
      <p className="mt-1 flex gap-2 text-sm text-encre-doux">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>Cette action demande du réseau, contrairement au reste de l’application.</span>
      </p>

      <div className="colonne-formulaire mt-4 max-w-[40rem] space-y-4">
        <Champ id="nom" libelle="Nom">
          <input
            id="nom"
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="saisie"
          />
        </Champ>

        <Champ id="email-gerant" libelle="Adresse e-mail">
          <input
            id="email-gerant"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="saisie"
          />
        </Champ>

        <Champ
          id="mot-de-passe-gerant"
          libelle="Mot de passe provisoire"
          aide="Au moins 10 caractères. Il est affiché en clair pour que vous puissiez le dicter."
        >
          <input
            id="mot-de-passe-gerant"
            type="text"
            required
            minLength={10}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            aria-describedby="mot-de-passe-gerant-aide"
            className="saisie font-code"
          />
        </Champ>

        <div>
          <Champ id="boutique-gerant" libelle="Boutique">
            <select
              id="boutique-gerant"
              value={boutiqueId}
              onChange={(e) => setBoutiqueId(e.target.value)}
              className="saisie"
            >
              <option value="">Aucune pour l’instant</option>
              {boutiques.map((boutique) => (
                <option key={boutique.id} value={boutique.id}>
                  {boutique.code} · {boutique.nom}
                </option>
              ))}
            </select>
          </Champ>
          <p className="mt-1 text-corps text-encre-doux">
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

      <EtatErreurSaisie message={erreur} className="mt-3" />
      {succes && (
        <p role="status" aria-live="polite" className="text-sm text-solde">
          {succes}
        </p>
      )}

      {acheminement && boutiqueId !== "" && (
        <p className="mt-3 text-sm text-encre-doux">{acheminement}</p>
      )}

      <button
        type="submit"
        disabled={envoi || (acheminement !== null && boutiqueId !== "")}
        className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe disabled:opacity-60"
      >
        {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        {envoi ? "Création…" : "Créer le compte"}
      </button>
    </form>
  );
}
