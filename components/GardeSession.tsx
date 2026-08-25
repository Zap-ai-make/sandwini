"use client";

import { LoaderCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { peut, type Capacite } from "@/lib/domain/roles";

/**
 * Garde de navigation.
 *
 * Elle décide de ce qu’on **affiche**, pas de ce qui est **permis**. La
 * permission se joue dans les règles Firestore et dans les Cloud Functions, qui
 * revérifient le rôle côté serveur. Un gérant qui contournerait cet écran ne
 * gagnerait rien : la base refuserait ses lectures et ses appels
 * (cf. `DECISIONS.md` D27).
 *
 * Son travail est d’éviter à quelqu’un de se retrouver devant un écran vide
 * sans comprendre pourquoi.
 */
export function GardeSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.statut === "deconnecte") router.replace("/login");
  }, [session.statut, router]);

  if (session.statut === "chargement") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <p className="flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          Ouverture de votre session…
        </p>
      </div>
    );
  }

  if (session.statut === "deconnecte") {
    // Le temps que la redirection parte. Pas d’écran vide entre les deux.
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <p className="text-encre-doux">Redirection vers la connexion…</p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Barrière pour les écrans réservés au responsable.
 *
 * Elle explique le refus au lieu de rediriger en silence : un gérant qui suit
 * un lien reçu doit comprendre pourquoi il n’y a pas accès, sinon il pense que
 * l’application est cassée (DESIGN.md §10, état « permission refusée »).
 */
export function GardeCapacite({
  capacite,
  children,
}: {
  capacite: Capacite;
  children: ReactNode;
}) {
  const session = useSession();
  if (session.statut !== "connecte") return null;

  if (!peut(session.utilisateur.role, capacite)) {
    return (
      <section className="max-w-prose">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-encre">
          <ShieldAlert aria-hidden="true" className="size-6 shrink-0 text-alerte" />
          Réservé au responsable
        </h1>
        <p className="mt-3 text-encre-doux">
          Cet écran gère les comptes et les paramètres de l’entreprise. Votre compte de gérant n’y a
          pas accès&nbsp;; ce n’est pas une erreur de votre part.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-fond"
        >
          Revenir à l’accueil
        </Link>
      </section>
    );
  }

  return <>{children}</>;
}
