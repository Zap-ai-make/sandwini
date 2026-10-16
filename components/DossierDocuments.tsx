"use client";

import { CircleAlert } from "lucide-react";
import {
  estEnRetard,
  etatPapier,
  LIBELLE_ETAT_PAPIER,
  papierFini,
  passeParUnPrestataire,
} from "@/lib/domain/dossier";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_DOCUMENT, type DocumentDossier, type Vente } from "@/lib/domain/vente";
import { GestesDocument } from "@/components/GestesDocument";

/**
 * Le dossier d'une vente, dans la fiche de cette vente (S11).
 *
 * Ici le dossier est une section parmi d'autres — le client, la moto, les
 * versements —, et ce qu'on y cherche est l'état des trois documents d'un
 * coup d'œil. Le parcours détaillé de chacun, avec ses étapes, se lit dans la
 * file des dossiers en attente (A7), où c'est la question de l'écran.
 *
 * Les gestes viennent de `GestesDocument` : la machine à états est la même des
 * deux côtés, et ne peut donc pas diverger.
 *
 * **L'état affiché est calculé, pas stocké** (S53, D61). Il lisait
 * `document.statut`, si bien qu'un CMC coché sur la moto restait écrit « À
 * faire » ici pendant que l'écran des dossiers disait « Au magasin ». Deux
 * lectures contradictoires du même dossier, à un clic l'une de l'autre : c'est
 * la contradiction que cette spec vient fermer, et elle se refermait mal si
 * cette fiche restait sur l'ancien mode.
 */
export function DossierDocuments({
  documents,
  vente,
  moto,
}: {
  documents: DocumentDossier[] | null;
  vente: Vente;
  moto: Moto | null;
}) {
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
    /* Nommée : le panneau d'une vente porte plusieurs listes, et « Carte grise »
       y figure à deux titres depuis S44 — le papier à obtenir, et ce qui part
       avec la moto. Sans nom, rien ne les distingue pour qui n'a pas l'écran. */
    <ul aria-label="Documents du dossier" className="divide-y divide-bord">
      {/* **Le dossier, c'est la carte grise** (16 octobre 2026). La quittance et
          le CMC se cochent sur le lot à l'arrivée, et le commanditaire a tranché
          que cela suffisait : ils ont quitté le dossier, ici comme dans la file
          et comme dans la clôture.

          Ils n'ont pas quitté la fiche pour autant — « Les papiers du client »,
          juste au-dessus, dit toujours ce que le client a emporté, et le reçu
          l'imprime. C'est un fait sur la remise, pas une étape de dossier. */}
      {documents
        .filter((document) => passeParUnPrestataire(document.type))
        .map((document) => (
          <LigneDocument key={document.id} document={document} vente={vente} moto={moto} />
        ))}
    </ul>
  );
}

function LigneDocument({
  document,
  vente,
  moto,
}: {
  document: DocumentDossier;
  vente: Vente;
  moto: Moto | null;
}) {
  const enRetard =
    document.statut === "chez_prestataire" && estEnRetard(document.disponibleLe, new Date());

  const etat = etatPapier({
    type: document.type,
    statut: document.statut,
    enMain:
      document.type === "quittance"
        ? (moto?.quittanceRecue ?? false)
        : document.type === "cmc"
          ? (moto?.cmcRecu ?? false)
          : false,
    emporte: document.type === "carte_grise" ? false : vente.emporte[document.type],
  });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-encre">{LIBELLE_DOCUMENT[document.type]}</span>
        <span className="text-sm text-encre-doux">{LIBELLE_ETAT_PAPIER[etat]}</span>
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

      {/* Les dossiers d'avant S53 portent une date de remise, et elle reste une
          information utile : elle dit QUAND, ce que l'état calculé ne dit pas.
          Le statut, lui, ne s'écrit plus. */}
      {document.statut === "remis_client" && document.remisLe && (
        <p className="mt-1 text-sm text-encre-doux">
          Remis au client le {formaterDateCourte(document.remisLe)}
        </p>
      )}

      <GestesDocument document={document} fini={papierFini(document.type, etat)} className="mt-2" />
    </li>
  );
}
