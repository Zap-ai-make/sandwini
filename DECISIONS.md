# DECISIONS.md — Registre des choix

Exigé par le cahier des charges (`prompt.md` §0) : toute ambiguïté tranchée sans arbitrage humain est
consignée ici, avec sa raison. Une décision se relit, se conteste et se révise ; elle ne se devine pas.

---

## D1 — Hébergement : Vercel
`prompt.md` §2 (« Firebase Hosting ou Vercel, au choix, documenter »)

Vercel exécute le rendu serveur de Next.js App Router nativement, ce dont les pages publiques
`/suivi` et `/prestataire` ont besoin (§2 : rendu serveur obligatoire via Admin SDK). Firebase Hosting
seul ne sait pas faire de SSR ; il faudrait passer par App Hosting ou une Cloud Function de rendu,
soit une pièce de plus pour le même résultat.

*Conséquence :* Firebase reste la base de données, l'auth, le stockage et les Cloud Functions ; seule
la façade web est chez Vercel. La clé de service Admin SDK vit dans les variables d'environnement
Vercel, jamais dans le dépôt (`SECURITY.md` §2). Revenir sur ce choix reste possible : rien dans le
code ne dépend de Vercel en dehors de la configuration de déploiement.

## D2 — Coûts et marges cloisonnés hors de portée du gérant
`prompt.md` §5.2, §5.4, §8 — **arbitré par le responsable**

Le §8 réserve la marge au responsable, mais le §5.4 plaçait `coutMotoSnapshot` dans le document de
vente que le gérant doit lire pour travailler. Firestore ne sait pas masquer un champ : un document
lisible est lisible en entier. Le modèle est donc corrigé :

```
motos/{id}                     ← lisible par le gérant de la boutique
  /prive/cout                  ← responsable seul : prixAchat, fraisEntree[], coutTotal
ventesMotos/{id}               ← lisible par le gérant de la boutique
  /prive/marge                 ← responsable seul : coutMotoSnapshot, marge
```

*Conséquence :* les écrans du responsable font une lecture de plus par ligne affichée. Les écrans de
saisie du gérant n'y touchent pas et restent fonctionnels hors ligne. Le formulaire d'entrée en stock
écrit dans les deux documents dans le même batch (le gérant peut écrire le coût, cf. D4 — il ne peut
simplement pas le relire).

## D3 — Développement et vérification sur la Firebase Emulator Suite
**arbitré par le responsable**

Auth, Firestore, Storage et Functions tournent en local. Aucun secret n'est nécessaire pour démarrer,
et les règles de sécurité sont testables automatiquement (`@firebase/rules-unit-testing`).

*Conséquence :* un jeu de données de démonstration est versionné pour amorcer les émulateurs. Le
branchement sur un vrai projet Firebase est une étape de déploiement, pas de développement — les
trois environnements `dev` / `staging` / `prod` exigés par `ARCHITECTURE.md` §11 seront trois projets
Firebase distincts.

## D4 — Le gérant peut faire entrer une moto en stock
`prompt.md` §17.2 — **arbitré par le responsable**

C'est le seul choix compatible avec le hors-ligne : une moto qui arrive au comptoir doit pouvoir être
saisie immédiatement, sans dépendre de la disponibilité du responsable.

*Conséquence :* le gérant écrit `motos/{id}` et `motos/{id}/prive/cout` pour sa boutique, mais ne
relit jamais le second (D2). Il ne peut pas se corriger sur le coût après coup — seul le responsable
le peut. Compromis assumé : la saisie n'est pas bloquée, l'information reste cloisonnée.

## D5 — Numérotation hors-ligne : compteur local par appareil, réconciliation au serveur
`prompt.md` §3.3

Format `{CODE_BOUTIQUE}-{AAMM}-{NNNN}`, ex. `PTG-2608-0042`.

Chaque appareil tient un compteur en stockage local, amorcé au plus haut numéro connu pour la
boutique et le mois courant (lu depuis le cache Firestore, qui fonctionne hors ligne). Deux appareils
de la même boutique hors ligne au même moment peuvent produire le même numéro : à la synchronisation,
une Cloud Function détecte le doublon (`boutiqueId` + `numero`) et suffixe le document créé en second
d'un `-B`, `-C`… puis le marque comme renuméroté ; l'application le signale à l'utilisateur.

*Conséquence :* le numéro est lisible, unique après synchronisation, et jamais bloquant hors ligne.
Il n'est pas garanti séquentiel sans trou — un numéro peut manquer si une saisie est abandonnée.
C'est un identifiant de reçu, pas une séquence comptable légale ; si une numérotation continue
certifiée devient obligatoire, ce choix est à revoir (lié à D11).

## D6 — Tokens d'accès public
`prompt.md` §4 (« stockées hashées côté serveur si possible, sinon en clair mais non énumérables »)

32 octets tirés de `crypto.getRandomValues`, encodés en base64url.

- **Token de suivi client** : stocké **en clair** sur `ventesMotos/{id}`. Le cahier des charges exige
  que le gérant puisse renvoyer le lien à tout moment (§11) — un haché ne se renvoie pas. Le document
  n'est lisible que par le responsable et le gérant de la boutique concernée, et la valeur n'est pas
  énumérable.
- **Token prestataire** : stocké dans `prestataires/{id}/prive/token`, **responsable seul**. Le §16
  interdit qu'un gérant lise un token de prestataire ; comme pour D2, le seul moyen dans Firestore est
  de sortir le champ du document.

*Conséquence :* la révocation se fait en régénérant le token (le lien précédent cesse de fonctionner).
Le token client est désactivé automatiquement 30 jours après clôture du dossier, comme exigé au §4.

