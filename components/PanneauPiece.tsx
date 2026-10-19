"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Avis } from "@/components/patrons/Avis";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { formaterDate, formaterMontant, formaterNombre } from "@/lib/domain/format";
import {
  LIBELLE_ETAT_STOCK,
  LONGUEUR_NOTE_MAX,
  MOUVEMENTS,
  MOUVEMENT_VIDE,
  etatStock,
  quantiteDe,
  validerMouvement,
  type MouvementPiece,
  type Piece,
  type SaisieMouvement,
} from "@/lib/domain/piece";
import { enregistrerMouvement, messageErreurPiece } from "@/lib/repositories/pieces";

/**
 * Ce qu'on fait d'une pièce, une fois qu'on l'a trouvée.
 *
 * **Le geste vit à côté du chiffre.** Le stock se lit dans le catalogue ; le
 * faire bouger demandait, dans la première esquisse, un écran de plus et un
 * choix de pièce à refaire. Un arrivage de douze références se serait soldé en
 * douze allers-retours. Ici, la ligne qu'on touche porte sa quantité, son
 * histoire récente et les deux gestes qui la changent.
 *
 * **« Pas de négatif » est tenu ici**, et c'est le seul endroit où il peut
 * l'être : une règle Firestore ne sait pas additionner une collection, et une
 * transaction ne fonctionne pas hors ligne. Le refus s'accompagne donc de la
 * réparation — « faites d'abord entrer un lot » — parce qu'une règle qui
 * bloque sans offrir de suite se contourne (S20, la contradiction 2↔6).
 */
