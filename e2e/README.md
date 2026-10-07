# La suite bout en bout — comment la lancer, et comment lire un échec

*Écrit en S27, après la passe qui a montré que sept échecs sur huit avaient deux
causes, et qu'aucune n'était dans le produit.*

---

## Lancer

```bash
cp .env.local.emulateurs .env.local   # avant tout
npm run test:e2e:propre               # émulateurs neufs, build propre, la suite
rm .env.local                         # à la fin, toujours
```

`test:e2e:propre` fait les trois choses qu'on oublie : il purge `.next` (le
développement compile en Turbopack, la production en webpack, et les deux
partagent le répertoire), il compile, puis il démarre **son propre jeu
d'émulateurs** pour la durée de la passe et l'éteint après. Il refuse de partir
si des émulateurs tournent déjà, parce qu'une mesure faite sur ceux d'à côté ne
mesure pas ce qu'on croit.

`npm run test:e2e` reste là pour lancer un test isolé contre les émulateurs
qu'on a sous la main — et pour mesurer volontairement sur des émulateurs
vieillis, ce qui est une mesure légitime, pas un accident.

**Les tests de règles ne se lancent pas d'ici** : `npm run test:regles:isole`.
Un harnais `@firebase/rules-unit-testing` lancé contre l'émulateur partagé en
écrase le jeu de règles.

## Regarder — et ce n'est pas cette suite

**Les captures ne se prennent pas d'ici.** La revue visuelle a son propre outil,
`scripts/captures.mjs`, et il ne vit pas dans `e2e/` : il pilote un navigateur
contre l'application déjà servie, sème son décor au SDK Admin, et n'affirme
rien. C'est la règle 5 d'`AGENTS.md` — *terminé = vérifié, et pour de
l'interface, vérifié veut dire regardé*.

```bash
npm run build && npm run start        # l'application sur :3000, émulateurs allumés
node scripts/captures.mjs             # la série entière, dans captures/
node scripts/captures.mjs paiements   # ou seulement les prises qui matchent
```

Le dépôt sait ce que cet outil vaut et ce que la suite d'à côté ne voit pas : en
S44, une assertion de présence passait au vert devant une modale vide, et c'est
une capture qui a tranché (D102).

---

## Lire un échec : le protocole

**Un échec n'est jamais « du bruit » tant qu'on n'a pas dit pourquoi.** Trois
défauts réels ont été trouvés parce que quelqu'un a refusé ce mot — D82, D84 et
D95, dont le dernier ressemblait trait pour trait à de la contention et créait
des doublons. Un verdict toujours rouge apprend à ranger le prochain vrai défaut
avec le reste : c'est ce qui a caché S37 pendant deux jours (D88).

Dans cet ordre, et sans en sauter :

### 1. Lire ce que l'échec dit vraiment

Playwright écrit un `error-context.md` par test échoué dans `test-results/`. Il
contient **l'état de la page au moment de l'échec**. C'est la première chose à
lire, avant toute hypothèse.

Trois formes, trois sens :

| Ce qu'on lit | Ce que ça veut dire |
|---|---|
| `expect(locator).toBe…` sur une valeur précise | Une **assertion**. Le produit a répondu autre chose que ce qu'on attendait. C'est presque toujours un vrai défaut. |
| `waiting for getByRole(…)` puis expiration | Une donnée **n'est jamais arrivée**. Rarement une lenteur : le plus souvent elle n'existe nulle part. Voir §3. |
| `Test timeout of N exceeded` sans locator | Le test a dépassé son budget entier. Regarder quelle étape, pas le total. |

### 2. Rejouer isolément — mais ne pas s'arrêter là

```bash
npx playwright test e2e/<fichier>.spec.ts -g "<un fragment du titre>"
```

Un test qui passe seul et échoue en suite **n'est pas disculpé**. Il dit
seulement que sa cause dépend de la charge. Les quatre échecs de `paiements` de
la dernière passe passaient tous isolément ; leur cause était une écriture
perdue, pas une lenteur.

### 3. Chercher la donnée au serveur

C'est l'étape que personne ne fait, et c'est celle qui tranche. L'émulateur
Firestore répond en REST avec un jeton d'administration :

```bash
curl -s -H "Authorization: Bearer owner" \
  "http://127.0.0.1:8181/v1/projects/sdi-dev/databases/(default)/documents/clients?pageSize=100"
```

Trois réponses, trois diagnostics :

- **Le document est là, avec les bonnes valeurs** → le produit a écrit juste ;
  c'est la **lecture** qui n'a pas eu lieu. Regarder le cache du navigateur, et
  ce qui l'a vidé (un `page.goto`, un `reload`, un second contexte).
- **Le document n'est nulle part** → l'écriture s'est perdue. Presque toujours
  le décor : voir §4.
- **Le document est là avec de mauvaises valeurs** → vrai défaut du produit.
  C'est la bonne nouvelle : il est reproductible.

### 4. Les deux causes qui expliquent presque tout (D97)

**Une écriture confirmée à l'écran n'est pas une écriture partie.** Le produit
confirme de façon optimiste — c'est sa promesse au comptoir, et elle est juste.
Mais deux gestes du décor détruisent ce qui n'est pas encore parti :

1. **`page.goto` et `page.reload`** rechargent la page entière. Firestore repart
   de son cache sur disque ; une écriture encore en vol n'y est pas.
2. **`browser.newContext()`** ouvre un navigateur qui ne partage aucun cache. Il
   lit le **serveur**, et ne voit que ce qui y est arrivé.

Le remède est écrit une fois, dans `aide.ts` :

```ts
await attendreLaFileVide(page);   // « À jour » au bandeau = file vide
```

**Une fois, à la frontière** — à la sortie du décor, avant d'ouvrir un second
navigateur, avant de couper le réseau. **Jamais document par document** :
attendre le serveur à chaque écriture fabrique la contention qu'on mesurait
ensuite, et l'attente elle-même finit par expirer.

### 5. Ce qui reste après ça

Si l'échec survit aux quatre étapes, il est réel. L'écrire dans
`specs/ROADMAP.md` sous « défauts ouverts », avec son symptôme daté et ce qui le
reproduit. Un défaut qui survit à la spec qui l'a produit devient une spec à lui.

---

## Ce qui coûte cher, et pourquoi

Le décor passe par l'interface — c'est voulu, c'est le vrai chemin d'un premier
jour. Un test de vente fabrique donc une boutique, une marque, un modèle, une
provenance, une moto et un client, chacun par un écran, soit six chargements de
page complets avec un cache vide. C'est l'essentiel du temps de la suite.

Et le coût n'est pas constant : `preparation.ts` vide la base **une fois par
passe**, puis les cent tests y accumulent. Or presque chaque écran écoute ses
collections **en entier** — c'est le choix de D16, et il est bon pour le
comptoir. Au centième test, chaque ouverture d'écran relit ce que les
quatre-vingt-dix-neuf précédents ont écrit.

C'est pourquoi des émulateurs neufs ne sont pas un confort : sur ceux du matin,
la même suite part déjà chargée de la veille.
