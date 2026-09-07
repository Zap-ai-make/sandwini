"use client";

import { Bike, Coins, Receipt } from "lucide-react";
import { useCallback, useMemo } from "react";
import { EtatChargement, EtatErreur } from "@/components/patrons/Etats";
import { formaterHeure, formaterMontant, memeJour } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_MODE, LIBELLE_MOYEN, type Vente, type Versement } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Ce que j’ai fait aujourd’hui.
 *
 * Pas un tableau de bord : un accusé de réception. Le gérant travaille des
 * journées entières sans réseau, et la question qu’il se pose en fin d’après-midi
 * n’est pas « combien ai-je vendu » — c’est « est-ce que ce que j’ai saisi est
 * bien là ». Une liste de ses propres écritures y répond ; un compteur non.
 *
 * **La journée est celle de l’appareil** (`memeJour`), pas celle du serveur. Un
 * découpage calculé ailleurs ferait basculer sa journée à une heure qui n’est
 * pas la sienne, et le hors-ligne rend la question tout sauf théorique.
 *
 * **Une écriture sans date n’y figure pas.** Le champ n’est rempli qu’à
 * l’arrivée au serveur : tant qu’elle est dans la file d’attente, elle n’a pas
 * d’heure. La ranger dans « aujourd’hui » ferait apparaître une ligne à une
 * heure inventée — le bandeau, lui, dit déjà combien de saisies attendent, et
 * c’est sa place.
 */
type Ecriture = {
  cle: string;
  quand: Date;
  sorte: "vente" | "versement" | "entree";
  texte: string;
  detail: string;
};

export function JourneeDuGerant() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const boutiqueId = perimetre.boutiqueId;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
  );

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: motos } = useAbonnement(souscrireStock, "Le stock n’a pas pu être lu.");

  const nomDuClient = useMemo(
    () => new Map(clients.map((client) => [client.id, client.nom])),
    [clients],
  );

  const ecritures = useMemo<Ecriture[]>(() => {
    if (!ventes || !versements || !motos) return [];
    const aujourdhui = new Date();
    const nom = (id: string) => nomDuClient.get(id) ?? "Client inconnu";

    const lignes: Ecriture[] = [];

    for (const vente of ventes) {
      if (!memeJour(vente.date, aujourdhui)) continue;
      lignes.push({
        cle: `vente-${vente.id}`,
        quand: vente.date as Date,
        sorte: "vente",
        texte: `Vente ${vente.numero}`,
        detail: `${nom(vente.clientId)} · ${LIBELLE_MODE[vente.modePaiement]}`,
      });
    }

    for (const versement of versements) {
      if (!memeJour(versement.date, aujourdhui)) continue;
      lignes.push({
        cle: `versement-${versement.id}`,
        quand: versement.date as Date,
        sorte: "versement",
        texte: `Versement ${formaterMontant(versement.montant)}`,
        detail: `${LIBELLE_MOYEN[versement.moyenPaiement]} · ${versement.numeroRecu}`,
      });
    }

    for (const moto of motos) {
      if (!memeJour(moto.dateEntree, aujourdhui)) continue;
      lignes.push({
        cle: `entree-${moto.id}`,
        quand: moto.dateEntree as Date,
        sorte: "entree",
        texte: "Entrée en stock",
        detail: `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)} · ${moto.numeroChassis}`,
      });
    }

    // La plus récente en tête : c'est celle qu'on vient d'écrire qu'on vérifie.
    return lignes.sort((a, b) => b.quand.getTime() - a.quand.getTime());
  }, [ventes, versements, motos, nomDuClient, catalogue]);

  const chargement = perimetreEnCours || ventes === null || versements === null || motos === null;

  return (
    <section>
      <h2 className="mb-3 text-bloc font-semibold text-encre">Ce que j’ai fait aujourd’hui</h2>

      <EtatErreur message={erreur} className="mb-3" />

      {chargement ? (
        <EtatChargement>Lecture de la journée…</EtatChargement>
      ) : ecritures.length === 0 ? (
        <p className="text-encre-doux">
          Rien d’enregistré aujourd’hui. La première vente ou la première entrée en stock
          apparaîtra ici.
        </p>
      ) : (
        <div className="cadre">
          <ul className="cadre-liste">
            {ecritures.map((ecriture) => (
              <li key={ecriture.cle} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="font-code text-legende text-encre-doux tabular-nums">
                  {formaterHeure(ecriture.quand)}
                </span>
                <IconeSorte sorte={ecriture.sorte} />
                <span className="min-w-0 flex-1">
                  <span className="text-encre">{ecriture.texte}</span>{" "}
                  <span className="text-corps text-encre-doux">{ecriture.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-bord px-4 py-2 text-legende text-encre-doux">
            {ecritures.length === 1 ? "Une écriture" : `${ecritures.length} écritures`} depuis ce
            matin. Le bandeau, en haut, dit ce qui reste à envoyer.
          </p>
        </div>
      )}
    </section>
  );
}

/* L'icône double la sorte d'écriture, elle ne la remplace pas : le mot est
   toujours écrit à côté (DESIGN.md §8). */
function IconeSorte({ sorte }: { sorte: Ecriture["sorte"] }) {
  const Icone = sorte === "vente" ? Receipt : sorte === "versement" ? Coins : Bike;
  return <Icone aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />;
}
