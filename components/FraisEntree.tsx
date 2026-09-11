"use client";

import { Plus, X } from "lucide-react";
import { LONGUEUR_NOTE_MAX, type SaisieCout } from "@/lib/domain/moto";

/**
 * Les lignes de frais d'entrée d'une moto.
 *
 * Sorti du formulaire d'entrée en stock par S39, parce qu'il a désormais deux
 * appelants : ce formulaire — pour le seul responsable — et l'écran de
 * supervision qui pose un coût après coup. Les frais font partie du coût ; ils
 * suivent donc le coût partout où il va.
 */
export function FraisEntree({
  lignes,
  changer,
  types,
}: {
  lignes: SaisieCout["fraisEntree"];
  changer: (lignes: SaisieCout["fraisEntree"]) => void;
  types: { id: string; nom: string }[];
}) {
  return (
    <div className="mt-4">
      <span className="block text-sm font-medium text-encre">Frais d’entrée</span>

      {types.length === 0 ? (
        <p className="mt-1.5 text-sm text-encre-doux">
          Aucun type de frais déclaré. Le prix d’achat suffit ; les types se déclarent dans les
          réglages.
        </p>
      ) : (
        <>
          {lignes.map((ligne, index) => (
            <div key={index} className="mt-2 rounded-plaque border border-bord bg-fond p-3">
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`frais-type-${index}`}>
                  Type du frais {index + 1}
                </label>
                <select
                  id={`frais-type-${index}`}
                  value={ligne.typeFraisId}
                  onChange={(evenement) =>
                    changer(
                      lignes.map((autre, position) =>
                        position === index
                          ? { ...autre, typeFraisId: evenement.target.value }
                          : autre,
                      ),
                    )
                  }
                  className="h-11 min-w-0 flex-1 cadre px-2 text-sm text-encre"
                >
                  <option value="">Type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.nom}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor={`frais-montant-${index}`}>
                  Montant du frais {index + 1}
                </label>
                <input
                  id={`frais-montant-${index}`}
                  inputMode="numeric"
                  placeholder="Montant"
                  value={ligne.montant}
                  onChange={(evenement) =>
                    changer(
                      lignes.map((autre, position) =>
                        position === index ? { ...autre, montant: evenement.target.value } : autre,
                      ),
                    )
                  }
                  className="h-11 w-32 cadre px-2 text-sm text-encre"
                />

                <button
                  type="button"
                  onClick={() => changer(lignes.filter((_, position) => position !== index))}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-plaque border border-bord text-encre hover:bg-papier"
                >
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">Retirer le frais {index + 1}</span>
                </button>
              </div>

              <label className="sr-only" htmlFor={`frais-note-${index}`}>
                Note du frais {index + 1}
              </label>
              <input
                id={`frais-note-${index}`}
                placeholder="Note (facultatif)"
                maxLength={LONGUEUR_NOTE_MAX}
                value={ligne.note}
                onChange={(evenement) =>
                  changer(
                    lignes.map((autre, position) =>
                      position === index ? { ...autre, note: evenement.target.value } : autre,
                    ),
                  )
                }
                className="saisie mt-2 h-11 px-2 text-corps"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => changer([...lignes, { typeFraisId: "", montant: "", note: "" }])}
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter un frais
          </button>
        </>
      )}
    </div>
  );
}
