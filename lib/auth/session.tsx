"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authentification, configurationPresente, db } from "@/lib/firebase/client";
import { estRole, type Role } from "@/lib/domain/roles";
import { oublierPerimetres } from "@/lib/perimetre/memoire";

export type Utilisateur = {
  uid: string;
  nom: string;
  email: string;
  role: Role;
  boutiqueId: string | null;
};

export type Session =
  | { statut: "chargement" }
  | { statut: "deconnecte" }
  /* Authentifié, mais sans rôle utilisable dans le jeton. Ce n’est pas
     « déconnecté » : le mot de passe était bon, et confondre les deux produit
     l’écran le plus décourageant qui soit — un formulaire qui accepte la saisie
     et ne fait rien. L’état existe pour être expliqué (DESIGN.md §10). */
  | { statut: "sans_role" }
  | { statut: "connecte"; utilisateur: Utilisateur };

const Contexte = createContext<Session>({ statut: "chargement" });

/**
 * Lit le rôle depuis le jeton, jamais depuis Firestore.
 *
 * `getIdTokenResult(false)` se contente du jeton en cache : c’est ce qui permet
 * à un gérant d’ouvrir l’application le matin sans réseau et de travailler
 * quand même. Le jeton fait foi côté client pour l’affichage ; côté données,
 * ce sont les règles Firestore qui tranchent, et elles lisent le même claim.
 */
async function lireUtilisateur(compte: User): Promise<Utilisateur | null> {
  const jeton = await compte.getIdTokenResult(false);
  const role = jeton.claims.role;
  if (!estRole(role)) return null;

  const boutiqueId = jeton.claims.boutiqueId;
  return {
    uid: compte.uid,
    nom: compte.displayName ?? compte.email ?? "",
    email: compte.email ?? "",
    role,
    boutiqueId: typeof boutiqueId === "string" && boutiqueId ? boutiqueId : null,
  };
}

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(
    configurationPresente ? { statut: "chargement" } : { statut: "deconnecte" },
  );

  useEffect(() => {
    if (!configurationPresente) return;
    return onAuthStateChanged(authentification(), async (compte) => {
      if (!compte) {
        setSession({ statut: "deconnecte" });
        return;
      }
      const utilisateur = await lireUtilisateur(compte).catch(() => null);
      /* Un compte sans rôle est un compte à moitié créé — la fonction serveur
         a échoué entre la création et la pose du claim, ou le compte a été fait
         à la main dans la console Firebase, qui ne sait pas poser de claim. On
         refuse d’ouvrir l’application plutôt que d’afficher une interface sans
         droits, mais on le dit : la connexion, elle, a réussi. */
      setSession(utilisateur ? { statut: "connecte", utilisateur } : { statut: "sans_role" });
    });
  }, []);

  return <Contexte.Provider value={session}>{children}</Contexte.Provider>;
}

export function useSession(): Session {
  return useContext(Contexte);
}

/**
 * Déconnexion.
 *
 * Vider le cache Firestore n’est pas du zèle : il contient les données d’une
 * boutique, et l’appareil du comptoir est partagé. Sans cela, le gérant suivant
 * lirait le stock et les ventes du précédent en ouvrant l’application hors
 * ligne. La séquence imposée par le SDK est : arrêter Firestore, vider, puis
 * recharger la page — l’instance terminée n’est plus utilisable. Le périmètre
 * mémorisé part avec, pour la même raison : il dit où travaillait le compte
 * précédent.
 */
export async function seDeconnecter(): Promise<void> {
  await signOut(authentification());
  oublierPerimetres();
  try {
    await terminate(db());
    await clearIndexedDbPersistence(db());
  } catch {
    // Un autre onglet peut tenir le cache ouvert. La déconnexion reste
    // effective ; le cache sera vidé au prochain démarrage isolé.
  }
  /* Rechargement complet, et non une navigation du routeur : l’instance
     Firestore vient d’être terminée pour vider son cache, elle n’est plus
     utilisable. Seul un redémarrage de l’application la recrée proprement. */
  window.location.replace(new URL("/login", window.location.origin).toString());
}
