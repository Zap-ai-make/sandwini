# S56 — Le portail du prestataire : un lien, et rien d'autre

```
Statut     : à valider
Périmètre  : post-MVP
Dépend de  : S30 (dépôt prestataire), S53 (les papiers d'une moto)
Bloquée par: S53 — ce portail ne lit que ce que S53 écrit
```

---

## Objectif

Le commanditaire, le 15 octobre 2026 : « *chaque prestataire doit avoir un lien
de suivi de tous les dossiers pris avec l'entreprise, l'historique, en cours. Et
limité à ça uniquement, les avances prises, soldes…* »

Aujourd'hui, un prestataire qui veut savoir où il en est appelle le magasin. Le
magasin ouvre l'écran des dossiers, filtre, lit à voix haute. Trois personnes
pour une question qui a une réponse écrite.

Ce portail est **la seule partie du produit accessible sans compte**. C'est ce
qui en fait un sujet d'architecture et pas un écran de plus.

---

## Les arbitrages du commanditaire

Tranchés le 15 octobre 2026.

| # | Question | Réponse |
|---|----------|---------|
| 1 | Comment le prestataire entre-t-il ? | **Un lien secret, sans compte.** Pas de mot de passe à créer ni à faire retenir à quelqu'un qui n'est pas de la maison. |
| 2 | Que voit-il ? | **Ses dossiers en cours et leur historique**, **les avances versées et le solde dû**, **le nom du client**, **la moto et son châssis**. |
| 3 | Que ne voit-il pas ? | Tout le reste. « Limité à ça uniquement. » |

### Ce que l'arbitrage 1 coûte, et qu'il faut dire

**Le lien est le mot de passe.** Qui l'a entre. Un téléphone perdu, un lien
transféré dans un groupe WhatsApp, et le suivi d'un prestataire est lisible par
quelqu'un d'autre.

Les contreparties retenues :

- Le jeton est **long et tiré au hasard** — 32 octets, pas un identifiant
  Firestore ni un numéro de téléphone.
- Il est **régénérable depuis la fiche du prestataire**, et régénérer **révoque**
  l'ancien lien immédiatement.
- Il ne donne accès **qu'à ce prestataire**, jamais à une liste.
- La page n'est **pas indexable** : `noindex`, et aucun lien vers elle depuis le
  produit.

Ce qui est accepté en connaissance de cause : ce lien n'identifie pas une
personne, il identifie un prestataire. Il n'y a pas de trace de *qui* a regardé.

### Ce qui n'a pas été demandé et qui est tranché ici

- **Le prestataire ne peut rien écrire.** Pas de « j'ai fini », pas de
  commentaire. C'est une page de lecture. Un geste d'écriture depuis l'extérieur
  demanderait une identification, et l'arbitrage 1 l'a écartée.
- **Pas de notification.** Le lien se consulte, il ne pousse rien.

---

## L'architecture : aucune lecture publique de Firestore

C'est la décision centrale de cette spec.

### Ce qu'on ne fait pas, et pourquoi

Une collection lisible sans compte — `suiviPrestataire/{jeton}` avec
`allow read: if true` — serait le chemin court. Il est refusé pour deux raisons
qui se cumulent :

1. **Les règles Firestore ne savent pas joindre.** Pour montrer les dossiers
   d'un prestataire il faut lire des documents de `ventesMotos/*/documents`, les
   ventes, les motos et les clients. Aucune règle ne peut autoriser « ces
   documents-là, parce que ce jeton-ci ». Il faudrait donc **recopier** tout le
   suivi dans le document public — et tenir cette copie à jour à chaque
   mouvement, par des déclencheurs. C'est la contradiction B de S53 qu'on
   réintroduirait, à l'extérieur cette fois.
2. **Le mur de D2 deviendrait une affaire de vigilance.** Une copie publique est
   un endroit où un champ de coût peut se glisser un jour par inadvertance.

### Ce qu'on fait

Une **fonction HTTP** — `suiviPrestataire`, sur le modèle de `amorcerResponsable`
qui existe déjà — reçoit le jeton, le résout, lit ce qu'il faut avec les droits
du serveur, et renvoie **exactement** la charge utile prévue.

```
  navigateur du prestataire
        │  GET /suivi/<jeton>
        ▼
  page publique (hors (app), sans session, sans service worker)
        │  appel à la fonction
        ▼
  suiviPrestataire (Cloud Function)
        │  lit prestataires, documents, ventes, motos, clients
        │  n'ouvre JAMAIS prive/
        ▼
  { prestataire, enCours[], historique[], argent{} }
```

Trois propriétés que cette forme donne gratuitement :

- **Firestore reste fermé.** Aucune règle n'est assouplie ; un test de règles
  prouvera qu'un client non authentifié ne lit toujours rien.
- **Le mur de D2 tient par construction.** La fonction ne lit pas `prive/` ;
  ce n'est pas une précaution, c'est l'absence de code pour le faire.
- **La charge utile est une frontière nommée.** Ce que le prestataire voit est
  un type TypeScript, pas le résultat d'un filtrage dispersé dans des composants.

### Le coût, et il est réel

Le portail est **en ligne seulement**. Pas de cache, pas de service worker, pas
de lecture hors réseau. C'est acceptable : le prestataire consulte depuis chez
lui, pas depuis un comptoir en coupure. Mais c'est une exception à D40 et elle
doit être écrite.

La page publique est aussi **exclue de `ECRANS_HORS_LIGNE`** : y entrer une route
à jeton variable n'aurait aucun sens, et une entrée qui rend 404 empêche le
service worker de s'installer — le défaut trouvé par l'audit du 15 octobre.

---

## Ce que le modèle gagne

