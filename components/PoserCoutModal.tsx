"use client";

import { Wallet } from "lucide-react";
import { useState } from "react";
import { FraisEntree } from "@/components/FraisEntree";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import {
  COUT_VIDE,
  construireCout,
  coutTotalSaisie,
  validerCoutPose,
  type CoutMoto,
  type Moto,
  type SaisieCout,
} from "@/lib/domain/moto";
import type { Catalogue } from "@/lib/repositories/catalogue";
import { messageErreurMoto, poserCoutMoto } from "@/lib/repositories/motos";

const FORMULAIRE = "poser-cout";

/**
 * Poser ou corriger le prix d'achat d'une moto, depuis sa fiche (S54).
 *
 * **Pourquoi ce formulaire a déménagé.** Il vivait sur `/supervision/couts`,
 * un écran-liste dont le commanditaire a dit qu'il ne lui servait pas. Mais la
 * fiche d'une moto ne faisait qu'**afficher** le coût : sans cet écran, plus
 * aucune moto n'aurait pu recevoir son prix, et les marges seraient restées
 * muettes pour toujours. Le geste descend donc là où vit la moto — c'est aussi
 * là qu'on se pose la question.
 *
 * **Une modale, pas un panneau en ligne.** Les frais d'entrée s'ajoutent ligne
 * à ligne ; posé dans la page, le formulaire poussait ses propres boutons hors
 * de l'écran dès le troisième frais. Le patron `Modale` garde le pied fixe,
 * hors du corps qui défile.
 *
 * Ce que cette modale ne protège pas : le cloisonnement. Le coût vit en
 * sous-collection `prive/` et ce sont les règles Firestore qui le gardent
 * (D2, D27) — un gérant qui appellerait cette écriture serait refusé par le
 * serveur, pas par l'absence du bouton.
 */
export function PoserCoutModal({
  moto,
  coutActuel,
  catalogue,
  onFermer,
}: {
  moto: Moto;
  /** `null` : aucun coût posé — le formulaire s'ouvre vide. */
  coutActuel: CoutMoto | null;
  catalogue: Catalogue;
  onFermer: () => void;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieCout>(() => depuis(coutActuel));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const total = coutTotalSaisie(saisie);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || envoi) return;

    const probleme = validerCoutPose(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* `construireCout` rend `null` sur une saisie que la validation aurait
       dû refuser. On ne l'écrase pas d'un `!` : si les deux divergeaient un
       jour, écrire un coût vide par-dessus un prix d'achat juste serait pire
       que de refuser le geste. */
    const cout = construireCout(saisie);
    if (!cout) {
      setErreur("Le prix d’achat n’a pas pu être lu. Vérifiez les montants saisis.");
      return;
    }

    setEnvoi(true);
    setErreur(null);
    try {
      /* `boutiqueId` recopié sur le coût : la règle Firestore compare ce
         champ à celui de la moto, et c'est aussi lui qui rend le document
         lisible par le périmètre (D2). */
      await poserCoutMoto(moto.id, moto.boutiqueId, cout, {
        uid: session.utilisateur.uid,
        nom: session.utilisateur.nom,
      });
      onFermer();
    } catch (cause) {
      setErreur(messageErreurMoto(cause));
      setEnvoi(false);
    }
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Prix d’achat"
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Wallet aria-hidden="true" className="size-4" />
          {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
          {" — "}
          <span className="plaque-code">{moto.numeroChassis}</span>
        </span>
      }
      pied={
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            form={FORMULAIRE}
            disabled={envoi}
            className="bouton bouton-principal"
          >
            {envoi ? "Enregistrement…" : "Enregistrer le prix d’achat"}
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Fermer
          </button>
        </div>
      }
    >
      <form id={FORMULAIRE} onSubmit={soumettre} noValidate>
        <div>
          <label htmlFor="pose-prix-achat" className="block text-sm font-medium text-encre">
            Prix d’achat
          </label>
          <input
            id="pose-prix-achat"
            inputMode="numeric"
            autoFocus
            value={saisie.prixAchat}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, prixAchat: evenement.target.value }))
            }
            className="saisie mt-1.5"
          />
        </div>

        <FraisEntree
          lignes={saisie.fraisEntree}
          changer={(fraisEntree) => setSaisie((actuel) => ({ ...actuel, fraisEntree }))}
          types={catalogue.typesFrais.filter((type) => type.actif)}
        />

        <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
          <span className="text-sm font-medium text-encre">Coût total d’entrée</span>
          <span className="text-lg font-semibold text-encre">{formaterMontant(total)}</span>
        </p>

        <EtatErreurSaisie message={erreur} className="mt-3" />
      </form>
    </Modale>
  );
}

/* Le formulaire repart du coût déjà posé : corriger un prix d'achat ne doit
   pas obliger à retaper les frais d'entrée qu'on ne change pas. */
function depuis(cout: CoutMoto | null): SaisieCout {
  if (!cout) return COUT_VIDE;
  return {
    prixAchat: `${cout.prixAchat}`,
    fraisEntree: cout.fraisEntree.map((ligne) => ({
      typeFraisId: ligne.typeFraisId,
      montant: `${ligne.montant}`,
      note: ligne.note,
    })),
  };
}
