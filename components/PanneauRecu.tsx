"use client";

import { ArrowLeft, Check, Printer, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Recu } from "@/components/Recu";
import { EtatChargement, EtatErreur, EtatVide } from "@/components/patrons/Etats";
import { IDENTITE } from "@/lib/domain/entreprise";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_TYPE_RECU, lireIdentifiantRecu, textePartage, trouverRecu } from "@/lib/domain/recu";
import type { Vente, Versement } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterMoto } from "@/lib/repositories/motos";
import { ecouterVente, ecouterVersements } from "@/lib/repositories/ventes";

/**
 * Le panneau qui montre un reçu et permet de l'imprimer ou de le partager.
 *
 * Ce n'est pas une route : c'est `/motos/recus?recu=<clé>`, comme la fiche
 * d'une moto ou d'une vente. Une route dynamique `/recus/[id]` obligerait le
 * navigateur à demander au serveur un document que le service worker n'a jamais
 * vu, et le reçu d'une vente saisie il y a dix secondes tomberait sur la page de
 * repli — exactement l'inverse de ce que cette spec promet (`DECISIONS.md`
 * D39).
 *
 * **Aucune écriture.** Un reçu se compose à la lecture (D61) : rien n'est figé
 * au moment d'imprimer, parce que le prix et les versements sont déjà
 * immuables. Une réimpression six mois plus tard redonne donc exactement le
 * même papier.
 */