```
prestataires/{id}
  jetonSuivi: string | null     ← 32 octets en base64url, ou null si jamais émis
  jetonEmisLe: Timestamp | null
```

Le jeton vit sur la fiche du prestataire. Le régénérer écrase l'ancien : il n'y
a jamais deux liens valides pour un même prestataire.

**Le jeton n'est pas un secret côté serveur** — il est dans l'URL, donc dans
l'historique du navigateur du prestataire. Il n'est donc pas haché : le hacher
donnerait l'illusion d'une protection que le canal n'offre pas.

### La charge utile

```ts
type SuiviPrestataire = {
  prestataire: { nom: string };
  enCours: LigneSuivi[];
  historique: LigneSuivi[];
  argent: { avances: number; solde: number };
};

type LigneSuivi = {
  numeroVente: string;
  client: string;          // arbitrage 2
  moto: string;            // marque, modèle
  chassis: string;
  deposeLe: Date;
  revenuLe: Date | null;
  joursDehors: number;
};
```

Rien d'autre ne traverse. Pas d'identifiant Firestore, pas de prix de vente,
pas de coût, pas de marge, pas de téléphone du client.

### Les avances et le solde

`avances` est la somme des avances versées à ce prestataire. `solde` est ce que
l'entreprise lui doit encore.

**Le solde n'est calculable que si le produit sait ce qu'un travail coûte**, et
il ne le sait pas aujourd'hui : S30 n'enregistre qu'une avance, jamais un prix
convenu ni un règlement final. Deux possibilités, et il faut trancher à la
relecture :

- **(a)** Le portail n'affiche que les avances versées, et le mot « solde »
  attend qu'un prix convenu existe.
- **(b)** S56 ajoute un prix convenu par carte grise et un règlement final, et
  le solde devient calculable.

Cette spec retient **(a)** par défaut : afficher un solde faux à un fournisseur
est pire que ne pas l'afficher. **(b)** est une spec à part, et elle touche la
caisse.

---

## Critères d'acceptation

### Le lien

- [ ] La fiche d'un prestataire porte un bouton « Créer le lien de suivi », puis affiche le lien avec un geste pour le copier.
- [ ] Régénérer le lien **révoque** l'ancien : l'ancienne URL rend « lien expiré », pas une page vide ni une erreur technique.
- [ ] Un prestataire sans jeton n'a pas de page : l'URL inventée rend « lien inconnu », sans dire si le prestataire existe.
- [ ] Le jeton fait au moins 32 octets d'aléa. Un test le fige.

### La page

- [ ] Elle s'ouvre **sans session** : un navigateur jamais connecté la voit.
- [ ] Elle montre les cartes grises en cours, depuis combien de jours, et l'historique de celles rendues.
- [ ] Elle montre le nom du client, la moto et le châssis de chaque ligne.
- [ ] Elle montre le total des avances versées.
- [ ] Elle porte `noindex`, et aucun écran du produit n'y renvoie par un lien.
- [ ] Elle se lit sur un téléphone d'entrée de gamme, en clair et en sombre.
- [ ] Hors réseau, elle dit qu'elle a besoin du réseau. Elle ne reste pas blanche.

### Ce qui ne doit pas fuir

- [ ] La charge utile ne contient **aucun** prix de vente, coût, marge ni montant autre que les avances de ce prestataire. Un test unitaire sur le constructeur de la charge le fige.
- [ ] Un test de règles prouve qu'un client **non authentifié** ne lit toujours rien de Firestore — la fonction est la seule porte.
- [ ] Le jeton d'un prestataire ne donne accès à aucune ligne d'un autre prestataire. Un test de la fonction le fige.
- [ ] La fonction ne lit jamais `prive/`. Un test le prouve en refusant la lecture au niveau des droits du service.

### Ce qui ne doit pas casser

- [ ] La route publique n'entre pas dans `ECRANS_HORS_LIGNE`, et le service worker s'installe toujours : les entrées préchargées répondent toutes.
- [ ] La suite ciblée reste verte : unitaires, règles, et le fichier e2e des dossiers. **Pas de passe complète.**

---

## Hors périmètre

- **Toute écriture depuis le portail.** Lecture seule, par l'arbitrage 1.
- **Le prix convenu et le règlement d'un prestataire.** Voir la possibilité (b)
  ci-dessus : c'est une spec à part, qui touche la caisse et les postes de
  dépense de S55.
- **Un portail pour le client.** Même mécanique, autre public, autre spec.
- **Toute trace de consultation.** Le lien n'identifie pas une personne ; un
  journal des visites donnerait l'illusion du contraire.

---

## Notes techniques

### La route

`app/suivi/[jeton]/page.tsx`, **hors du groupe `(app)`** : pas de coquille, pas
de navigation, pas de `FournisseurSession`, pas de périmètre. C'est la même
famille que `app/hors-ligne` et `app/(auth)/login`, et elle doit le rester — un
import de `usePerimetre` dans ce sous-arbre serait un défaut de périmètre.

### La fonction

`onRequest`, région inchangée, CORS fermé au domaine du produit. Elle reçoit le
jeton **dans le corps**, jamais dans l'URL de la fonction : une URL se retrouve
dans les journaux d'accès, un corps non.

Le rendu de la page est côté serveur : la page Next lit le jeton de son segment,
appelle la fonction, et rend le résultat. Le jeton ne traverse donc jamais le
navigateur du prestataire autrement que dans l'URL qu'il a déjà.

### La recherche du prestataire par son jeton

`where('jetonSuivi', '==', jeton)` sur `prestataires`, avec un index. Le jeton
étant unique par construction, la requête rend zéro ou un document.

Un jeton inconnu et un jeton révoqué rendent **le même** message : « ce lien
n'est plus valide ». Les distinguer dirait à qui essaie des liens au hasard
lequel a existé.
