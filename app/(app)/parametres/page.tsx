"use client";

import { LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { Hub, type Destination } from "@/components/patrons/Hub";
import { TetePage, TitreSection } from "@/components/patrons/Page";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import { ecransVisibles } from "@/lib/domain/espaces";
import { LIBELLE_ROLE } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";

export default function Reglages() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const [deconnexion, setDeconnexion] = useState(false);

  if (session.statut !== "connecte") return null;
  const { utilisateur } = session;

  const administration: Destination[] = ecransVisibles("reglages", utilisateur.role)
    .filter((ecran) => ecran.quoi)
    .map(({ href, libelle, quoi }) => ({
      href,
      libelle,
      quoi: quoi ?? "",
      icone: ICONE_ECRAN[href] ?? Settings,
    }));

  return (
    <div>
      <TetePage titre="Réglages" />

      <div className="mt-6">
        <TitreSection>Votre compte</TitreSection>
      </div>
      <dl className="cadre cadre-liste">
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
            ) : perimetre.type === "boutique" ? (
              <>
                <span className="plaque-code">{perimetre.code}</span>
                {perimetre.nom ? ` ${perimetre.nom}` : ""}
              </>
            ) : (
              <span className="text-alerte">Aucune boutique attribuée</span>
            )}
          </dd>
        </div>
      </dl>

      {utilisateur.role === "gerant" && !utilisateur.boutiqueId && (
        <p className="mt-3 cadre p-4 text-sm text-encre">
          Aucune boutique ne vous est attribuée&nbsp;: vous ne verrez ni stock ni ventes tant que le
          responsable ne vous en aura pas donné une.
        </p>
      )}

      {/* Les écrans viennent de `ECRANS_DE`, filtrés par les droits de la
          personne — la même liste et le même filtre que la colonne de gauche.
          Ce hub gardait sa propre copie, et cloisonnait les six derrière
          `gerer_utilisateurs` : un rôle qui aurait eu `gerer_referentiels` sans
          `gerer_utilisateurs` voyait donc le catalogue dans la colonne et pas
          ici. Deux listes finissent toujours par répondre deux choses. */}
      {administration.length > 0 && (
        <section className="mt-8">
          <TitreSection>Administration</TitreSection>
          <Hub destinations={administration} />
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          setDeconnexion(true);
          void seDeconnecter();
        }}
        disabled={deconnexion}
        className="mt-8 bouton bouton-neutre disabled:opacity-60"
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
