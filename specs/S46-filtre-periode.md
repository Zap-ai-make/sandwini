# S46 — Filtrer les ventes et les paiements par période

```
Statut     : terminée
Périmètre  : post-MVP
Dépend de  : S8, S9, S44
```

---

## Objectif

Deux registres qui grossissent — les ventes, les paiements — se bornent dans le
temps. « Combien ce mois-ci » se demande tous les jours et ne se lisait nulle
part : les quatre chiffres de tête sommaient le registre entier depuis sa
première vente, et les deux listes de paiements ne se rangeaient que par
ancienneté.

Aucune capacité métier nouvelle, aucune écoute Firestore de plus, aucun champ
ajouté à un document. Tout se filtre en mémoire sur ce qui est déjà chargé.

---

## Critères d'acceptation

### Le choix de la période

- [x] Quatre préréglages — Tout · Ce mois-ci · Mois dernier · Cette année — et
      une plage libre « Du… au… » qui ne déplie ses deux dates qu'une fois
      choisie
- [x] Les puces reprennent la classe `.filtre` déjà posée à côté des statuts,
      donc la cible tactile de 44 px sous 768 px (`DESIGN.md` §11)
- [x] `<input type="date">` natif, comme la Caisse et les Reçus : pas de
      dépendance ajoutée (règle 1), sélecteur connu, clavier et traduction
      gratuits
- [x] La plage n'est bornée que du côté rempli : saisir la date de début ne vide
      pas la liste parce que la fin est encore vide
- [x] Une fin antérieure au début le **dit** au lieu d'être corrigée en douce —
      la liste vide a alors une cause écrite
- [x] Les bornes sont semi-ouvertes `[début, fin[`, et le dernier jour d'une
      plage y entre en entier
- [x] Les dates se lisent en heure locale, jamais en UTC : `new Date("2026-09-01")`
      aurait décalé la borne d'un jour selon le fuseau de qui regarde

### L'écran Ventes

- [x] La période borne **les quatre cartes et le tableau** — c'est le périmètre
      de ce dont on parle
- [x] La recherche et les pastilles de statut ne touchent que le tableau, et le
      comptage « 3 ventes sur 12 » dit déjà leur effet ; leur dénominateur est
      la période, pas le registre entier
- [x] Chaque carte porte le nom de la période. Une seule mention au-dessus du
      lot suffirait sur bureau ; à 390 px les cartes se rangent en deux sur
      deux, et un montant qu'on croit total alors qu'il porte sur un mois est
      une erreur qui ne se voit pas
- [x] Le filtre est posé **au-dessus des cartes**, pas dans l'en-tête du tableau
      avec la recherche : rangé en bas, on l'actionnerait à 390 px sans voir
      bouger ce qu'il change
- [x] Une période vide ne déclenche pas « enregistrez votre première vente » :
      l'état vide du registre se juge sur le registre entier

### L'écran Paiements

- [x] Une ligne paraît si elle a **reçu un versement** dans la période — pas si
      la vente y a été conclue
- [x] L'acompte encaissé au comptoir étant lui-même un versement daté du jour de
      la vente, une vente de septembre entre d'elle-même dans septembre : une
      seule règle, pas deux
- [x] Le filtre s'applique avant le partage entre dettes et tranches, donc les
      deux en-têtes (« 1 vente · 415 000 FCFA dus ») le suivent d'eux-mêmes
- [x] Les montants ne sont pas recoupés par la période : un reste dû est un
      état, pas un flux. On choisit quelles lignes paraissent, jamais ce
      qu'elles valent
- [x] Les deux états vides distinguent « tout est soldé » de « aucun versement
      sur cette période », et renvoient vers « Tout »

### Hors ligne (D66)

- [x] Une vente ou un versement **sans date** passe toutes les périodes. Son
      horodatage viendra du serveur ; le masquer ferait disparaître l'écriture
      qu'on vient de saisir, au moment précis où l'on vérifie qu'elle est passée
- [x] Aucune écoute nouvelle, aucune requête bornée par date : changer de mois
      ne demande rien au réseau

---

## Hors périmètre

- **Aucun agrégat serveur.** Les quatre chiffres restent lus, jamais stockés
  (D61), et sans marge (D2).
- **Aucune période dans l'URL.** Un lien « ce mois-ci » ouvert le mois suivant
  poserait une question à laquelle cet écran n'a pas besoin de répondre ; la
  période est un état local, comme la recherche et les statuts juste à côté.
- **Aucun chiffre d'encaissement par période.** « Ce qu'on a encaissé en
  septembre » est un flux, et il vit à la Caisse. Ici on borne un encours.
- **Un crédit sans le moindre acompte** ne porte aucun versement : aucune
  période ne le montre, seul « Tout » le garde. C'est la lecture littérale d'un
  écran de paiements — personne n'a payé, il n'y a pas de paiement à dater — et
  c'est un arbitrage, pas un oubli.

---

## Vérification

- `lib/domain/periode.test.ts` — bornes, passage de janvier à décembre, plage
  incomplète, plage inversée, lecture locale des dates, date absente
- `lib/domain/vente.test.ts` — `paiementsDeLaPeriode` : vente ancienne remise en
  vue par un versement récent, vente de la période entrée par son acompte,
  crédit sans versement écarté, versement sans date retenu, montants non
  recoupés
- `e2e/ventes.spec.ts` — les chiffres suivent la période, « Mois dernier » vide
  la liste et « Tout » la ramène, la plage inversée s'annonce
