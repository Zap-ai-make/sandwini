"use client";

import { Store } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * Ce qu’il manque avant de pouvoir travailler.
 *
 * Tant qu’aucune boutique n’existe, rien de ce que l’application sait faire
 * n’a de destination : une moto entre en stock quelque part, une vente est
 * enregistrée quelque part. L’accueil le dit une fois, à l’endroit où on
 * arrive, plutôt que de laisser découvrir le blocage écran par écran
 * (DESIGN.md §10 — un état vide est une invitation).
 *
 * Le message diffère selon qui regarde, parce que l’action possible diffère :
 * le responsable peut créer la boutique, le gérant ne peut que la demander.
 */
export function InvitationBoutique() {
  const session = useSession();
  const { perimetre, chargement } = usePerimetre();

  if (session.statut !== "connecte" || chargement) return null;
  if (perimetre.type !== "aucune") return null;

  const estResponsable = session.utilisateur.role === "responsable";

  return (
    <section className="mt-6 rounded-plaque border border-plaque-bord bg-papier p-4">
      <h2 className="flex items-center gap-2 font-semibold text-encre">
        <Store aria-hidden="true" className="size-5 text-encre-doux" />
        {estResponsable ? "Déclarez votre première boutique" : "Aucune boutique ne vous est attribuée"}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-encre-doux">
        {estResponsable
          ? "Une moto entre en stock quelque part et une vente s’enregistre quelque part : tant qu’aucune boutique n’existe, les écrans de saisie n’ont pas de destination. Son code de trois lettres ouvrira aussi les numéros de reçus."
          : "Vos écrans resteront vides tant que le responsable ne vous aura pas rattaché à une boutique. Ce n’est pas une panne, et ce n’est pas de votre fait."}
      </p>
      {estResponsable && (
        <Link
          href="/parametres/boutiques"
          className="mt-4 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Créer une boutique
        </Link>
      )}
    </section>
  );
}
