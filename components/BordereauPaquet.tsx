import { formaterDate, formaterMontant } from "@/lib/domain/format";
import type { PaquetConfie } from "@/lib/domain/paquet";

/**
 * Le bordereau d'un paquet de cartes grises confié (24 octobre 2026).
 *
 * **La demande du commanditaire** : après avoir coché les cartes à confier,
 * pouvoir imprimer et télécharger en PDF. C'est le papier qu'on tend au
 * transitaire — la liste de ce qu'il emporte — et celui qu'on ressort le jour
 * où il affirme n'avoir reçu que six cartes sur dix.
 *
 * **Pas de librairie PDF, et c'est un choix tenu depuis les reçus** (D60) :
 * `window.print()` produit les deux. La boîte d'impression du navigateur
 * propose « Enregistrer au format PDF », sans réseau — ce qui compte dans une
 * application qui doit marcher quand la connexion tombe. Une librairie aurait
 * ajouté deux cents kilo-octets à charger pour le même résultat.
 *
 * **Deux signatures en bas, et elles ne sont pas décoratives.** Le bordereau
 * vaut remise : il dit qui a donné, qui a reçu, et combien de cartes. Sans
 * elles, c'est une liste.
 *
 * Ce bloc ne s'affiche qu'à l'impression ; le reste de l'écran porte
 * `print:hidden`. Noir sur blanc, avec ses propres filets : le papier n'hérite
 * pas des jetons de l'écran.
 */
export function BordereauPaquet({
  confie,
  nomBoutique,
  auteur,
}: {
  confie: PaquetConfie;
  nomBoutique: string;
  auteur: string;
}) {
  const filet = "1px solid #bbb";

  return (
    <div style={{ color: "#000", padding: "1rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
        Bordereau de remise — cartes grises
      </h1>
      <p style={{ marginTop: "0.25rem" }}>
        Confiées à : <strong>{confie.prestataireNom}</strong> — le{" "}
        {formaterDate(confie.deposeLe)}
      </p>
      <p style={{ marginTop: "0.25rem" }}>
        Remis par : {nomBoutique} — {auteur}
      </p>
      <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
        Cartes confiées : {confie.cartes.length}
        {confie.avance !== null && confie.avance > 0
          ? ` · Avance versée : ${formaterMontant(confie.avance)}`
          : ""}
        {confie.disponibleLe ? ` · Retour annoncé : ${formaterDate(confie.disponibleLe)}` : ""}
      </p>

      <table
        style={{
          marginTop: "0.75rem",
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.85rem",
        }}
      >
        <thead>
          <tr>
            {["#", "Repère", "Propriétaire", "Moto", "Châssis"].map((titre) => (
              <th
                key={titre}
                style={{ border: filet, padding: "0.25rem 0.4rem", textAlign: "left" }}
              >
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {confie.cartes.map((carte, rang) => (
            <tr key={carte.dossierId}>
              <td style={{ border: filet, padding: "0.25rem 0.4rem" }}>{rang + 1}</td>
              <td style={{ border: filet, padding: "0.25rem 0.4rem" }}>{carte.repere}</td>
              <td style={{ border: filet, padding: "0.25rem 0.4rem" }}>{carte.client || "—"}</td>
              <td style={{ border: filet, padding: "0.25rem 0.4rem" }}>
                {carte.dossier?.motoLibelle || "—"}
              </td>
              <td style={{ border: filet, padding: "0.25rem 0.4rem" }}>
                {carte.dossier?.numeroChassis || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "2rem", display: "flex", gap: "3rem" }}>
        <p>
          Le magasin
          <br />
          <span style={{ display: "inline-block", marginTop: "2.5rem" }}>
            ______________________
          </span>
        </p>
        <p>
          Le prestataire
          <br />
          <span style={{ display: "inline-block", marginTop: "2.5rem" }}>
            ______________________
          </span>
        </p>
      </div>
    </div>
  );
}
