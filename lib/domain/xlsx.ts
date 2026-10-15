/**
 * Un classeur Excel, fabriqué à la main (S54).
 *
 * Le commanditaire veut un vrai fichier Excel plutôt qu'un CSV. Un `.xlsx` est
 * une archive ZIP contenant quelques fichiers XML — rien de plus. Pour un
 * tableau plat, c'est le cas le plus simple du format, et il tient en un
 * module : ni dépendance à installer, ni poids à télécharger sur un téléphone
 * en données mobiles, et le fichier se fabrique entièrement sur l'appareil,
 * donc au comptoir coupure faite (D66).
 *
 * **L'archive n'est pas compressée.** La méthode « stockée » est prévue par le
 * format et acceptée partout. Elle évite d'écrire un compresseur, et elle a un
 * effet secondaire précieux : le XML se relit à l'œil nu dans les octets, en
 * test comme en débogage. Le prix est un fichier plus gros — sur quelques
 * centaines de lignes de stock, personne ne le remarquera.
 *
 * **Ce qu'on ne fait pas, et pourquoi.** Pas de feuille de styles : aucune
 * mise en forme n'est demandée, et un `styles.xml` est le premier endroit où ce
 * genre de module se met à grossir. Pas de table de chaînes partagées non
 * plus — elle économise des octets sur les valeurs qui se répètent, au prix
 * d'une indirection qu'on ne peut plus relire. Les dates sortent en texte
 * `jj/mm/aaaa`, comme dans le CSV qu'on remplace : les écrire en vrais nombres
 * de série demanderait justement la feuille de styles.
 */

export type Cellule = string | number | null;

const ENCODEUR = new TextEncoder();

/* La table de CRC-32, calculée une fois au chargement. Le polynôme est celui
   de la norme, écrit à l'envers comme le veut l'algorithme par table. */
const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let octet = 0; octet < 256; octet += 1) {
    let valeur = octet;
    for (let bit = 0; bit < 8; bit += 1) {
      valeur = valeur & 1 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[octet] = valeur >>> 0;
  }
  return table;
})();

/**
 * La somme de contrôle qu'un lecteur de ZIP vérifie avant d'ouvrir un fichier.
 *
 * Fausse, elle ne casse rien de visible : l'archive s'ouvre encore chez
 * certains outils, et refuse de s'ouvrir chez d'autres — le genre de défaut
 * qu'on découvre sur le poste de quelqu'un d'autre. D'où le vecteur d'essai de
 * la norme dans les tests.
 */
export function crc32(octets: Uint8Array): number {
  let somme = 0xffffffff;
  for (const octet of octets) somme = TABLE_CRC[(somme ^ octet) & 0xff] ^ (somme >>> 8);
  return (somme ^ 0xffffffff) >>> 0;
}

/** `0 → A`, `25 → Z`, `26 → AA`. La numérotation des colonnes d'un tableur. */
export function referenceColonne(index: number): string {
  let reste = index;
  let reference = "";
  do {
    reference = String.fromCharCode(65 + (reste % 26)) + reference;
    reste = Math.floor(reste / 26) - 1;
  } while (reste >= 0);
  return reference;
}

/* Les caractères de contrôle qu'un XML 1.0 n'accepte pas. Recopiés d'un carnet
   ou collés depuis ailleurs, ils rendraient le fichier illisible par le
   tableur — qui ne dirait pas pourquoi. */
const INTERDITS_EN_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

