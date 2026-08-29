# ROADMAP — Source de vérité de la progression

Découpage du cahier des charges (`prompt.md`) en specs vérifiables, selon `WORKFLOW.md` §3.
Une spec = une capacité autonome et testable. Le détail de chaque spec MVP vit dans `specs/S<n>-<slug>.md`.

Les specs post-MVP sont listées ici avec leur périmètre et leurs dépendances ; leur fiche complète
est rédigée au moment où elles sont prises en charge (`WORKFLOW.md` §7), pour ne pas figer un détail
qui aura changé d'ici là.

---

## Ligne MVP

Le MVP est le moins qui délivre la valeur centrale : **enregistrer une vente de moto au comptoir sans
réseau, savoir ce qui reste dû, et savoir où en est chaque document du dossier.**

Tout ce qui sert le confort, le pilotage ou un second métier (pièces détachées) est post-MVP.

| ID  | Spec                                          | Dépend de        | Périmètre | Statut  |
|-----|-----------------------------------------------|------------------|-----------|---------|
| S1  | Socle technique et coquille applicative       | aucune           | MVP       | terminée |
| S2  | Authentification, rôles et utilisateurs       | S1               | MVP       | terminée |
| S3  | Boutiques et sélecteur de périmètre           | S2               | MVP       | terminée |
| S4  | Référentiels et paramètres entreprise         | S3               | MVP       | terminée |
| S5  | Stock motos — entrée et consultation          | S4               | MVP       | terminée |
| S6  | Clients — recherche et création               | S3               | MVP       | terminée |
| S7  | Numérotation hors-ligne des pièces comptables | S3               | MVP       | terminée |
| S8  | Vente de moto — enregistrement                | S5, S6, S7       | MVP       | terminée |
| S9  | Versements et suivi des paiements             | S8               | MVP       | terminée |
| S10 | Reçus imprimables hors-ligne                  | S8, S9           | MVP       | à faire |
| S11 | Dossier documents — cycle de vie et suivi     | S4, S8           | MVP       | à faire |
| S12 | Règles Firestore — durcissement et tests      | S1 → S11         | MVP       | à faire |

**MVP gate** (`WORKFLOW.md` §6) après S12 : démonstration, checklist `SECURITY.md` §13, feu vert
avant toute spec post-MVP.

---

## Backlog post-MVP, ordonné par valeur

| ID  | Spec                                          | Dépend de   | Pourquoi ce rang |
|-----|-----------------------------------------------|-------------|------------------|
| S13 | Lien de suivi client — page `/suivi/[token]`  | S11         | Le différenciateur vis-à-vis du client ; inutile tant que les statuts documents ne vivent pas (S11). |
| S14 | Messages WhatsApp paramétrables               | S13         | Sans le lien de S13, il n'y a presque rien à envoyer. |
| S15 | Prestataires — token et page `/prestataire`   | S11         | Décharge le gérant de la relance ; le circuit fonctionne sans, à la main. |
| S16 | CMC — stock, attribution, remise              | S11         | Le document `cmc` suit déjà son cycle sans gestion du stock physique de cartes. |
| S17 | Transferts de motos entre boutiques           | S5          | Utile dès qu'il y a plusieurs boutiques actives. |
| S18 | Échanges / reprises                           | S8          | Cas de vente fréquent mais contournable (vente + entrée en stock séparées). |
| S19 | Photos de motos                               | S5          | Repoussé pour raison technique, cf. `DECISIONS.md` D14. |
| S20 | Pièces — catalogue, stock et mouvements       | S4          | Second métier entier ; n'empêche pas de vendre des motos. |
| S21 | Pièces — vente au comptoir et alertes rupture | S7, S10, S20| Suite immédiate de S20. |
| S22 | Caisse — journal et clôture de journée        | S9          | Les encaissements existent dès S9 ; ici on ajoute la lecture et le comptage. |
| S23 | Inventaires motos et pièces + comparaison     | S5, S20     | Exercice périodique, pas quotidien. |
| S24 | Tableau de bord — vue d'ensemble responsable  | S9, S11     | Pilotage ; a besoin que les données à agréger existent d'abord. |
| S25 | Annulation et correction de vente, et d'un versement | S9    | Opération sensible, cf. `DECISIONS.md` D10 et D58. S9 y a renvoyé la correction d'un versement : même appareillage d'historique. |
| S26 | Motos de confrère                             | S8          | Cas de vente marginal (`prompt.md` §8). |
| S27 | Reconnexion immédiate au retour du réseau     | aucune      | Aujourd'hui, la file d'écritures repart quand le SDK Firestore a fini son attente croissante — jusqu'à une minute après le retour du signal. Sur un marché à couverture intermittente, c'est le geste le plus visible du produit. Cf. `DECISIONS.md` D50. |

---

## Ce que le MVP ne fait volontairement pas

Espace pièces détachées · inventaires · caisse et clôture · tableau de bord chiffré · pages publiques
client et prestataire · WhatsApp · échanges et reprises · transferts inter-boutiques · stock de CMC ·
photos de motos · annulation de vente.

Chacun de ces manques est une entrée du backlog ci-dessus, pas un oubli.
