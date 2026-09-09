"use client";

import { LoaderCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { accueilDuRole } from "@/lib/domain/espaces";

/**
 * Les états d’un écran, écrits une fois.
 *
 * `DESIGN.md` §10 les rend non négociables : vide, chargement, erreur,
 * permission refusée. Ils l’étaient déjà — chaque écran les dessinait, et c’est
 * bien le problème : vingt-sept attentes, vingt-cinq encadrés pointillés et
 * quatre copies mot pour mot du même refus de périmètre. Une formulation
 * améliorée à un endroit ne l’était nulle part ailleurs.
 *
 * **L’état hors ligne n’est pas ici, et c’est délibéré.** Dans ce produit il
 * n’appartient à aucun écran : le bandeau le porte pour l’application entière
 * (`components/BandeauEtat.tsx`), et `app/hors-ligne/page.tsx` répond au seul
 * cas où il n’y a pas d’écran du tout — une adresse jamais ouverte, donc absente
 * du cache. Un `EtatHorsLigne` par écran aurait dupliqué le bandeau juste en
 * dessous du bandeau.
 *
 * **Le tableau et le panneau latéral n’y sont pas non plus** : aucun écran n’en
 * a aujourd’hui. Les maquettes en fixent le dessin, S29 les écrira là où le
 * premier les demande (A4 et A6) — `ARCHITECTURE.md` §1, échelle 1.
 */

/**
 * L’attente.
 *
 * **Annoncée, mais pas en `role="status"`.** Sans annonce du tout, une personne
 * au lecteur d’écran n’entend aucune différence entre « ça charge » et « c’est
 * vide » — il en faut une. Mais `role="status"` est déjà pris dans ce produit :
 * c’est le canal des confirmations, le bandeau en porte un en permanence, et la
 * suite bout en bout vise `getByRole("status")` en comptant qu’il soit unique
 * (`e2e/aide.ts`). Un second aurait rendu ce repère ambigu pour la machine
 * **et** pour la personne, qui aurait entendu deux choses de nature différente
 * sur le même canal.
 *
 * `aria-live="polite"` + `aria-atomic` donne exactement la même annonce —
 * c’est la définition de `role="status"` — sans en prendre le nom.
 */
export function EtatChargement({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className={`flex items-center gap-3 text-encre-doux ${className ?? ""}`}
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      {children}
    </p>
  );
}

/**
 * L’erreur de lecture.
 *
 * Elle n’affirme pas de cause qu’on n’a pas vérifiée : le message vient de la
 * couche qui a échoué, et il dit ce qui n’a pas pu être lu, pas pourquoi
 * (`DESIGN.md` §12). `null` ne rend rien, pour que l’appelant puisse la poser
 * sans condition autour.
 */
export function EtatErreur({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={`text-corps text-alerte ${className ?? ""}`}>
      {message}
    </p>
  );
}

/**
 * L’erreur de saisie, sous le bouton d’un formulaire.
 *
 * Elle diffère de la précédente sur deux points, et les deux comptent.
 *
 * **Elle occupe sa place même vide** (`min-h-5`) : sans cela, l’apparition du
 * message pousse le bouton vers le bas au moment précis où le doigt descend
 * dessus, et la deuxième pression tombe à côté. C’est la variante « saut de
 * mise en page » de `DESIGN.md` §10, et elle se voit au comptoir, pas en
 * relecture.
 *
 * **Elle est `aria-live="assertive"`** : le message répond à un geste qu’on
 * vient de faire, il interrompt. L’erreur de lecture, elle, décrit un état de
 * l’écran et n’a rien d’urgent.
 */
export function EtatErreurSaisie({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      className={`min-h-5 text-corps text-alerte ${className ?? ""}`}
    >
      {message ?? ""}
    </p>
  );
}

/**
 * Le vide : une invitation, pas un trou (`DESIGN.md` §10).
 *
 * L’action est facultative parce qu’elle n’est pas toujours vraie — un gérant
 * qui n’a pas de boutique n’a rien à créer, et lui montrer un bouton qui le
 * mènerait à un refus serait pire que le vide.
 */
export function EtatVide({
  titre,
  children,
  action,
  className,
}: {
  titre: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`encadre-vide ${className ?? ""}`}>
      <p className="text-encre">{titre}</p>
      {children && <p className="mt-1 max-w-prose text-corps text-encre-doux">{children}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/**
 * Le filtre qui ne trouve rien — à ne pas confondre avec le vide.
 *
 * « Aucune moto » et « aucune moto *qui corresponde* » demandent deux gestes
 * opposés : faire entrer une moto, ou élargir la recherche. Les mélanger envoie
 * le gérant créer une donnée qu’il possède déjà.
 */
export function EtatSansResultat({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`encadre-vide text-encre-doux ${className ?? ""}`}>{children}</p>;
}

/**
 * Le refus, expliqué, avec une sortie.
 *
 * Rediriger en silence fait croire que l’application est cassée : quelqu’un qui
 * suit un lien reçu doit comprendre que le refus le vise, lui, et que ce n’est
 * pas une erreur de sa part. La sortie suit le rôle — le responsable rentre
 * dans sa supervision, le gérant à son accueil (D63).
 */
export function EtatRefus({
  icone = "refus",
  titre,
  children,
}: {
  icone?: "refus" | ReactNode;
  titre: string;
  children: ReactNode;
}) {
  const session = useSession();
  if (session.statut !== "connecte") return null;

  return (
    <section className="max-w-prose">
      <h1 className="flex items-center gap-3 text-ecran font-semibold tracking-tight text-encre">
        {icone === "refus" ? (
          <ShieldAlert aria-hidden="true" className="size-6 shrink-0 text-alerte" />
        ) : (
          icone
        )}
        {titre}
      </h1>
      <div className="mt-3 text-encre-doux">{children}</div>
      <Link href={accueilDuRole(session.utilisateur.role)} className="bouton bouton-neutre mt-6">
        Revenir à l’accueil
      </Link>
    </section>
  );
}

/**
 * L’écran sans périmètre : il n’y a pas de boutique à regarder.
 *
 * Deux situations sous un même écran, et elles n’ont pas la même issue. Le
 * responsable n’a encore déclaré aucune boutique : il lui manque un geste, et
 * le bouton le lui donne. Le gérant, lui, n’a reçu aucune attribution : il ne
 * peut rien y faire, et lui proposer une action serait lui promettre un pouvoir
 * qu’il n’a pas (D2).
 *
 * Cette phrase était recopiée à l’identique dans quatre écrans. Le titre change
 * — c’est le nom de l’écran qu’on n’a pas pu ouvrir — et la raison change avec
 * le métier de l’écran.
 */
export function SansBoutique({
  titre,
  sansBoutiqueDeclaree,
}: {
  titre: string;
  sansBoutiqueDeclaree: string;
}) {
  const session = useSession();
  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div className="max-w-prose">
      <h1 className="text-ecran font-semibold tracking-tight text-encre">{titre}</h1>
      <p className="mt-3 text-encre-doux">
        {estResponsable
          ? sansBoutiqueDeclaree
          : "Aucune boutique ne vous est attribuée. Vos écrans resteront vides tant que le responsable ne vous en aura pas donné une."}
      </p>
      {estResponsable && (
        <Link href="/parametres/boutiques" className="bouton bouton-principal mt-6">
          Créer une boutique
        </Link>
      )}
    </div>
  );
}