function echapper(valeur: string): string {
  return valeur
    .replace(INTERDITS_EN_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* Excel refuse ces caractères dans un nom d'onglet, et le tronque à 31. Un
   classeur qu'il refuse d'ouvrir pour un nom mal formé serait un échec muet. */
function nomDeFeuille(nom: string): string {
  return echapper(nom.replace(/[[\]:*?/\\]/g, " ")).slice(0, 31);
}

function feuilleXml(lignes: readonly (readonly Cellule[])[]): string {
  const corps = lignes
    .map((cellules, rang) => {
      const numero = rang + 1;
      const cases = cellules
        .map((valeur, colonne) => {
          /* Une cellule absente n'est pas une cellule vide : elle ne pèse rien
             dans le fichier et se filtre proprement dans le tableur (D105). */
          if (valeur === null || valeur === "") return "";
          const reference = `${referenceColonne(colonne)}${numero}`;
          /* Un nombre écrit en chaîne se trierait comme du texte — 10 avant 9.
             Et une chaîne déclarée `inlineStr` ne peut pas porter de formule :
             c'est la structure du format qui ferme l'injection que le CSV
             devait neutraliser à la main. */
          return typeof valeur === "number"
            ? `<c r="${reference}"><v>${valeur}</v></c>`
            : `<c r="${reference}" t="inlineStr"><is><t>${echapper(valeur)}</t></is></c>`;
        })
        .join("");
      return `<row r="${numero}">${cases}</row>`;
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${corps}</sheetData>` +
    "</worksheet>"
  );
}

type Entree = { nom: string; donnees: Uint8Array };

/* Le 1er janvier 1980 — la première date qu'un ZIP sait écrire. Figée plutôt
   que prise à l'horloge : le nom du fichier porte déjà sa date, et une archive
   qui change d'octets à chaque seconde ne se compare plus d'un essai à
   l'autre. */
const DATE_MS_DOS = 33;
const HEURE_MS_DOS = 0;

function archiver(entrees: readonly Entree[]): Uint8Array<ArrayBuffer> {
  const morceaux: Uint8Array[] = [];
  const fiches: Uint8Array[] = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = ENCODEUR.encode(entree.nom);
    const somme = crc32(entree.donnees);
    const taille = entree.donnees.length;

    const entete = new Uint8Array(30 + nom.length);
    const vue = new DataView(entete.buffer);
    vue.setUint32(0, 0x04034b50, true);
    vue.setUint16(4, 20, true);
    /* Le drapeau qui annonce des noms de fichiers en UTF-8 : sans lui, un nom
       accentué sortirait en charabia. Aucun des nôtres ne l'est, mais le poser
       coûte deux octets et ferme la question. */
    vue.setUint16(6, 0x0800, true);
    vue.setUint16(8, 0, true);
    vue.setUint16(10, HEURE_MS_DOS, true);
    vue.setUint16(12, DATE_MS_DOS, true);
    vue.setUint32(14, somme, true);
    vue.setUint32(18, taille, true);
    vue.setUint32(22, taille, true);
    vue.setUint16(26, nom.length, true);
    vue.setUint16(28, 0, true);
    entete.set(nom, 30);

    morceaux.push(entete, entree.donnees);

    const fiche = new Uint8Array(46 + nom.length);
    const vueFiche = new DataView(fiche.buffer);
    vueFiche.setUint32(0, 0x02014b50, true);
    vueFiche.setUint16(4, 20, true);
    vueFiche.setUint16(6, 20, true);
    vueFiche.setUint16(8, 0x0800, true);
    vueFiche.setUint16(10, 0, true);
    vueFiche.setUint16(12, HEURE_MS_DOS, true);
    vueFiche.setUint16(14, DATE_MS_DOS, true);
    vueFiche.setUint32(16, somme, true);
    vueFiche.setUint32(20, taille, true);
    vueFiche.setUint32(24, taille, true);
    vueFiche.setUint16(28, nom.length, true);
    vueFiche.setUint32(42, decalage, true);
    fiche.set(nom, 46);
    fiches.push(fiche);

    decalage += entete.length + taille;
  }

  const tailleSommaire = fiches.reduce((total, fiche) => total + fiche.length, 0);
  const fin = new Uint8Array(22);
  const vueFin = new DataView(fin.buffer);
  vueFin.setUint32(0, 0x06054b50, true);
  vueFin.setUint16(8, entrees.length, true);
  vueFin.setUint16(10, entrees.length, true);
  vueFin.setUint32(12, tailleSommaire, true);
  vueFin.setUint32(16, decalage, true);

  const tout = [...morceaux, ...fiches, fin];
  const total = tout.reduce((somme, part) => somme + part.length, 0);
  const archive = new Uint8Array(new ArrayBuffer(total));
  let curseur = 0;
  for (const part of tout) {
    archive.set(part, curseur);
    curseur += part.length;
  }
  return archive;
}

/** Le type MIME d'un classeur, pour le `Blob` qui part au téléchargement. */
export const TYPE_CLASSEUR =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Un classeur d'une seule feuille, prêt à écrire sur le disque.
 *
 * L'ordre des entrées de l'archive n'a pas d'importance pour un lecteur de ZIP,
 * mais celui-ci suit l'ordre de lecture d'Excel : le manifeste, les relations,
 * le classeur, puis la feuille.
 */
export function classeur(
  nomFeuille: string,
  lignes: readonly (readonly Cellule[])[],
): Uint8Array<ArrayBuffer> {
  const octets = (texte: string) => ENCODEUR.encode(texte);

  return archiver([
    {
      nom: "[Content_Types].xml",
      donnees: octets(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          "</Types>",
      ),
    },
    {
      nom: "_rels/.rels",
      donnees: octets(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          "</Relationships>",
      ),
    },
    {
      nom: "xl/workbook.xml",
      donnees: octets(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${nomDeFeuille(nomFeuille)}" sheetId="1" r:id="rId1"/></sheets>` +
          "</workbook>",
      ),
    },
    {
      nom: "xl/_rels/workbook.xml.rels",
      donnees: octets(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          "</Relationships>",
      ),
    },
    { nom: "xl/worksheets/sheet1.xml", donnees: octets(feuilleXml(lignes)) },
  ]);
}
