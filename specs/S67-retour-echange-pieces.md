# S67 — Le retour (et l'échange) d'une vente de pièces

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S21, S64
```

---

## Objectif

Un client revient avec une pièce. Le gérant doit pouvoir la **reprendre** : la
pièce retourne en stock, l'argent ressort de la caisse, et une trace en rend
compte. Tout est géré par le gérant, sans arbitrage du responsable (décision du
commanditaire). L'**échange** se fait en deux gestes — un retour, puis une
nouvelle vente — parce qu'économiquement ce sont deux écritures distinctes.

---

## Ce qui est sensible, et comment on le tient

Un retour fait **ressortir de l'argent** et **remonter du stock**. Les deux sont
des faits comptables, et ce produit ne retouche jamais un fait : une vente est
immuable (`ventesPieces` : `update, delete: if false`), un encaissement aussi
(D58, S22). Un retour est donc une **contre-passation** — de nouveaux documents,
jamais une modification de la vente d'origine. La vente reste gravée telle
qu'elle a eu lieu ; le retour la cite.

---

## Les arbitrages (défauts annoncés — le commanditaire a dit « lance-toi »)

| # | Arbitrage | Pourquoi |
|---|-----------|----------|
| 1 | **Un retour se fait contre une vente passée**, ouverte depuis l'historique. On ne peut pas reprendre ce qui n'a pas été vendu, et le prix du retour est celui de la vente — snapshot, pas relu. | Sans la vente d'origine, le prix de remboursement serait deviné, et on rembourserait au tarif du jour une pièce vendue moins cher. |
| 2 | **Remboursement au prix vendu** (`prixUnitaire` recopié de la ligne), par ligne, quantité au plus celle vendue sur cette ligne. | La ligne de vente porte déjà ce prix figé ; le retour le reprend. |
| 3 | **Nouveau type de mouvement `retour_vente`** (signe +1), et non `entree` (un arrivage) ni `ajustement_inventaire` (une correction de comptage). | Un retour est un fait distinct ; le ranger ailleurs mentirait sur l'histoire du stock (D82). |
| 4 | **Nouvelle origine d'encaissement `remboursement_piece`** (`sens: sortie`), et non `autre`. | La caisse doit nommer un remboursement, pas le cacher sous « Autre ». |
| 5 | **Nouvelle collection `retoursPieces`**, immuable, qui porte le lien vers la vente, les lignes reprises, le total remboursé, le moyen, et un motif facultatif. | C'est elle qui porte le reçu de retour et qui permet à la supervision de **retrancher** le retour de la recette et de la marge. |
| 6 | **La recette et la marge de la supervision se calculent nettes des retours.** `pesee` lit `retoursPieces` et soustrait leur total et leur marge reprise. | Sans cela, la supervision gonflerait la recette d'une vente annulée — exactement ce que le commanditaire veut voir juste. |
| 7 | **L'échange = un retour puis une vente**, et la confirmation du retour propose « Vendre maintenant ». Pas de panier d'échange combiné. | Deux écritures comptables honnêtes valent mieux qu'un net masqué ; et le geste reste simple. |
| 8 | **Aucun garde-fou de sur-retour** entre plusieurs retours partiels d'une même vente, en v1. La quantité reprise par ligne est bornée par la quantité **vendue sur cette ligne**, pas par ce qui reste après des retours antérieurs. | Le vrai garde-fou (cumul des retours) demande de lire tous les retours d'une vente à la saisie ; relevé, pas fait — le comptoir est tenu par une personne de confiance (décision du commanditaire : « tout est géré par le gérant »). |

---

## Le modèle

```ts
retoursPieces/{id} {
  numero                        // {CODE}-{AAMM}-{NNNN}, compteur partagé (comme les ventes)
  venteId, venteNumero          // la vente d'origine, citée
  boutiqueId, date
  lignes: { pieceId, reference, designation, quantite, prixUnitaire, prixAchatUnitaire, total }[]
  total                         // somme remboursée
  moyenPaiement                 // par quoi on rembourse
  motif                         // facultatif : "défaut", "erreur de référence"…
  ...audit
}
```

**Tout part en un seul lot** : le retour, un `mouvementsPieces` de type
`retour_vente` par ligne (portant le numéro dans sa note), et un `encaissements`
de `sens: sortie`, origine `remboursement_piece`. Un stock qui remonte sans
argent rendu — ou l'inverse — serait un mensonge, et hors ligne le lot voyage
comme une écriture unique.

---

## Ce que les règles tiennent, et ce qu'elles ne peuvent pas tenir

Tenu : qui écrit (le comptoir de la boutique), la forme d'une ligne, le nombre
de lignes, le format du numéro, et l'**immuabilité** (`update, delete: if
false`). Le nouveau type `retour_vente` et la nouvelle origine
`remboursement_piece` sont ajoutés aux enums, et **prouvés par des tests de
règles** — un gérant reprend chez lui, échoue chez l'autre, et ne retouche
jamais un retour enregistré.

Pas tenu (et figé par des tests qui l'affirment) : que la quantité reprise ne
dépasse pas ce qui reste vendable (une règle ne somme pas une collection), et
que le lot lie réellement le retour, ses entrées de stock et son décaissement
(le batch le tient, pas la règle).

---

## Critères d'acceptation

- [x] Depuis le reçu d'une vente, « Retour / échange » ouvre un écran qui liste
      les lignes de la vente ; le gérant choisit lesquelles reprendre et en
      quelle quantité, et le total remboursé se calcule.
- [x] À la validation : le stock des pièces reprises **remonte** (type
      `retour_vente`), un **décaissement** apparaît au journal de caisse
      (« Remboursement »), et un **reçu de retour** imprimable est produit.
- [x] La vente d'origine **n'est pas modifiée** ; elle montre les retours faits
      sur elle.
- [x] La **supervision** retranche le retour de la recette et de la marge des
      pièces.
- [x] Les règles : création par le comptoir de la boutique, immuabilité,
      nouveaux type et origine — **tests de règles verts**.
- [x] Le domaine calcule la sélection, le total et ses refus — **un test par
      arbitrage**.
- [x] États couverts (vide, erreur de saisie, sans boutique) — `DESIGN.md` §10.
- [x] Rendu regardé — retour complet vérifié (reçu, stock +1, caisse −montant, supervision nette) ; le reçu partage la facture déjà vue en sombre (D77).

---

## Hors périmètre

- Le **panier d'échange combiné** (arbitrage 7) : l'échange est un retour + une
  vente.
- Le **cumul des retours** d'une même vente comme garde-fou (arbitrage 8).
- La **contre-passation d'une vente de moto** (S25) : même appareillage, autre
  métier.
