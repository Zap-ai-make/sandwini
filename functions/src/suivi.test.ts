import { describe, expect, test } from "vitest";
import { construireSuivi, type CarteDuSuivi } from "./suivi";
import { lireSuivi } from "../../lib/domain/suivi-prestataire";

const JOUR = 86_400_000;
/* Milieu de journée : le calcul des jours normalise à minuit, et une heure
   ronde masquerait un défaut de normalisation. */
const MAINTENANT = new Date("2026-10-16T14:30:00Z").getTime();

function carte(partiel: Partial<CarteDuSuivi> = {}): CarteDuSuivi {
  return {
    venteId: "v1",
    statut: "chez_prestataire",
    deposeLe: MAINTENANT - 5 * JOUR,
    remisLe: null,
    avance: 15_000,
    numeroVente: "PTG-2610-0042",
    client: "Compaoré Ali",
    moto: "Haojue DK150",
    chassis: "LC6PAGA1XJ0000001",
    ...partiel,
  };
}

describe("partager les cartes entre ce qui est dehors et ce qui est rentré", () => {
  test("une carte chez le prestataire est en cours, et dit depuis combien de jours", () => {
    const suivi = construireSuivi("Sawadogo", [carte()], MAINTENANT);

    expect(suivi.enCours).toHaveLength(1);
    expect(suivi.historique).toHaveLength(0);
    expect(suivi.enCours[0].joursDehors).toBe(5);
    expect(suivi.enCours[0].revenuLe).toBeNull();
    expect(suivi.enCours[0].chassis).toBe("LC6PAGA1XJ0000001");
  });

  test("une carte revenue au magasin passe à l’historique, avec sa date", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [carte({ statut: "revenu_magasin", remisLe: MAINTENANT - JOUR })],
      MAINTENANT,
    );

    expect(suivi.enCours).toHaveLength(0);
    expect(suivi.historique).toHaveLength(1);
    expect(suivi.historique[0].revenuLe).toBe(new Date(MAINTENANT - JOUR).toISOString());
  });

  /* `remis_client` ne s'écrit plus, mais la préversion en porte. L'ignorer
     laisserait des cartes rendues dans la colonne « en cours », et le
     prestataire croirait qu'on lui en réclame une qu'il a déjà rapportée. */
  test("un statut d’avant, remis_client, compte comme rentré", () => {
    const suivi = construireSuivi("Sawadogo", [carte({ statut: "remis_client" })], MAINTENANT);
    expect(suivi.historique).toHaveLength(1);
    expect(suivi.enCours).toHaveLength(0);
  });

  /* Une carte `a_faire` n'est jamais partie : elle n'appartient pas au suivi de
     ce prestataire, même si son nom reste écrit sur le document d'un dépôt
     annulé. L'afficher lui réclamerait un travail qu'on ne lui a pas confié. */
  test("une carte qui n’est jamais partie ne figure nulle part", () => {
    const suivi = construireSuivi("Sawadogo", [carte({ statut: "a_faire" })], MAINTENANT);
    expect(suivi.enCours).toHaveLength(0);
    expect(suivi.historique).toHaveLength(0);
  });

  test("les cartes en cours se lisent de la plus ancienne à la plus récente", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [
        carte({ venteId: "recente", numeroVente: "B", deposeLe: MAINTENANT - JOUR }),
        carte({ venteId: "ancienne", numeroVente: "A", deposeLe: MAINTENANT - 30 * JOUR }),
      ],
      MAINTENANT,
    );
    /* La plus vieille d'abord : c'est celle qui inquiète, et c'est pour elle
       qu'on ouvre le lien. */
    expect(suivi.enCours.map((ligne) => ligne.numeroVente)).toEqual(["A", "B"]);
  });

  test("l’historique se lit du retour le plus récent au plus ancien", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [
        carte({ venteId: "vieux", numeroVente: "A", statut: "revenu_magasin", remisLe: MAINTENANT - 30 * JOUR }),
        carte({ venteId: "frais", numeroVente: "B", statut: "revenu_magasin", remisLe: MAINTENANT - JOUR }),
      ],
      MAINTENANT,
    );
    expect(suivi.historique.map((ligne) => ligne.numeroVente)).toEqual(["B", "A"]);
  });
});

describe("les avances", () => {
  /* **Les avances s'additionnent sur les DOCUMENTS, pas sur les paquets.** Un
     paquet répartit son avance entre ses cartes — la part de chacune, le reste à
     la première — précisément pour que cette somme retombe juste. Additionner
     les paquets raterait les dépôts unitaires d'avant S53. */
  test("s’additionnent, cartes rendues comprises", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [
        carte({ avance: 15_000 }),
        carte({ venteId: "v2", statut: "revenu_magasin", remisLe: MAINTENANT, avance: 10_000 }),
      ],
      MAINTENANT,
    );
    expect(suivi.argent.avances).toBe(25_000);
  });

  test("une avance absente compte zéro et ne rend pas NaN", () => {
    const suivi = construireSuivi("Sawadogo", [carte({ avance: null })], MAINTENANT);
    expect(suivi.argent.avances).toBe(0);
  });

  /* Une carte jamais partie n'a pas donné lieu à une avance ; si son document
     en porte une par accident, elle ne compte pas — on n'additionne que ce qui
     a été confié. */
  test("une carte jamais partie n’apporte pas son avance", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [carte({ statut: "a_faire", avance: 99_000 })],
      MAINTENANT,
    );
    expect(suivi.argent.avances).toBe(0);
  });
});

