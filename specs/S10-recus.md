# S10 — Reçus imprimables hors-ligne

```
Statut     : terminée
Périmètre  : MVP
Dépend de  : S8, S9
```

---

## Objectif

À la fin d'une vente ou d'un versement, le client repart avec un reçu — imprimé ou en PDF — portant le
numéro, le détail et le reste dû. Y compris quand la boutique n'a pas de réseau ce jour-là.

---

## Critères d'acceptation

- [x] Deux types au MVP : reçu de vente de moto et reçu de versement
- [x] Contenu obligatoire (`prompt.md` §10) : entreprise, boutique, adresse, téléphone, numéro du reçu, date, client, détail (marque, modèle, châssis), montant, moyen de paiement, total payé, reste dû, nom de l'opérateur
- [x] Les mentions légales des paramètres entreprise s'impriment si elles sont renseignées (D11)
- [x] Impression directe par le navigateur, avec une feuille de style dédiée : pas de menu, pas de navigation, marges correctes sur A5 et A4
- [x] **Le PDF sort de la boîte d'impression du navigateur** (« Enregistrer au format PDF »), pas d'une bibliothèque cliente — arbitré en D60, et c'est ce qui garantit que le fichier et le papier ne peuvent pas diverger
- [x] **Tout fonctionne hors ligne** : aucune police distante, aucune image distante, le logo servi depuis le document `entreprise/profil` où il voyage encodé en `data:` (D35) — vérifié par un test Playwright réseau coupé
- [x] Partage du récapitulatif via l'API Web Share quand le navigateur la propose ; sinon, copie dans le presse-papiers. Les deux sont natives, donc disponibles sans réseau
- [x] Un reçu se réimprime à l'identique depuis la fiche vente, à tout moment — le reçu de vente par son bouton, chaque versement ultérieur par le sien
- [x] Écran « Reçus » (`/motos/recus`) filtrable par numéro, date et client
- [x] Le reçu d'un versement porte le numéro dérivé de la vente, `PTG-2608-0042/V2` (D57) ; l'acompte du jour de la vente n'a pas de reçu à lui, il est porté par le reçu de vente (D52)
- [x] Une vente renumérotée par la réconciliation (S7) se réimprime avec son numéro définitif, et le papier lui-même signale l'écart avec le numéro déjà remis au client (D44)
- [x] La nouvelle route est déclarée dans `ECRANS_HORS_LIGNE` (D40) ; la vue d'un reçu est un panneau ouvert par `?recu=`, pas une route dynamique (D39)
- [x] États couverts : aucun reçu, aucune correspondance, reçu introuvable, échec du partage, chargement, hors ligne, sans boutique

---

## Hors périmètre

La facture, troisième type prévu au §10 — le MVP livre les deux reçus qui accompagnent un paiement,
la facture est un document commercial distinct qui attend un besoin exprimé. Le reçu de vente de
pièces (S21). L'envoi WhatsApp du récapitulatif (S14) : ici le texte se partage ou se copie, le lien
`wa.me` pré-rempli et les modèles de message paramétrables viennent avec S14.

**La pièce jointe PDF partagée en un geste** (`navigator.share({ files })`). Elle demanderait la
bibliothèque écartée en D60, et donc une seconde composition du reçu qui devrait rester identique à
la première. Si le besoin s'exprime vraiment, il s'exprimera avec S14, où l'envoi au client est le
sujet — et le choix se rejugera là, avec sa raison sous les yeux.

---

## Notes techniques

Le reçu est du HTML rendu par React et imprimé par le navigateur : c'est la solution qui coûte le
moins et qui marche hors ligne par construction (`ARCHITECTURE.md` §1, échelle 3).

**Le PDF vient de la même boîte d'impression.** C'est l'arbitrage de la spec, consigné en D60 : une
bibliothèque cliente aurait demandé un import dynamique, une mise en cache par le service worker, et
surtout une seconde composition du reçu en appels de dessin — un document financier rendu deux fois,
qui doit rester identique aux deux endroits. « Enregistrer au format PDF » est proposé par Android
comme par un ordinateur, fonctionne sans réseau, et compose depuis notre feuille de style. Le
partage, lui, porte le récapitulatif en texte (§11, message 3) via Web Share ou le presse-papiers.

**Le logo voyage dans Firestore, pas dans Storage** (D35). Storage n'a pas de file d'attente hors
ligne (D14) : un logo servi depuis là demanderait une requête au moment d'imprimer, et le premier
reçu sorti sur un appareil neuf en coupure n'aurait pas d'en-tête. Il est donc réduit sur l'appareil
et encodé en `data:` dans `entreprise/profil`, d'où il arrive avec le cache Firestore. S'il manque,
le reçu s'imprime sans logo plutôt que d'échouer : un reçu sans logo reste un reçu valable, un reçu
qui ne s'imprime pas ne l'est pas.

**Rien n'est figé à l'impression, et c'est le point de conception de la spec** (D61). L'idée de
stocker le total payé et le reste dû « tels qu'ils étaient ce jour-là » se défend tant qu'on ne
regarde pas ce dont ils dérivent : le prix convenu ne bouge plus après la vente, et un versement ne
se modifie ni ne se supprime, pour personne (D58). Le reste dû au jour d'un reçu est donc exactement
la somme des versements jusqu'à sa date — un calcul, pas un souvenir. Le stocker créerait une
seconde copie de la vérité, qui ne peut que finir par la contredire.

**Les numéros.** Un reçu de vente porte le numéro de la vente ; un reçu de versement porte
`PTG-2608-0042/V2`, dérivé de la vente et de son rang (D57). Le numéro imprimé est **reconstruit sur
`vente.numero`** et non recopié du versement : une vente renumérotée par le serveur (D44) se
réimprime avec son numéro définitif, et le papier porte alors la phrase qui explique au client
pourquoi son ancien reçu ne fait plus foi. L'écart se repère en comparant `numero` et `numeroInitial`
— `estRenumerotee` existait déjà.

**L'écran et son panneau.** `/motos/recus` s'ajoute à `ECRANS_HORS_LIGNE` dans `next.config.ts`
(D40) — une route de plus est une ligne de plus, et l'oubli ne se voit qu'en coupure. La vue d'un
reçu est un panneau ouvert par `?recu=<clé>`, comme les fiches moto et vente : une route dynamique
`/recus/[id]` obligerait le navigateur à demander au serveur un document que le service worker n'a
jamais vu (D39). Le paramètre `recu` rejoint donc la liste ignorée par le cache de précharge dans
`app/sw.ts`.

La clé d'un reçu est `<venteId>` pour un reçu de vente et `<venteId>~<versementId>` pour un reçu de
versement : un reçu n'a pas d'identifiant à lui puisqu'il n'est pas un document, il est désigné par
ce dont il rend compte — et les deux identifiants sont connus de l'appareil qui a saisi.

Le calcul vit dans `lib/domain/recu.ts`, sans Firestore ni React ; le rendu papier dans
`components/Recu.tsx`, qui ne lit rien et reçoit tout. La feuille d'impression repasse la palette en
clair : un reçu sorti depuis un téléphone réglé en sombre sortait blanc sur noir, illisible sur un
comptoir et une cartouche par reçu.
