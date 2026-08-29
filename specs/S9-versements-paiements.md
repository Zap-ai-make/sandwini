# S9 — Versements et suivi des paiements

```
Statut     : terminée
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

- [x] Enregistrement d'un versement depuis la fiche vente : montant, moyen de paiement (espèces, Orange Money, Moov Money, Wave), référence facultative
- [x] Un versement ne peut pas dépasser le reste dû ; refus explicite avec le montant maximal admissible
- [x] Chaque versement écrit, dans un batch atomique : le versement numéroté, un encaissement, et les agrégats recalculés sur la vente (`totalPaye`, `resteDu`, `statutPaiement`, `dernierVersementAt`)
- [x] Le reçu d'un versement dérive du numéro de la vente et du rang de l'encaissement (`PTG-2608-0042/V2`) — il ne consomme aucun numéro de la série des ventes (D57)
- [x] Les encaissements liés à une vente en tranches portent `categorieTranches: true` : cet argent est un engagement, pas une recette, tant que la moto n'est pas remise
- [x] Tranches soldées : le gérant confirme la remise de la moto ; la moto passe `vendue`, `motoRemise: true`, `dateRemiseMoto` est enregistrée, et l'historique garde qui a remis les clés
- [x] Tant que le reste dû n'est pas nul, la remise de la moto est impossible pour une vente en tranches — dans l'écran comme dans les règles
- [x] **Liste des dettes** : ventes à crédit avec un reste dû, de la plus ancienne à la plus récente, avec l'ancienneté en jours et la date du dernier versement ; total dû en en-tête
- [x] **Liste des tranches en cours** : ventes en tranches non remises, avec le total détenu et le nombre de motos à livrer en en-tête
- [x] **Tranches inactives** : sans versement depuis `N` jours, signalées visuellement, sans aucune action automatique. `N` est paramétrable par le responsable sur la fiche Entreprise, défaut 30 (D37)
- [x] Les trois listes et leurs totaux sont calculés côté client à partir des versements chargés, jamais depuis un agrégat serveur (`prompt.md` §3.4)
- [x] Un versement s'enregistre hors ligne, son numéro de reçu s'affiche, et les totaux se mettent à jour immédiatement — vérifié par un test Playwright réseau coupé
- [x] Les règles n'ouvrent la vente qu'à deux gestes : les agrégats de paiement, qui ne peuvent que monter, et la remise des tranches à `resteDu == 0`. Prix, mode, client, moto, numéros et token restent immuables
- [x] Personne ne modifie ni ne supprime un versement depuis l'application, gérant comme responsable
- [x] États couverts : aucune dette, aucune tranche, aucune tranche inactive, vente soldée, remise déjà faite, chargement, hors ligne, droits refusés

---

## Hors périmètre

Le reçu de versement imprimable (S10). Le journal de caisse et la clôture de journée (S22) : ici on
écrit les encaissements, on ne les relit pas encore. Les relances WhatsApp (S14).

**La correction et l'annulation d'un versement (S25).** Le §6.2 les réserve au responsable et les
veut journalisées. Ce sont des opérations sensibles sur de l'argent déjà encaissé et un reçu déjà
remis ; elles rejoignent S25, qui traite l'annulation d'une vente avec le même appareillage
d'historique. Arbitré avec le responsable du projet, pas décidé seul — cf. `DECISIONS.md` D58.

---

## Notes techniques

**Le point délicat de cette spec est l'agrégat hors ligne** — l'équivalent, côté argent, de ce que le
coût de la moto était pour S8. `totalPaye` et `resteDu` vivent sur le document de vente, où le cahier
des charges les met (§5.4). Deux appareils sans réseau qui encaissent chacun un versement sur la même
vente écrivent tous deux ce champ : la dernière écriture gagne, et un versement disparaît des totaux
alors que son reçu est entre les mains du client. Les sous-documents, eux, survivent tous les deux.

D'où la hiérarchie retenue (D56) : **les versements font foi, le parent est un cache d'affichage.**
L'appareil écrit le cache dans son lot pour que l'écran soit juste tout de suite, sans réseau ; le
déclencheur `recalculerPaiementsVente` le recalcule depuis la sous-collection dès que l'écriture
parvient au serveur. Et l'interface, elle, additionne les versements chargés — la fiche par une
écoute de sa sous-collection, les trois listes par une requête de groupe de collections filtrée par
boutique, qui demande son index dans `firestore.indexes.json`.

**Les règles percent une porte étroite dans un document que S8 avait fermé.** Deux gestes passent, et
`diff().affectedKeys().hasOnly(…)` interdit tout le reste. `totalPaye` ne peut que monter : un total
qui baisse est soit une erreur, soit une annulation, et l'annulation est S25. La remise se garde sur
`resteDu == 0` de l'état d'avant — un agrégat qui ne peut se tromper que dans le bon sens, puisqu'il
n'additionne que des versements réels.

Le calcul de reste dû, de statut de paiement, d'ancienneté et des trois listes vit dans
`lib/domain/vente.ts`, partagé avec S8. Ce sont les fonctions les plus testées du projet : une erreur
ici, c'est de l'argent perdu ou réclamé à tort.

La remise de moto est une transition à trois écritures indissociables — la vente, la moto, une entrée
d'historique — dans un seul lot. Les encaissements passés, eux, ne sont pas retouchés : une écriture
de caisse ne se retouche pas (D58).

Deux mots que l'écran des paiements refuse de confondre, jusque dans ses en-têtes : **dû** est de
l'argent qui manque au magasin, **détenu** est de l'argent qu'il a et qui peut repartir. Les
additionner ferait un chiffre qui ne veut rien dire.
