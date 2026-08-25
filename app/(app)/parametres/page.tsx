"use client";

import { ChevronRight, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import { LIBELLE_ROLE, peut } from "@/lib/domain/roles";

export default function Reglages() {
  const session = useSession();
  const [deconnexion, setDeconnexion] = useState(false);

  if (session.statut !== "connecte") return null;
  const { utilisateur } = session;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Réglages</h1>

      <h2 className="mt-6 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Votre compte
      </h2>
      <dl className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-encre-doux">Nom</dt>
          <dd className="text-right font-medium text-encre">{utilisateur.nom}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-encre-doux">Adresse e-mail</dt>
          <dd className="truncate text-right text-encre">{utilisateur.email}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-encre-doux">Rôle</dt>
          <dd className="text-right font-medium text-encre">{LIBELLE_ROLE[utilisateur.role]}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-encre-doux">Boutique</dt>
          <dd className="text-right text-encre">
            {utilisateur.role === "responsable" ? (
              "Toutes les boutiques"
            ) : utilisateur.boutiqueId ? (
              <span className="plaque-code">{utilisateur.boutiqueId}</span>
            ) : (
              <span className="text-alerte">Aucune boutique attribuée</span>
            )}
          </dd>
        </div>
      </dl>

      {utilisateur.role === "gerant" && !utilisateur.boutiqueId && (
        <p className="mt-3 rounded-plaque border border-bord bg-papier p-4 text-sm text-encre">
          Aucune boutique ne vous est attribuée&nbsp;: vous ne verrez ni stock ni ventes tant que le
          responsable ne vous en aura pas donné une.
        </p>
      )}

      {peut(utilisateur.role, "gerer_utilisateurs") && (
        <>
          <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
            Administration
          </h2>
          <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            <li>
              <Link
                href="/parametres/utilisateurs"
                className="flex items-center gap-4 px-4 py-4 hover:bg-fond"
              >
                <Users aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-encre">Utilisateurs</span>
                  <span className="block text-sm text-encre-doux">
                    Créer un gérant, désactiver un compte
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
              </Link>
            </li>
          </ul>
          <p className="mt-3 text-sm text-encre-doux">
            Les boutiques arrivent avec la spec S3, les référentiels avec S4.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          setDeconnexion(true);
          void seDeconnecter();
        }}
        disabled={deconnexion}
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier disabled:opacity-60"
      >
        <LogOut aria-hidden="true" className="size-4" />
        {deconnexion ? "Déconnexion…" : "Se déconnecter"}
      </button>
      <p className="mt-2 max-w-prose text-sm text-encre-doux">
        La déconnexion efface les données gardées sur cet appareil. Sur un téléphone partagé, c’est
        ce qui empêche le gérant suivant de lire vos ventes.
      </p>
    </div>
  );
}
