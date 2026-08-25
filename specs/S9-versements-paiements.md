# S9 — Versements et suivi des paiements

```
Statut     : à faire
Périmètre  : MVP
Dépend de  : S8
```

---

## Objectif

Un client passe verser une partie de ce qu'il doit : le gérant enregistre le versement en trois
gestes. Et à tout moment, le magasin sait qui lui doit de l'argent, depuis combien de temps, et
combien il détient pour le compte de clients dont la moto attend encore au magasin.

---

## Critères d'acceptation

- [ ] Enregistrement d'un versement depuis la fiche vente : montant, moyen de paiement (espèces, Orange Money, Moov Money, Wave), référence facultative
- [ ] Un versement ne peut pas dépasser le reste dû ; refus explicite avec le montant maximal admissible
- [ ] Chaque versement écrit, dans un batch atomique : le versement numéroté (S7), un encaissement, et les agrégats recalculés sur la vente (`totalPaye`, `resteDu`, `statutPaiement`, `dernierVersementAt`)
- [ ] Les encaissements liés à une vente en tranches portent `categorieTranches: true` : cet argent est un engagement, pas une recette, tant que la moto n'est pas remise
- [ ] Tranches soldées : le gérant confirme la remise de la moto ; la moto passe `vendue`, `motoRemise: true`, `dateRemiseMoto` est enregistrée
- [ ] Tant que le reste dû n'est pas nul, la remise de la moto est impossible pour une vente en tranches
- [ ] **Liste des dettes** : ventes à crédit avec un reste dû, de la plus ancienne à la plus récente, avec l'ancienneté en jours et la date du dernier versement ; total dû en en-tête
- [ ] **Liste des tranches en cours** : ventes en tranches non remises, avec le total détenu et le nombre de motos à livrer en en-tête
- [ ] **Tranches inactives** : sans versement depuis 30 jours, signalées visuellement dans la liste, sans aucune action automatique
- [ ] Les trois listes et leurs totaux sont calculés côté client à partir des documents chargés, jamais depuis un agrégat serveur (`prompt.md` §3.4)
- [ ] Un versement s'enregistre hors ligne et les totaux se mettent à jour immédiatement
- [ ] Un gérant ne peut ni modifier ni annuler un versement ; le responsable le peut, et l'opération est journalisée dans la sous-collection `historique`
- [ ] États couverts : aucune dette, aucune tranche, vente soldée, chargement, hors ligne

---

## Hors périmètre

Le reçu de versement imprimable (S10). Le journal de caisse et la clôture de journée (S22) : ici on
écrit les encaissements, on ne les relit pas encore. Le seuil d'inactivité paramétrable — 30 jours en
dur, à rendre réglable plus tard. Les relances WhatsApp (S14).

---

## Notes techniques

Les agrégats de paiement sont dénormalisés sur la vente, ce qui crée un risque classique : deux
appareils encaissant hors ligne sur la même vente écrasent mutuellement `totalPaye`. Le cahier des
charges accepte la dernière écriture gagnante (§3.4), mais pas au prix d'un montant faux. Parade
retenue : les versements sont la source de vérité, les agrégats une commodité d'affichage, et une
Cloud Function les recalcule depuis la sous-collection à chaque écriture de versement. L'interface,
elle, additionne les versements chargés plutôt que de croire l'agrégat.

Le calcul de reste dû, de statut de paiement et d'ancienneté vit dans `lib/domain`, partagé avec S8.
Ce sont les fonctions les plus testées du projet : une erreur ici, c'est de l'argent perdu ou réclamé
à tort.

La remise de moto en fin de tranches est une transition d'état à trois effets (moto, vente,
comptabilisation de l'engagement en recette). Elle passe par un batch et s'accompagne d'une entrée
d'historique — c'est le moment où l'argent détenu devient de l'argent gagné.