describe("les cas limites qui rendraient la page blanche", () => {
  test("un prestataire sans aucune carte rend une charge utile complète", () => {
    expect(construireSuivi("Sawadogo", [], MAINTENANT)).toEqual({
      prestataire: { nom: "Sawadogo" },
      enCours: [],
      historique: [],
      argent: { avances: 0 },
    });
  });

  test("deux cents cartes se construisent sans trou", () => {
    const beaucoup = Array.from({ length: 200 }, (_rien, rang) =>
      carte({ venteId: `v${rang}`, numeroVente: `PTG-2610-${rang}`, avance: 1_000 }),
    );
    const suivi = construireSuivi("Sawadogo", beaucoup, MAINTENANT);
    expect(suivi.enCours).toHaveLength(200);
    expect(suivi.argent.avances).toBe(200_000);
  });

  /* Point de vigilance 3 : une vente, une moto ou un client illisible ne doit
     pas faire tomber le portail entier. La ligne se construit, et dit ce
     qu'elle ne sait pas. */
  test("une ligne dont la moto et le client manquent se construit quand même", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [carte({ moto: "", chassis: "", client: "", numeroVente: "" })],
      MAINTENANT,
    );

    expect(suivi.enCours).toHaveLength(1);
    expect(suivi.enCours[0].moto).toBe("Moto inconnue");
    expect(suivi.enCours[0].client).toBe("Client inconnu");
    expect(suivi.enCours[0].numeroVente).toBe("Sans numéro");
    /* Le châssis reste vide : inventer « Châssis inconnu » laisserait croire à
       une donnée, alors que cette ligne se lit par son numéro. */
    expect(suivi.enCours[0].chassis).toBe("");
  });

  test("une carte sans date de dépôt rend zéro jour, jamais NaN", () => {
    const suivi = construireSuivi("Sawadogo", [carte({ deposeLe: null })], MAINTENANT);
    expect(suivi.enCours[0].joursDehors).toBe(0);
    expect(suivi.enCours[0].deposeLe).toBe("");
  });

  /* Une horloge de téléphone en avance produirait un dépôt « dans le futur ».
     « Depuis -2 jours » est pire qu'un zéro, et le relecteur du client refuse
     de toute façon un nombre négatif. */
  test("un dépôt daté dans le futur rend zéro jour", () => {
    const suivi = construireSuivi("Sawadogo", [carte({ deposeLe: MAINTENANT + 2 * JOUR })], MAINTENANT);
    expect(suivi.enCours[0].joursDehors).toBe(0);
  });

  /* Le calcul normalise à minuit, comme `joursEcoules` côté client : une carte
     déposée à 17 h et consultée le lendemain à 9 h est dehors depuis UN jour,
     pas depuis zéro. C'est ce que dirait la personne au comptoir. */
  test("les jours se comptent en dates, pas en tranches de vingt-quatre heures", () => {
    const hierDixSept = new Date("2026-10-15T17:00:00Z").getTime();
    const suivi = construireSuivi("Sawadogo", [carte({ deposeLe: hierDixSept })], MAINTENANT);
    expect(suivi.enCours[0].joursDehors).toBe(1);
  });
});

describe("la frontière, nouée aux deux bouts", () => {
  /* **LE test de cette tâche.** `functions/` ne peut pas importer `lib/`
     (`rootDir: "src"`), donc les deux moitiés de la frontière ne se partagent
     aucun code — comme `numerotation`. Ce test est ce qui les tient ensemble :
     tout ce que le serveur fabrique, le client doit le relire EN ENTIER.
     Ajouter un prix de vente au serveur fera tomber ce test, pas une revue de
     code. */
  test("ce que le serveur fabrique, le client le relit à l’identique", () => {
    const suivi = construireSuivi(
      "Sawadogo",
      [carte(), carte({ venteId: "v2", statut: "revenu_magasin", remisLe: MAINTENANT - JOUR })],
      MAINTENANT,
    );
    const traverse = JSON.parse(JSON.stringify(suivi));
    expect(lireSuivi(traverse)).toEqual(suivi);
  });

  test("une charge vide traverse aussi", () => {
    const suivi = construireSuivi("Sawadogo", [], MAINTENANT);
    expect(lireSuivi(JSON.parse(JSON.stringify(suivi)))).toEqual(suivi);
  });

  /* Le critère « ce qui ne doit pas fuir », pris au mot : on cherche les mots
     interdits dans le JSON lui-même. Grossier, et c'est voulu — un test qui
     n'inspecterait que les clefs attendues ne verrait pas un coût rangé sous un
     nom innocent. */
  test("aucun montant autre que les avances ne traverse", () => {
    const suivi = construireSuivi("Sawadogo", [carte()], MAINTENANT);
    const texte = JSON.stringify(suivi).toLowerCase();

    for (const interdit of ["prix", "cout", "coût", "marge", "benefice", "bénéfice", "telephone", "prive"]) {
      expect(texte).not.toContain(interdit);
    }
    expect(Object.keys(suivi.argent)).toEqual(["avances"]);
  });

  /* Pas de `solde`, et c'est la possibilité (a) de la spec : les deux termes de
     la soustraction n'existent pas dans le modèle. Le mot ne doit pas
     réapparaître un jour à zéro — « solde : 0 » se lit « on ne me doit rien ». */
  test("le mot solde n’apparaît nulle part", () => {
    const suivi = construireSuivi("Sawadogo", [carte()], MAINTENANT);
    expect(JSON.stringify(suivi)).not.toContain("solde");
  });
});
