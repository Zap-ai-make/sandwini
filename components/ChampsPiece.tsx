import {
  LONGUEUR_CATEGORIE_MAX,
  LONGUEUR_DESIGNATION_MAX,
  LONGUEUR_REFERENCE_MAX,
  type SaisiePiece,
} from "@/lib/domain/piece";

/**
 * Les champs d'une référence de pièce, partagés par la création (S20) et la
 * modification (S63).
 *
 * **Un seul endroit pour la forme d'une pièce.** Quand les deux écrans
 * portaient chacun leurs fieldsets, ajouter un champ — ou corriger une aide —
 * demandait de le faire deux fois, et l'un des deux finissait oublié. Ce qui
 * diffère entre créer et corriger vit dehors : le `<form>`, le bouton, le
 * bandeau de confirmation, l'archivage. Ce qui est commun — ce qu'est une
 * pièce — vit ici.
 *
 * Volontairement sans `<form>` ni bouton : chaque écran pose le sien, parce
 * que créer enchaîne sur une pièce vierge là où corriger reste sur la même.
 */
export function ChampsPiece({
  saisie,
  changer,
  categories,
}: {
  saisie: SaisiePiece;
  changer: (partie: Partial<SaisiePiece>) => void;
  /** Les catégories déjà employées, proposées sans jamais s'imposer (D90). */
  categories: readonly string[];
}) {
  return (
    <>
      <fieldset className="cadre p-4">
        <legend className="px-1 font-semibold text-encre">La pièce</legend>

        <div className="mt-2">
          <label htmlFor="reference" className="block text-sm font-medium text-encre">
            Référence
          </label>
          <input
            id="reference"
            value={saisie.reference}
            maxLength={LONGUEUR_REFERENCE_MAX}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(evenement) => changer({ reference: evenement.target.value })}
            className="plaque-code saisie mt-1.5"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="designation" className="block text-sm font-medium text-encre">
            Désignation
          </label>
          <input
            id="designation"
            value={saisie.designation}
            maxLength={LONGUEUR_DESIGNATION_MAX}
            onChange={(evenement) => changer({ designation: evenement.target.value })}
            className="saisie mt-1.5"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="categorie" className="block text-sm font-medium text-encre">
            Catégorie <span className="font-normal text-encre-doux">(facultatif)</span>
          </label>
          <input
            id="categorie"
            list="categories-employees"
            value={saisie.categorie}
            maxLength={LONGUEUR_CATEGORIE_MAX}
            autoComplete="off"
            onChange={(evenement) => changer({ categorie: evenement.target.value })}
            className="saisie mt-1.5"
          />
          {/* Ce qui a déjà servi se propose ; rien ne s’impose, et il n’y a
              aucune liste à tenir ailleurs (D90). */}
          <datalist id="categories-employees">
            {categories.map((categorie) => (
              <option key={categorie} value={categorie} />
            ))}
          </datalist>
        </div>
      </fieldset>

      <fieldset className="mt-6 cadre p-4">
        <legend className="px-1 font-semibold text-encre">Les prix et l’alerte</legend>

        <div className="mt-2">
          <label htmlFor="prix-achat" className="block text-sm font-medium text-encre">
            Prix d’achat <span className="font-normal text-encre-doux">(facultatif)</span>
          </label>
          <input
            id="prix-achat"
            inputMode="numeric"
            value={saisie.prixAchat}
            onChange={(evenement) => changer({ prixAchat: evenement.target.value })}
            className="saisie mt-1.5"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="prix-vente" className="block text-sm font-medium text-encre">
            Prix de vente <span className="font-normal text-encre-doux">(facultatif)</span>
          </label>
          <input
            id="prix-vente"
            inputMode="numeric"
            value={saisie.prixVente}
            onChange={(evenement) => changer({ prixVente: evenement.target.value })}
            className="saisie mt-1.5"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="seuil" className="block text-sm font-medium text-encre">
            Seuil d’alerte
          </label>
          <input
            id="seuil"
            inputMode="numeric"
            value={saisie.seuilAlerte}
            onChange={(evenement) => changer({ seuilAlerte: evenement.target.value })}
            className="saisie mt-1.5"
          />
        </div>

        {/* **Le prix d’achat est ici, à l’inverse de celui d’une moto.** Il
            vivait dans une sous-collection que seul le responsable lisait
            (D2), et aucun écran ne le demandait — les deux fonctions qui
            l’écrivaient n’ont jamais été appelées. Le commanditaire a
            tranché : pour les pièces, celui qui vend fixe le coût et voit sa
            marge. Il est donc sur la pièce, lisible par qui lit la pièce. */}
      </fieldset>
    </>
  );
}
