# S25 — Annuler et corriger une vente de moto

*Rédigée le 31 octobre 2026, à partir des réponses du commanditaire du même jour.
Reprend l'étape 7 de `CAHIER-DU-RESTE.md` et D10, et revient sur l'arbitrage Q4
du 11 septembre 2026 (voir D109).*

## Ce que ça change

Aujourd'hui, une vente saisie de travers reste de travers. Le commanditaire veut,
sur chaque vente, deux gestes :

- **Annuler** — la vente est défaite : la moto revient en stock, l'argent
  encaissé ressort de la caisse.
- **Modifier** — le formulaire de vente s'ouvre avec tous les champs remplis ; on
  corrige et on enregistre.

## Les arbitrages (31 octobre 2026)

| Question | Réponse |
|---|---|
| Annuler, c'est quoi ? | Annuler la vente : moto en stock, argent sorti de la caisse, numéro jamais réutilisé, vente visible avec la mention « Annulée ». |
| Qui ? | Le **responsable et le gérant de la boutique** de la vente. *Revient sur Q4 (responsable seul) — D109.* |
| Motif ? | **Obligatoire** pour annuler. |
| Modifier : quel numéro ? | **Un nouveau numéro.** La correction annule l'ancienne vente et enregistre la nouvelle, en un seul lot. On réimprime le reçu. |
| Carte grise déjà chez un prestataire ? | **On annule quand même.** Le dossier reste au classeur, marqué « vente annulée », jusqu'au retour de la carte. |

## Les trois principes (inchangés depuis D10)

1. **Rien ne s'efface.** La vente fautive reste ; ce qui la neutralise est écrit à
   côté, et les deux se citent.
2. **Un versement ne se modifie ni ne se supprime.** L'argent ressort par un
   encaissement de sens inverse.
3. **Tout est attribué.** Qui, quand, pourquoi.

## Le modèle

**`ventesMotos/{id}`** gagne quatre champs, posés ensemble et une seule fois :

- `annulee: true`
- `annuleeLe` — date de l'appareil (D38)
- `annuleePar` — `{ uid, nom }`
- `motifAnnulation` — texte, 1 à 200 caractères

Une correction pose en plus `remplaceeParId` (l'identifiant de la nouvelle vente).
La nouvelle vente porte `remplaceId`. Les ventes d'avant S25 n'ont aucun de ces
champs : leur absence vaut « non annulée ».

**L'argent.** Pour chaque versement de la vente, un `encaissements` de sens
`sortie`, origine `annulation_vente`, du même montant et du même moyen, libellé
« Remboursement vente 0042 », daté du jour de l'annulation. Il hérite du
`categorieTranches` de l'entrée qu'il neutralise : rendre un dépôt de tranches ne
touche pas la recette. Les versements eux-mêmes ne bougent pas.

**La moto.** Elle repasse `en_stock`. Dans une correction qui garde la même moto,
elle ne passe pas par `en_stock` : elle prend directement le statut de la
nouvelle vente (un lot ne réécrit pas deux fois le même document).

**Le dossier de carte grise.**
- Pas encore parti (aucun dépôt, aucun prestataire) : il passe à
  `non_applicable` et quitte le classeur.
- Déjà parti : il reste, avec `venteAnnulee: true`, et le classeur l'affiche
  marqué « vente annulée ».

## Ce qu'une vente annulée devient à l'écran

- **Liste des ventes** : elle reste, avec une pastille « Annulée », pour être
  retrouvée par la recherche.
- **Fiche de la vente** : la mention, le motif, l'auteur et la date ; plus aucun
  geste (ni encaisser, ni remettre, ni modifier, ni annuler). Si elle a été
  corrigée, un lien vers la vente qui la remplace.
- Elle **sort** des paiements (dettes et tranches), des chiffres du mois, des
  cartes de la liste des ventes, des dernières ventes, de ce qui demande une
  décision, de la journée du gérant et de l'historique d'un client.
- **Caisse** : rien à filtrer ; les sorties de remboursement apparaissent d'elles-mêmes.

## Les gestes

**Annuler** — bouton « Annuler la vente » sur la fiche. Une confirmation rappelle
ce qui va se passer (moto en stock, N FCFA rendus), demande le motif, et
enregistre en un seul lot hors ligne (D76).

**Modifier** — bouton « Modifier » sur la fiche. La modale de vente s'ouvre en
mode correction : moto, client, prix, mode, montant reçu (= le total déjà versé),
moyen, carte grise, casque. On peut changer la moto. « Enregistrer la correction »
écrit en un seul lot : l'annulation de l'ancienne (motif « Corrigée par la vente
0043 »), puis la nouvelle vente avec son numéro, son dossier, son versement. Le
numéro est tiré du compteur de la **boutique de la vente**, même depuis « Toutes
les boutiques ».

Aucun des deux gestes n'est proposé sur une vente déjà annulée.

## Les règles

- `ventesMotos` : une branche `annulationValide` — seuls changent les champs
  d'annulation (et `remplaceeParId`), `annulee` passe de absent à `true`, motif
  non vide, auteur = appelant, `peutVendrePour(boutiqueId)`. Aucune autre mise à
  jour n'est acceptée sur une vente annulée. La création accepte `remplaceId`.
- `encaissements` : l'origine `annulation_vente`, en `sortie` seulement.
- `motos` : le retour `vendue`/`reservee` → `en_stock` par le gérant ou le
  responsable de la boutique.
- `dossiersCarteGrise` : `venteAnnulee` accepté.
- Des tests de règles pour chaque branche, dont : un gérant d'une autre boutique
  ne peut pas annuler ; une vente annulée ne se ré-annule pas ; un motif vide est
  refusé ; une vente annulée n'accepte plus de versement.

**Déploiement** : les règles doivent partir sur `sandwini` avant que le geste ne
serve, sinon il échoue au serveur (cf. la mémoire « règles vertes en local,
jamais déployées »). Le déploiement se demande au commanditaire.

## Ce qui prouve que c'est fait

- [ ] Domaine : `annulationDeVente` et la correction, testés (TDD, D103).
- [ ] Les agrégats ignorent les ventes annulées, testé fonction par fonction.
- [ ] Règles : les branches et leurs refus, testés sur émulateur.
- [ ] Un test de bout en bout ciblé : annuler une vente payée, la moto revient en
      stock, la caisse montre la sortie.
- [ ] Rien n'a été supprimé : aucun `delete` dans le code ni dans les règles.
- [ ] Règles déployées sur `sandwini`, avec l'accord du commanditaire.
