import { normaliserNom } from "./client";
import { attendUnRetour, type DossierCarteGrise } from "./dossier-carte-grise";

/**
 * Les dépôts de cartes grises, lus comme les arrivages (31 octobre 2026).
 *
 * **Un dépôt, c'est un prestataire et un jour.** Le commanditaire confie ses
 * cartes par paquets ; il veut voir chaque paquet comme il voit un arrivage de
 * motos : combien ont été prises, combien sont revenues, combien restent
 * dehors. Rien de cela n'est stocké : c'est lu des dossiers, qui disent déjà
 * chez qui et depuis quand chaque carte est partie.
 *
 * **« Revenue » se lit sur les cases**, comme partout ailleurs
 * (`attendUnRetour`) : une immatriculation notée, un retour au magasin ou une
 * remise au client disent que la carte n'est plus chez le prestataire.
 */
export type DepotCarteGrise = {
  /** La clé commune à tous les dossiers du dépôt (`cleDepot`). */
  cle: string;
  /** Tel qu'il est écrit sur le premier dossier ; vide s'il n'a pas été noté. */
  prestataireNom: string;
  /** Le jour du dépôt ; `null` quand le prestataire est noté sans date. */
  deposeLe: Date | null;
  pris: number;
  recus: number;
  restent: number;
};

type DossierDepose = Pick<
  DossierCarteGrise,
  "prestataireId" | "prestataireNom" | "deposeLe" | "immatriculation" | "revenuLe" | "remisLe"
>;

/**
 * La clé du dépôt d'un dossier, ou `null` s'il n'est jamais parti.
 *
 * Le prestataire se reconnaît à son nom normalisé — la case accepte un nom
 * tapé à la main, et « kaboré » un jour vaut « Kaboré » le lendemain —, et à
 * son identifiant seulement quand le nom manque. Le jour se lit à l'heure
 * locale : deux cartes confiées le matin et le soir sont du même paquet.
 */
export function cleDepot(dossier: DossierDepose): string | null {
  const nom = normaliserNom(dossier.prestataireNom);
  if (dossier.deposeLe === null && nom === "") return null;
  const qui = nom || dossier.prestataireId || "";
  return `${qui}|${dossier.deposeLe ? jour(dossier.deposeLe) : "sans-date"}`;
}

/** Les dépôts, du plus récent au plus ancien ; ceux sans date ferment la liste. */
export function depotsDeCartesGrises(dossiers: readonly DossierDepose[]): DepotCarteGrise[] {
  const parCle = new Map<string, DepotCarteGrise>();

  for (const dossier of dossiers) {
    const cle = cleDepot(dossier);
    if (cle === null) continue;
    const depot = parCle.get(cle) ?? {
      cle,
      prestataireNom: dossier.prestataireNom.trim(),
      deposeLe: dossier.deposeLe,
      pris: 0,
      recus: 0,
      restent: 0,
    };
    depot.pris += 1;
    if (attendUnRetour(dossier)) depot.restent += 1;
    else depot.recus += 1;
    parCle.set(cle, depot);
  }

  return [...parCle.values()].sort((a, b) => {
    if (a.deposeLe === null && b.deposeLe === null) {
      return a.prestataireNom.localeCompare(b.prestataireNom, "fr");
    }
    if (a.deposeLe === null) return 1;
    if (b.deposeLe === null) return -1;
    return b.deposeLe.getTime() - a.deposeLe.getTime();
  });
}

function jour(date: Date): string {
  const mois = `${date.getMonth() + 1}`.padStart(2, "0");
  const quantieme = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${quantieme}`;
}