export function PanneauRecu({ cle }: { cle: string }) {
  const { boutiques } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();

  /* Une clé illisible n'est pas une panne : c'est un lien recopié de travers.
     On la traite comme un reçu introuvable, sans ouvrir d'écoute. */
  const venteId = lireIdentifiantRecu(cle)?.venteId ?? "";

  /* La vente est enveloppée plutôt que passée telle quelle : `useAbonnement`
     rend `null` tant que rien n'est arrivé, et `ecouterVente` rend `null` pour
     une vente qui n'existe pas. Les deux se confondraient, et un reçu
     introuvable tournerait indéfiniment sur « Chargement… » au lieu de le dire
     (`DESIGN.md` §10). Un objet, lui, n'est jamais nul. */
  const souscrireVente = useCallback(
    (auChangement: (etat: { vente: Vente | null }) => void, enErreur: (cause: unknown) => void) =>
      venteId ? ecouterVente(venteId, (vente) => auChangement({ vente }), enErreur) : () => {},
    [venteId],
  );
  const { valeur: etatVente, erreur } = useAbonnement(
    souscrireVente,
    "Cette vente n’a pas pu être chargée.",
  );
  const vente = etatVente?.vente ?? null;

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      venteId ? ecouterVersements(venteId, auChangement, enErreur) : () => {},
    [venteId],
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  /* Enveloppée pour la même raison que la vente : une moto absente et une moto
     pas encore arrivée sont deux `null` différents, et le reçu doit attendre la
     seconde sans attendre la première. */
  const motoId = vente?.motoId ?? "";
  const souscrireMoto = useCallback(
    (auChangement: (etat: { moto: Moto | null }) => void, enErreur: (cause: unknown) => void) =>
      motoId ? ecouterMoto(motoId, (moto) => auChangement({ moto }), enErreur) : () => {},
    [motoId],
  );
  const { valeur: etatMoto, erreur: erreurMoto } = useAbonnement(
    souscrireMoto,
    "La moto n’a pas pu être chargée.",
  );

  /* Le reçu ne se compose qu'une fois les versements lus : leur somme donne le
     reste dû du jour, et l'agrégat de la vente ne le donnerait pas (D56). */
  const contenu = useMemo(
    () => (vente && versements ? trouverRecu(vente, versements, cle) : null),
    [vente, versements, cle],
  );

  /* **Le reçu s'affiche complet ou pas du tout.** La moto arrive par une écoute
     distincte, et pendant son trajet le document disait « Moto introuvable » —
     une affirmation fausse, sur un papier qu'un gérant pressé aurait pu
     imprimer. Vu en regardant la capture du rendu imprimé, pas à l'écran
     (`DESIGN.md` §14).

     L'en-tête de l'entreprise ne figure plus dans cette attente : depuis D71
     c'est une constante, elle est là avant la première requête. Une chose de
     moins qui puisse manquer sur un papier. */
  const enCours =
    venteId !== "" &&
    !erreur &&
    (etatVente === null ||
      versements === null ||
      (vente !== null && etatMoto === null && !erreurMoto));

  return (
    <div>
      <div className="print:hidden">
        <Link
          href="/motos/recus"
          className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Reçus
        </Link>
      </div>

      {erreur ? (
        <EtatErreur message={erreur} className="mt-6" />
      ) : enCours ? (
        <EtatChargement className="mt-6">Chargement du reçu…</EtatChargement>
      ) : !contenu ? (
        <Introuvable />
      ) : (
        <>
          <Actions
            titre={`${LIBELLE_TYPE_RECU[contenu.type]} ${contenu.numero}`}
            texte={textePartage(contenu, IDENTITE.raisonSociale, formaterMontant, formaterDate)}
            venteId={contenu.vente.id}
          />
          <div className="mt-4 print:mt-0">
            <Recu
              contenu={contenu}
              boutique={boutiques.find((b) => b.id === contenu.vente.boutiqueId) ?? null}
              client={clients.find((fiche) => fiche.id === contenu.vente.clientId) ?? null}
              moto={etatMoto?.moto ?? null}
              modele={
                etatMoto?.moto
                  ? `${catalogue.nomMarque(etatMoto.moto.marqueId)} ${catalogue.nomModele(etatMoto.moto.modeleId)}`
                  : ""
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Imprimer et partager.
 *
 * **Imprimer, c'est `window.print()`** — et c'est aussi ce qui produit le PDF :
 * la boîte d'impression du navigateur propose « Enregistrer au format PDF »,
 * sur Android comme sur un ordinateur, sans réseau et sans un octet de
 * bibliothèque (D60).
 *
 * **Partager, c'est le récapitulatif en texte** (`prompt.md` §11, message 3).
 * Web Share quand le navigateur la propose, sinon le presse-papiers : les deux
 * sont natives, donc disponibles hors ligne. Un partage annulé par
 * l'utilisateur n'est pas une erreur — `AbortError` se tait.
 */
function Actions({ titre, texte, venteId }: { titre: string; texte: string; venteId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function partager() {
    setErreur(null);
    setMessage(null);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: titre, text: texte });
        setMessage("Récapitulatif partagé.");
        return;
      }
      await navigator.clipboard.writeText(texte);
      setMessage("Récapitulatif copié : collez-le dans WhatsApp ou un SMS.");
    } catch (cause) {
      if ((cause as { name?: string }).name === "AbortError") return;
      setErreur("Le partage n’a pas abouti. Le reçu, lui, reste imprimable.");
    }
  }

  return (
    <div className="mt-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="bouton bouton-plaque"
        >
          <Printer aria-hidden="true" className="size-4" />
          Imprimer le reçu
        </button>
        <button
          type="button"
          onClick={partager}
          className="bouton bouton-neutre"
        >
          <Share2 aria-hidden="true" className="size-4" />
          Partager le récapitulatif
        </button>
        <Link
          href={`/motos/ventes?vente=${venteId}`}
          className="bouton bouton-neutre"
        >
          Ouvrir la vente
        </Link>
      </div>

      <p className="mt-2 max-w-prose text-sm text-encre-doux">
        Pour un PDF, choisissez « Enregistrer au format PDF » dans la boîte d’impression : elle
        fonctionne sans réseau.
      </p>

      {message && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-encre">
          <Check aria-hidden="true" className="size-4 shrink-0" />
          {message}
        </p>
      )}
      <EtatErreur message={erreur} className="mt-2" />
    </div>
  );
}

/**
 * Le reçu introuvable — une clé d'URL qui ne correspond à rien de connu de cet
 * appareil : lien recopié à la main, versement d'un autre appareil pas encore
 * synchronisé.
 */
function Introuvable() {
  return (
    <EtatVide
      titre="Ce reçu est introuvable."
      className="mt-6 max-w-prose"
      action={
        <Link href="/motos/recus" className="bouton bouton-neutre">
          Revenir aux reçus
        </Link>
      }
    >
      Le lien ne correspond à aucun reçu de cette vente. Si le versement a été encaissé sur un
      autre appareil, il apparaîtra ici dès que la synchronisation l’aura apporté.
    </EtatVide>
  );
}