## D7 — Pas de lecture inter-boutiques pour le gérant au MVP
`prompt.md` §16 (« à trancher, documenter »)

Le gérant ne lit que les motos de sa boutique. Le seul besoin de lecture croisée évoqué par le cahier
des charges est le transfert entrant, et les transferts sont post-MVP (S17). En cas de doute, on
expose le moins (`SECURITY.md` §0).

*Conséquence :* la question se rouvre à S17. L'option pressentie est une lecture seule limitée aux
motos effectivement en transfert vers sa boutique, pas au stock entier des autres.

## D8 — Ordre CMC / dépôt de la carte grise : non contraint
`prompt.md` §17.1

L'attribution d'un CMC et le dépôt de la carte grise chez un prestataire sont deux documents
indépendants du dossier, chacun avec son propre cycle. Aucun ordre n'est imposé par le code.

## D9 — Dépenses hors ventes : le modèle les accepte, l'écran est post-MVP
`prompt.md` §17.3

`encaissements` avec `origine: 'depense'` couvre déjà le besoin structurellement. L'écran de saisie
arrive avec la caisse (S22).

## D10 — Annulation de vente : post-MVP, responsable seul
`prompt.md` §17.4

Opération sensible au sens de `AGENTS.md` règle 6 : elle remet une moto en stock, invalide des reçus
déjà remis au client et touche à de l'argent encaissé. Elle mérite sa propre spec (S25) plutôt qu'un
bouton glissé dans le MVP. Proposition retenue pour S25 : responsable uniquement, moto de retour en
stock, versements marqués remboursés, journalisation complète, jamais de suppression physique.

*Conséquence :* au MVP, une vente erronée se corrige en appelant le responsable. À accepter
explicitement au point d'arrêt 2.

## D11 — Mentions légales : champ libre paramétrable
`prompt.md` §17.5

Les paramètres entreprise portent un champ texte libre « mentions légales / identification fiscale »,
imprimé sur les reçus s'il est rempli. On n'invente pas une obligation fiscale qu'on ne connaît pas.

*Conséquence :* à confirmer avec le responsable avant la mise en production. Si un numéro
d'identification est obligatoire, le champ devient requis — pas de changement de structure.

## D12 — Reprise supérieure au prix convenu : refusée
`prompt.md` §5.6 (`complementVerse = prixConvenu − valeurReprise`)

Une valeur de reprise supérieure au prix de la moto neuve rendrait le complément négatif, c'est-à-dire
une dette du magasin envers le client, que le cahier des charges ne décrit nulle part. La saisie sera
bloquée avec un message explicite plutôt que de produire un montant négatif silencieux.

*Conséquence :* à valider lors de S18. Si le cas se produit réellement en boutique, il faudra le
décrire (remboursement ? avoir ?) avant de le coder.

## D13 — Outillage de test
`ARCHITECTURE.md` §4

- **Vitest** pour la logique métier pure de `lib/domain` (reste dû, marge, statut de dossier,
  numérotation) — c'est là qu'un bug coûte de l'argent réel.
- **`@firebase/rules-unit-testing`** pour les règles Firestore : chaque cloisonnement décidé ici (D2,
  D6, D7) est inutile s'il n'est pas testé.
- **Playwright** pour le rendu des écrans et, surtout, pour la vérification hors ligne — un écran de
  saisie qui ne fonctionne pas sans réseau est un écran cassé (`prompt.md` §3.4).

## D14 — Photos de motos : post-MVP (S19)
`prompt.md` §5.2, §8

Firebase Storage n'a pas de file d'attente hors ligne, contrairement à Firestore. Un envoi de photo
échoue sans réseau. Faire dépendre l'entrée en stock d'une photo contredirait le §3.4 (« chaque écran
de saisie doit fonctionner sans réseau »).

*Conséquence :* le champ `photos` existe dès S5 mais reste vide. S19 apportera une file d'attente
locale (IndexedDB) qui rejoue les envois au retour du réseau — c'est une capacité à part entière, pas
un détail d'un formulaire.

## D15 — Identité de l'entreprise : paramètre, pas constante
`prompt.md` §10

Le nom de l'entreprise, son logo, ses adresses et téléphones sont saisis dans les paramètres par le
responsable, comme le cahier des charges l'exige. Aucun nom commercial n'est écrit en dur dans le
code ou l'interface.

*Conséquence :* le vrai nom de l'entreprise doit être fourni avant qu'un reçu ne soit remis à un
client, mais il ne bloque aucun développement. Nom communiqué depuis : **SDI — Sandwidi et frère**.
Il sera saisi dans les paramètres, pas écrit dans le code.

## D16 — Fichier clients commun à toutes les boutiques
`prompt.md` §3.2, §5.3 — **arbitré par le responsable**

Le §3.2 rattache chaque donnée opérationnelle à une boutique. Un client n'est pas une opération, c'est
une personne : `clients` ne porte donc pas de `boutiqueId`, et une même fiche sert toutes les
boutiques. Un client connu à Pouytenga est retrouvé à Koudougou sans ressaisie, et son historique
d'achats est complet.

*Conséquence assumée :* c'est la seule donnée qu'un gérant voit au-delà de sa boutique. Il peut
consulter les noms et téléphones de toute la clientèle — mais rien de ce qui s'y rattache : ni les
ventes, ni les montants, ni les dossiers des autres boutiques, qui restent cloisonnés par les règles
(D7). Le risque résiduel est l'extraction du fichier de contacts par un gérant, pas une fuite
financière. Si ce risque devient réel, la parade est la recherche stricte par numéro complet, sans
parcours de liste — elle se rajoute sans changer le modèle de données.
