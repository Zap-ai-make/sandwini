"use client";

import { CircleAlert } from "lucide-react";
import { estEnRetard } from "@/lib/domain/dossier";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_STATUT_DOCUMENT,
  type DocumentDossier,
} from "@/lib/domain/vente";
import { GestesDocument } from "@/components/GestesDocument";

/**
 * Le dossier d'une vente, dans la fiche de cette vente (S11).
 *
 * Ici le dossier est une section parmi d'autres — le client, la moto, les
 * versements —, et ce qu'on y cherche est l'état des quatre documents d'un
 * coup d'œil. Le parcours détaillé de chacun, avec ses étapes, se lit dans la
 * file des dossiers en attente (A7), où c'est la question de l'écran.
 *
 * Les gestes viennent de `GestesDocument` : la machine à états est la même des
 * deux côtés, et ne peut donc pas diverger.
 */
export function DossierDocuments({ documents }: { documents: DocumentDossier[] | null }) {
  if (documents === null) {
    return <p className="px-4 py-3 text-sm text-encre-doux">Chargement du dossier…</p>;
  }
  if (documents.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-encre-doux">
        Aucun document n’est encore parvenu au serveur pour cette vente.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-bord">
      {documents.map((document) => (
        <LigneDocument key={document.id} document={document} />
      ))}
    </ul>
  );
}

function LigneDocument({ document }: { document: DocumentDossier }) {
  const enRetard =
    document.statut === "chez_prestataire" && estEnRetard(document.disponibleLe, new Date());

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-encre">{LIBELLE_DOCUMENT[document.type]}</span>
        <span className="text-sm text-encre-doux">{LIBELLE_STATUT_DOCUMENT[document.statut]}</span>
      </div>

      {document.statut === "chez_prestataire" && (
        <p className="mt-1 text-sm text-encre-doux">
          Chez {document.prestataireNom || "un prestataire"}
          {document.deposeLe ? ` depuis le ${formaterDateCourte(document.deposeLe)}` : ""}
          {document.avance !== null ? ` · avance ${formaterMontant(document.avance)}` : ""}
          {document.disponibleLe
            ? ` · annoncé le ${formaterDateCourte(document.disponibleLe)}`
            : ""}
        </p>
      )}

      {/* Jamais la couleur seule : le mot « en retard » est écrit (DESIGN.md §5). */}
      {enRetard && (
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-alerte">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          En retard sur la date annoncée
        </p>
      )}

      {document.statut === "remis_client" && document.remisLe && (
        <p className="mt-1 text-sm text-encre-doux">
          Remis au client le {formaterDateCourte(document.remisLe)}
        </p>
      )}

      <GestesDocument document={document} className="mt-2" />
    </li>
  );
}
