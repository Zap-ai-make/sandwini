# S11 — Dossier documents — cycle de vie et suivi

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S4, S8
```

---

## Objectif

Le gérant sait à tout instant où en sont la quittance, le CMC, la carte grise et la plaque de chaque
client, qui les détient, et lesquels traînent depuis trop longtemps. C'est le second problème que le
cahier des charges vient résoudre, après la vente elle-même.

---

## Critères d'acceptation

- [ ] **Le chemin dépend du type de document** (`DECISIONS.md` D65) : la quittance et le CMC arrivent déjà faits (`a_faire → revenu_magasin → remis_client`, sans étape prestataire) ; la carte grise et la plaque suivent le cycle complet via un prestataire, sans saut possible
- [ ] `non_applicable` reste possible depuis `a_faire`, jamais une fois le document déposé
- [ ] Les transitions illégales sont impossibles : la machine à états est une fonction pure testée, pas une suite de conditions dans un composant
- [ ] Passage à `chez_prestataire` : prestataire, date de dépôt et avance versée **obligatoires**, plus une date de disponibilité estimée
- [ ] L'avance versée crée un encaissement `sortie` / `avance_prestataire` dans le même batch
- [ ] Passage à `remis_client` : réservé au gérant, enregistre la date de remise et l'opérateur
- [ ] Chaque changement de statut est journalisé dans la sous-collection `historique` du document (`prompt.md` §3.5)
- [ ] Le dossier se clôt **automatiquement** dès que les quatre documents sont `remis_client` ou `non_applicable`, que le paiement est soldé et que la moto est remise — la date de clôture est enregistrée
- [ ] La condition de clôture est une fonction pure testée sur tous les cas limites (documents non applicables, tranches soldées mais moto non remise, etc.)
- [ ] **Liste des dossiers en attente** : tous les dossiers ouverts, du plus ancien au plus récent, avec pour chaque document en cours le nom du prestataire qui le détient
- [ ] Filtres : boutique, prestataire, type de document, et **en retard** (date estimée dépassée)
- [ ] Le retard est calculé côté client par rapport à la date du jour, donc juste même hors ligne
- [ ] Les changements de statut se font sans réseau ; là où une opération l'exige, l'écran le dit au lieu d'échouer en silence (D66)
- [ ] La quittance et le CMC ont un champ d'envoi de fichier, annoncé comme demandant du réseau : le reste du formulaire s'enregistre sans lui, et le fichier reste ajoutable plus tard (D66)
- [ ] États couverts : aucun dossier en attente, aucun résultat de filtre, chargement, hors ligne

---

## Hors périmètre

La page publique du client (S13) et celle du prestataire (S15) : au MVP, seul le gérant fait avancer
les statuts. Les notifications WhatsApp (S14). La gestion du stock physique de CMC (S16) — le document
`cmc` suit son cycle sans être rattaché à une carte du stock.

---

## Notes techniques

La machine à états est le cœur de la spec et vit dans `lib/domain/dossier.ts` : **deux** tables de
transitions — ce qui arrive déjà fait, ce qui passe par un prestataire — indexées par type de
document (D65), une fonction qui valide un passage, une fonction qui dit si un dossier est
clôturable.
Trois fonctions pures, entièrement testées, réutilisées ensuite par S13 et S15 — dont les pages
publiques appliqueront exactement les mêmes règles côté serveur.

La clôture automatique se déclenche à chaque écriture susceptible de la provoquer : dernier document
remis, dernier versement, remise de la moto. Plutôt que de disperser ce déclencheur dans trois écrans,
une Cloud Function sur écriture de vente ou de document évalue la condition — mais l'interface calcule
la même chose localement pour l'afficher sans attendre le serveur (`prompt.md` §3.4).

L'avance au prestataire est une sortie de caisse réelle : elle passe dans le même batch que le
changement de statut, sinon on obtient des documents déposés sans trace de l'argent sorti.

Attention au filtre « en retard » : il dépend de la date du jour, donc il ne peut pas être une requête
Firestore figée. Filtrage côté client sur les dossiers ouverts chargés — leur nombre reste modeste par
construction, un dossier ouvert est un dossier vivant.
