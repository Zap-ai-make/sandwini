# S10 — Reçus imprimables hors-ligne

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S8, S9
```

---

## Objectif

À la fin d'une vente ou d'un versement, le client repart avec un reçu — imprimé ou en PDF — portant le
numéro, le détail et le reste dû. Y compris quand la boutique n'a pas de réseau ce jour-là.

---

## Critères d'acceptation

- [ ] Deux types au MVP : reçu de vente de moto et reçu de versement
- [ ] Contenu obligatoire (`prompt.md` §10) : entreprise, boutique, adresse, téléphone, numéro du reçu, date, client, détail (marque, modèle, châssis), montant, moyen de paiement, total payé, reste dû, nom de l'opérateur
- [ ] Les mentions légales des paramètres entreprise s'impriment si elles sont renseignées (D11)
- [ ] Impression directe par le navigateur, avec une feuille de style dédiée : pas de menu, pas de navigation, marges correctes sur A5 et A4
- [ ] Génération PDF côté client pour le partage
- [ ] **Tout fonctionne hors ligne** : aucune police distante, aucune image distante, le logo servi depuis le cache — vérifié par un test Playwright réseau coupé
- [ ] Partage via l'API Web Share quand le navigateur la propose ; sinon, téléchargement du PDF
- [ ] Un reçu se réimprime à l'identique depuis la fiche vente, à tout moment
- [ ] Écran « Reçus » filtrable par numéro, date et client
- [ ] Un reçu renuméroté par la réconciliation (S7) se réimprime avec son numéro définitif, et l'écart est signalé
- [ ] États couverts : aucun reçu, reçu introuvable, échec de génération PDF, hors ligne

---

## Hors périmètre

La facture, troisième type prévu au §10 — le MVP livre les deux reçus qui accompagnent un paiement,
la facture est un document commercial distinct qui attend un besoin exprimé. Le reçu de vente de
pièces (S21). L'envoi WhatsApp du récapitulatif (S14).

---

## Notes techniques

Le reçu est du HTML rendu par React et imprimé par le navigateur : c'est la solution qui coûte le
moins et qui marche hors ligne par construction (`ARCHITECTURE.md` §1, échelle 3).

Le PDF n'est nécessaire que pour le partage. Une bibliothèque cliente légère suffit ; elle doit être
importée dynamiquement pour ne pas peser sur le démarrage de l'application, et son bundle doit être
mis en cache par le service worker — sinon le PDF ne se génère pas hors ligne, ce qui viderait la
spec de son sens.

Le logo est en cache Storage. S'il manque, le reçu s'imprime sans logo plutôt que d'échouer : un reçu
sans logo reste un reçu valable, un reçu qui ne s'imprime pas ne l'est pas.

Les données du reçu sont figées à l'impression depuis les documents de la vente. On ne recalcule pas
un reste dû au moment de réimprimer un vieux reçu : on réimprime ce que le client a reçu ce jour-là.
Ce point conditionne la confiance dans le document — le stocker explicitement, ne pas le déduire.
