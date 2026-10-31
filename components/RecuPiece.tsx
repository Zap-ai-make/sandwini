import { formaterTelephone, nomDuClient, type Client } from "@/lib/domain/client";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { montantEnLettres } from "@/lib/domain/lettres";
import { numeroLisible } from "@/lib/domain/numerotation";
import type { VentePiece } from "@/lib/domain/vente-piece";
import { EntetePieces } from "@/components/EntetePieces";

/**
 * Le reçu d'une vente de pièces (S64), étendu à plusieurs lignes.
 *
 * **La même facture que celle des motos, parce que c'est celle du
 * commanditaire** (cf. `components/Recu.tsx`) : cadre, cases de date, tableau
 * Qté / Désignation / Prix unitaire / Montant, totaux, somme en toutes lettres,
 * mention ACQUITTÉ. Son client reconnaît ce document ; un reçu mieux dessiné
 * mais étranger le ferait douter. Ce qui change avec le reçu des motos :
 *
 * - **plusieurs lignes**, une par article du panier, et non une moto unique ;
 * - **toujours ACQUITTÉ**, sans « reste à payer » : une vente de pièces est
 *   payée comptant et repart avec le client (il n'y a ni crédit ni tranches sur
 *   les pièces) ;
 * - **pas de « ce qui part »** (plaque, carte grise) : ce sont les papiers
 *   d'une moto, pas d'une bougie.
 *
 * - **l'en-tête de Fatas** (28 octobre 2026), et non celui de Sandwidi : la
 *   boutique de pièces vend sous ce nom (`EntetePieces`).
 *
 * C'est un composant **à part** de `Recu`, et non une généralisation : le reçu
 * des motos est tenu par une autre partie du travail, et porte des notions —
 * versements, reste dû, papiers — qui n'ont pas de sens ici. Les mêmes classes
 * `facture-*` et `montantEnLettres` sont réutilisés : c'est la forme qui est
 * commune, pas le contenu.
 *
 * Le composant ne lit rien et n'écoute rien : il reçoit tout. L'impression
 * s'appuie, comme ailleurs, sur le marqueur `a-imprimer` posé par son panneau.
 */
export function RecuPiece({
  vente,
  client,
  nomLibre = "",
}: {
  vente: VentePiece;
  client: Client | null;
  /**
   * Le nom tapé au comptoir, quand la vente ne renvoie à aucune fiche (le cas
   * courant depuis que le client est un simple nom libre). Les autres traits —
   * prénom, téléphone, localité — restent vides : un nom libre n'en porte pas.
   */
  nomLibre?: string;
}) {
  return (
    <article
      aria-label={`Reçu de vente n° ${numeroLisible(vente.numero)}`}
      className="facture mx-auto max-w-[170mm]"
    >
      <EntetePieces />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <CasesDate date={vente.date} />

        <div className="flex flex-wrap items-center gap-4">
          <h1 className="facture-titre text-bloc leading-tight font-bold tracking-tight uppercase">
            Facture
            <br />
            de vente
          </h1>
          <span className="facture-numero">N° {numeroLisible(vente.numero)}</span>
        </div>
      </div>

      {/* Le client est facultatif au comptoir : les traits restent, et ils
          disent « Comptoir » plutôt qu'un vide qui ferait croire à un oubli. */}
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
        <p className="facture-champ">
          <span>Nom :</span>
          <span>{client?.nom || (client ? nomDuClient(client) : nomLibre.trim() || "Comptoir")}</span>
        </p>
        <p className="facture-champ">
          <span>Prénom :</span>
          <span>{client?.prenom || "—"}</span>
        </p>
        <p className="facture-champ">
          <span>Téléphone :</span>
          <span>{client ? formaterTelephone(client.telephone) : "—"}</span>
        </p>
        <p className="facture-champ">
          <span>Localité :</span>
          <span>{client?.adresse || "—"}</span>
        </p>
      </div>

      <table className="facture-lignes mt-5">
        <caption className="sr-only">Ce qui est vendu, et à quel prix.</caption>
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
          {/* Une rangée par ligne du panier, et rien de plus : pas de rangées
              vides, pour la même raison que le reçu des motos. */}
          {vente.lignes.map((ligne, index) => (
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

      <div className="mt-4 grid items-end gap-6 sm:grid-cols-2 print:grid-cols-2">
        <p className="facture-signature self-end">Signature du client</p>

        <dl className="space-y-2">
          <div className="facture-total facture-total-fort">
            <dt>TOTAL</dt>
            <dd>{formaterMontant(vente.total)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-corps">
        <span className="facture-intitule">Arrêtée à la somme de :</span>{" "}
        <span className="font-semibold">{montantEnLettres(vente.total)}</span>
      </p>

      {/* **ACQUITTÉ, toujours.** Une vente de pièces est payée comptant : il n'y
          a pas de « reste à payer » à porter, et le client repart avec sa pièce
          et sa preuve de paiement. */}
      <p className="facture-acquitte mt-4">ACQUITTÉ</p>
    </article>
  );
}

/**
 * Les trois cases de la date, comme sur le carnet du commanditaire — jour, mois
 * et an séparés, complétés d'un zéro pour que les colonnes s'alignent d'une
 * facture à l'autre. Repris à l'identique du reçu des motos.
 */
function CasesDate({ date }: { date: Date | null }) {
  const jour = date ? `${date.getDate()}`.padStart(2, "0") : "—";
  const mois = date ? `${date.getMonth() + 1}`.padStart(2, "0") : "—";
  const an = date ? `${date.getFullYear()}` : "—";

  return (
    <table className="facture-date">
      <caption className="sr-only">Date de la pièce</caption>
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
