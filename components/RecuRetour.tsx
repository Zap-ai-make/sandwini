import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { montantEnLettres } from "@/lib/domain/lettres";
import { numeroLisible } from "@/lib/domain/numerotation";
import { LIBELLE_MOYEN } from "@/lib/domain/vente";
import type { RetourPiece } from "@/lib/domain/retour";
import { EntetePieces } from "@/components/EntetePieces";

/**
 * Le reçu d'un retour de pièces (S67).
 *
 * **La même facture que celle des ventes, retournée.** Mêmes classes `facture-*`
 * et mêmes primitives que `RecuPiece` ; ce qui change dit que c'est un retour :
 * le titre, la mention « Retour sur la facture … », et **REMBOURSÉ** au lieu
 * d'ACQUITTÉ. Le client reconnaît le document, et comprend qu'on lui a rendu son
 * argent.
 *
 * Le composant ne lit rien : il reçoit tout. L'impression s'appuie sur le
 * marqueur `a-imprimer` posé par son panneau.
 */
export function RecuRetour({ retour }: { retour: RetourPiece }) {
  return (
    <article
      aria-label={`Reçu de retour sur la facture n° ${numeroLisible(retour.venteNumero)}`}
      className="facture mx-auto max-w-[170mm]"
    >
      <EntetePieces />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <CasesDate date={retour.date} />

        <div className="flex flex-wrap items-center gap-4">
          <h1 className="facture-titre text-bloc leading-tight font-bold tracking-tight uppercase">
            Reçu
            <br />
            de retour
          </h1>
          <span className="facture-numero">N° {numeroLisible(retour.venteNumero)}</span>
        </div>
      </div>

      <p className="mt-4 text-corps">
        <span className="facture-intitule">Retour sur la facture :</span>{" "}
        <span className="font-code font-semibold">{numeroLisible(retour.venteNumero)}</span>
      </p>

      <table className="facture-lignes mt-5">
        <caption className="sr-only">Ce qui est repris, et à quel prix.</caption>
        <thead>
          <tr>
            <th scope="col" style={{ width: "3.5rem" }}>
              Qté
            </th>
            <th scope="col">Désignation</th>
            <th scope="col" style={{ width: "9rem" }}>
              Prix unitaire
            </th>
            <th scope="col" style={{ width: "9rem" }}>
              Montant
            </th>
          </tr>
        </thead>
        <tbody>
          {retour.lignes.map((ligne, index) => (
            <tr key={`${ligne.pieceId}-${index}`}>
              <td className="facture-quantite">{formaterNombre(ligne.quantite)}</td>
              <td>
                <span className="font-semibold">{ligne.designation}</span>
                {ligne.reference && (
                  <span className="block text-legende">
                    Réf. : <span className="font-code font-semibold">{ligne.reference}</span>
                  </span>
                )}
              </td>
              <td className="facture-nombre">{formaterNombre(ligne.prixUnitaire)}</td>
              <td className="facture-nombre">{formaterNombre(ligne.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-corps">
        <span className="facture-intitule">Remboursé par :</span>{" "}
        <span className="font-semibold">{LIBELLE_MOYEN[retour.moyenPaiement]}</span>
      </p>

      {retour.motif && (
        <p className="mt-1 text-corps">
          <span className="facture-intitule">Motif :</span>{" "}
          <span className="font-semibold">{retour.motif}</span>
        </p>
      )}

      <div className="mt-4 grid items-end gap-6 sm:grid-cols-2 print:grid-cols-2">
        <p className="facture-signature self-end">Signature du client</p>

        <dl className="space-y-2">
          <div className="facture-total facture-total-fort">
            <dt>TOTAL REMBOURSÉ</dt>
            <dd>{formaterMontant(retour.total)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-corps">
        <span className="facture-intitule">Arrêtée à la somme de :</span>{" "}
        <span className="font-semibold">{montantEnLettres(retour.total)}</span>
      </p>

      <p className="facture-acquitte mt-4">REMBOURSÉ</p>
    </article>
  );
}

/** Jour, mois, an séparés, comme sur le carnet du commanditaire. */
function CasesDate({ date }: { date: Date | null }) {
  const jour = date ? `${date.getDate()}`.padStart(2, "0") : "—";
  const mois = date ? `${date.getMonth() + 1}`.padStart(2, "0") : "—";
  const an = date ? `${date.getFullYear()}` : "—";

  return (
    <table className="facture-date">
      <caption className="sr-only">Date du retour</caption>
      <thead>
        <tr>
          <th scope="col">JOUR</th>
          <th scope="col">MOIS</th>
          <th scope="col">AN</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{jour}</td>
          <td>{mois}</td>
          <td>{an}</td>
        </tr>
      </tbody>
    </table>
  );
}
