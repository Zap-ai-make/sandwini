"use client";

import { LoaderCircle, ShieldAlert, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { LIBELLE_METIER } from "@/lib/domain/boutique";
import { accedeEspace, accueilDuRole, metierDeLEspace, type Espace } from "@/lib/domain/espaces";
import { peut, type Capacite } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";

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

  /* « sans_role » repart aussi vers la connexion : c’est là qu’on explique le
     refus, une seule fois, plutôt que dans chaque écran de l’application. */
  useEffect(() => {
    if (session.statut === "deconnecte" || session.statut === "sans_role") {
      router.replace("/login");
    }
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

  if (session.statut !== "connecte") {
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
          href={accueilDuRole(session.utilisateur.role)}
          className="mt-6 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-fond"
        >
          Revenir à l’accueil
        </Link>
      </section>
    );
  }

  return <>{children}</>;
}

/**
 * Barrière pour les espaces qu’une boutique ne tient pas.
 *
 * L’entreprise a des boutiques de motos et une boutique de pièces (D62) : un
 * espace n’a de sens que là où le métier existe. Comme `GardeCapacite`, elle
 * explique plutôt que de rediriger — quelqu’un qui suit un lien reçu, ou qui a
 * gardé l’écran ouvert en changeant de boutique, doit comprendre pourquoi
 * l’écran a changé sous lui.
 *
 * Elle laisse passer un périmètre sans métier connu — chargement en cours, ou
 * aucune boutique déclarée. Ce dernier cas a déjà sa réponse dans les écrans
 * eux-mêmes, qui invitent à créer la boutique ; la doubler ici cacherait la
 * seule action utile derrière un refus.
 */
export function GardeEspace({ espace, children }: { espace: Espace; children: ReactNode }) {
  const session = useSession();
  const { perimetre, chargement, peutChoisir } = usePerimetre();

  if (session.statut !== "connecte") return null;

  if (chargement) {
    return (
      <p className="flex items-center gap-3 text-encre-doux">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        Ouverture de l’espace…
      </p>
    );
  }

  const metier = metierDeLEspace(espace);
  const metiers = perimetre.metiers;
  if (
    metier === null ||
    metiers.length === 0 ||
    accedeEspace(session.utilisateur.role, metiers, espace)
  ) {
    return <>{children}</>;
  }

  const marchandise = LIBELLE_METIER[metier].toLowerCase();
  /* Trois situations, trois phrases : l’entreprise entière, une boutique que le
     responsable peut quitter, et celle du gérant qu’il ne peut pas quitter. Une
     phrase unique aurait été fausse dans deux cas sur trois. */
  const toutes = perimetre.type === "toutes";

  return (
    <section className="max-w-prose">
      <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-encre">
        <Store aria-hidden="true" className="size-6 shrink-0 text-encre-doux" />
        {toutes ? "Aucune boutique de ce métier" : "Pas dans cette boutique"}
      </h1>
      {toutes ? (
        <p className="mt-3 text-encre-doux">
          Aucune de vos boutiques ne vend de {marchandise}. Cet espace s’ouvrira dès qu’une
          boutique en déclarera le métier, dans les réglages.
        </p>
      ) : (
        <p className="mt-3 text-encre-doux">
          <span className="plaque-code">{perimetre.code}</span>
          {perimetre.nom ? ` ${perimetre.nom}` : ""} ne vend pas de {marchandise}
          {peutChoisir
            ? " : choisissez une autre boutique dans le bandeau, en haut de l’écran."
            : " : cet espace n’existe donc pas pour elle. Ce n’est pas une erreur de votre part."}
        </p>
      )}
      <Link
        href={accueilDuRole(session.utilisateur.role)}
        className="mt-6 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-fond"
      >
        Revenir à l’accueil
      </Link>
    </section>
  );
}
