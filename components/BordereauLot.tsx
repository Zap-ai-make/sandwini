import { completudeCmc, ecoulement, type Arrivage } from "@/lib/domain/arrivage";
import { formaterDate } from "@/lib/domain/format";
import { LIBELLE_STATUT, type Moto } from "@/lib/domain/moto";

/**
 * Le bordereau imprimable d'un lot (S43).
 *
 * Pas un service, pas une librairie : `window.print()` produit le PDF, comme
 * pour les reçus (D60) — la boîte d'impression du navigateur propose
 * « Enregistrer au format PDF », sans réseau. Ce bloc ne s'affiche qu'à
 * l'impression ; le reste de l'écran porte `print:hidden`. Noir sur blanc, avec
 * ses propres filets : le papier n'hérite pas des jetons de l'écran.
 */
export function BordereauLot({
  arrivage,
  motos,
  nomFournisseur,
  nomMarque,
  nomModele,
}: {
  arrivage: Arrivage;
  motos: Moto[];
  nomFournisseur: string;
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
}) {
  const compte = ecoulement(motos, arrivage.id);
  const cmc = completudeCmc(motos, arrivage.id);
  const filet = "1px solid #bbb";

  return (
    <div style={{ color: "#000", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Bordereau d’arrivage — {arrivage.nom}</h1>
      <p style={{ marginTop: "0.25rem" }}>
        Expéditeur : {nomFournisseur}
        {arrivage.date ? ` — Arrivée ${formaterDate(arrivage.date)}` : ""}
      </p>
      {arrivage.description && <p style={{ marginTop: "0.25rem" }}>{arrivage.description}</p>}
      <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
        Motos : {compte.total} · En stock : {compte.restant} · Vendues : {compte.vendues} · CMC
        manquants : {cmc.manquants}
      </p>

      <table style={{ marginTop: "0.75rem", width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            {["#", "N° de cadre", "Marque", "Statut", "CMC"].map((titre) => (
              <th
                key={titre}
                style={{ textAlign: "left", borderBottom: "2px solid #000", padding: "0.25rem 0.4rem" }}
              >
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {motos.map((moto, index) => (
            <tr key={moto.id}>
              <td style={{ borderBottom: filet, padding: "0.25rem 0.4rem" }}>{index + 1}</td>
              <td style={{ borderBottom: filet, padding: "0.25rem 0.4rem", fontFamily: "monospace" }}>
                {moto.numeroChassis}
              </td>
              <td style={{ borderBottom: filet, padding: "0.25rem 0.4rem" }}>
                {nomMarque(moto.marqueId)}
                {nomModele(moto.modeleId) ? ` ${nomModele(moto.modeleId)}` : ""}
              </td>
              <td style={{ borderBottom: filet, padding: "0.25rem 0.4rem" }}>
                {LIBELLE_STATUT[moto.statut]}
              </td>
              <td style={{ borderBottom: filet, padding: "0.25rem 0.4rem" }}>
                {moto.cmcRecu ? "Reçu" : "Manquant"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