export function PanneauPiece({
  piece,
  mouvements,
  boutiqueId,
  fermer,
}: {
  piece: Piece;
  /** Les mouvements de cette pièce dans la boutique courante, déjà filtrés. */
  mouvements: readonly MouvementPiece[];
  /** Nul quand le périmètre porte plusieurs boutiques : on lit, on n'écrit pas. */
  boutiqueId: string | null;
  fermer: () => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieMouvement>({
    ...MOUVEMENT_VIDE,
    pieceId: piece.id,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const quantite = quantiteDe(mouvements);
  const etat = etatStock(quantite, piece.seuilAlerte);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !boutiqueId) return;

    const probleme = validerMouvement(saisie, quantite);
    if (probleme) {
      setErreur(probleme);
      setFait(null);
      return;
    }

    setErreur(null);
    const { enregistre } = enregistrerMouvement(saisie, boutiqueId, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurPiece(cause)));

    setFait(
      `${MOUVEMENTS[saisie.type].libelle} de ${saisie.quantite} enregistrée pour ${piece.reference}.`,
    );
    setSaisie({ ...MOUVEMENT_VIDE, pieceId: piece.id, type: saisie.type });
  }

  return (
    <section aria-label={`Pièce ${piece.reference}`} className="mt-4 cadre p-4 max-w-[44rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="plaque-code text-encre">{piece.reference}</p>
          <h2 className="mt-1 font-semibold text-encre">{piece.designation}</h2>
          {piece.categorie && <p className="text-sm text-encre-doux">{piece.categorie}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-encre">{formaterNombre(quantite)}</p>
          <p className="text-sm text-encre-doux">{LIBELLE_ETAT_STOCK[etat]}</p>
        </div>
      </div>

      {/* Un négatif n'est pas une quantité, c'est un aveu : le produit refuse
          de sortir plus que le stock, donc il ne peut venir que d'une entrée
          corrigée après des sorties. L'afficher comme un nombre ordinaire
          reviendrait à ranger « ma saisie est incohérente » avec « il n'y en a
          plus » (D82). */}
      {etat === "anomalie" && (
        <Avis ton="alerte" titre="Il manque une entrée" className="mt-3" role="status">
          Les sorties dépassent les entrées de {formaterNombre(-quantite)}. Un lot est arrivé sans
          être saisi, ou une entrée a été corrigée après coup. Faites entrer ce qui manque.
        </Avis>
      )}

      <p className="mt-3 text-sm text-encre-doux">
        Prix de vente&nbsp;:{" "}
        {piece.prixVente === null ? (
          <span className="font-medium text-encre">non fixé — cette pièce ne se vend pas encore</span>
        ) : (
          /* En police tabulaire, comme dans le tableau : le séparateur de
             milliers du français est une espace fine insécable, que la police
             de texte avale presque entièrement. « 9000 FCFA » se lisait dans le
             panneau là où la ligne affichait « 9 000 FCFA ». */
          <span className="font-code font-medium text-encre">{formaterMontant(piece.prixVente)}</span>
        )}
      </p>

      {/* **Le prix d’achat est ici, et la marge avec lui.** Pour une moto, ces
          deux nombres sont cloisonnés au responsable (D2). Le commanditaire a
          tranché l’inverse pour les pièces : celui qui vend fixe le coût et
          voit ce qu’il gagne. */}
      <p className="mt-1 text-sm text-encre-doux">
        Prix d’achat&nbsp;:{" "}
        {piece.prixAchat === null ? (
          <span className="font-medium text-encre">non saisi — la marge reste inconnue</span>
        ) : (
          <>
            <span className="font-code font-medium text-encre">
              {formaterMontant(piece.prixAchat)}
            </span>
            {piece.prixVente !== null && (
              <>
                {" — marge de "}
                <span className="font-code font-medium text-encre">
                  {formaterMontant(piece.prixVente - piece.prixAchat)}
                </span>
                {" par pièce"}
              </>
            )}
          </>
        )}
      </p>

      {boutiqueId ? (
        <form onSubmit={soumettre} className="mt-4 border-t border-bord pt-4" noValidate>
          <span id="sens-mouvement" className="block text-sm font-medium text-encre">
            Faire bouger le stock
          </span>
          {/* Un vrai groupe : deux radios cote a cote sans nom commun se
              lisent comme deux cases isolees a qui n'a pas l'ecran. */}
          <div role="radiogroup" aria-labelledby="sens-mouvement" className="mt-1.5 flex gap-2">
            {(["entree", "sortie_autre"] as const).map((type) => (
              <label
                key={type}
                className={[
                  /* `relative` garde le radio `sr-only` — donc absolu — dans
                     l'étiquette qui le représente. Sans lui, il se place contre
                     le premier ancêtre positionné et le focus fait défiler
                     l'écran pour l'y rejoindre (D102). Ici le panneau défile à
                     la main, donc le symptôme reste bénin ; dans la modale de
                     vente, le même oubli vidait l'écran. On ferme les deux. */
                  "relative",
                  "flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-plaque border font-medium",
                  saisie.type === type
                    ? "border-2 border-encre bg-papier font-semibold text-encre"
                    : "border-bord bg-papier text-encre hover:bg-fond",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="type-mouvement"
                  value={type}
                  checked={saisie.type === type}
                  onChange={() => setSaisie((actuel) => ({ ...actuel, type }))}
                  className="sr-only"
                />
                {type === "entree" ? (
                  <ArrowDownLeft aria-hidden="true" className="size-4" />
                ) : (
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                )}
                {type === "entree" ? "Entrée" : "Sortie"}
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div>
              <label htmlFor="quantite" className="block text-sm font-medium text-encre">
                Quantité
              </label>
              <input
                id="quantite"
                inputMode="numeric"
                value={saisie.quantite}
                onChange={(evenement) =>
                  setSaisie((actuel) => ({ ...actuel, quantite: evenement.target.value }))
                }
                className="saisie mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="note-mouvement" className="block text-sm font-medium text-encre">
                Note <span className="font-normal text-encre-doux">(facultatif)</span>
              </label>
              <input
                id="note-mouvement"
                maxLength={LONGUEUR_NOTE_MAX}
                placeholder={saisie.type === "entree" ? "Fournisseur, bon de livraison…" : "Casse, usage interne…"}
                value={saisie.note}
                onChange={(evenement) =>
                  setSaisie((actuel) => ({ ...actuel, note: evenement.target.value }))
                }
                className="saisie mt-1.5"
              />
            </div>
          </div>

          <EtatErreurSaisie message={erreur} className="mt-3" />
          {fait && (
            <p role="status" className="mt-3 text-corps font-medium text-encre">
              {fait}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="bouton bouton-principal">
              Enregistrer le mouvement
            </button>
            <button type="button" onClick={fermer} className="bouton bouton-neutre">
              Fermer
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 border-t border-bord pt-4 text-sm text-encre-doux">
          Un mouvement appartient à une boutique. Choisissez-en une dans le bandeau pour faire entrer
          ou sortir du stock.
        </p>
      )}

      <div className="mt-5 border-t border-bord pt-4">
        <h3 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
          Les derniers mouvements
        </h3>
        {mouvements.length === 0 ? (
          <p className="mt-2 text-sm text-encre-doux">
            Aucun mouvement ici. La quantité d’une pièce est la somme de ses mouvements&nbsp;: sans
            entrée, elle vaut zéro.
          </p>
        ) : (
          <ul className="mt-2 cadre cadre-liste">
            {mouvements.slice(0, 8).map((mouvement) => (
              <li key={mouvement.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                <span className="font-medium text-encre">{MOUVEMENTS[mouvement.type].libelle}</span>
                <span className="plaque-code text-encre">
                  {MOUVEMENTS[mouvement.type].signe > 0 ? "+" : "−"}
                  {formaterNombre(mouvement.quantite)}
                </span>
                <span className="text-sm text-encre-doux">
                  {mouvement.date ? formaterDate(mouvement.date) : "—"}
                </span>
                {mouvement.note && (
                  <span className="w-full text-sm text-encre-doux">{mouvement.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
