/**
 * VOLTRIX v2.0 — Rapport de mise à jour (docx).
 * Suppression totale du football + moteur de pronostics MMA.
 * Recette de couverture : R1 (Pure Paragraph Left) · Palette : DS-1 Deep Sea.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, TableLayoutType,
  WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel, VerticalAlign,
  Header, Footer, PageNumber, PageBreak, SectionType, NumberFormat, TableOfContents,
  ImageRun,
} = require("docx");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Palette DS-1 (Deep Sea) — design-system.md
// ---------------------------------------------------------------------------
const P = {
  bg: "0B1C2C", primary: "FFFFFF", accent: "529286",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "9AA3AB" },
  table: { headerBg: "529286", headerText: "FFFFFF", accentLine: "529286", innerLine: "BECFCC", surface: "E8ECEB" },
  text: "22313F", secondary: "506070",
};

const allNoBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

// ---------------------------------------------------------------------------
// Utilitaires de couverture (design-system.md)
// ---------------------------------------------------------------------------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= charsPerLine) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length < 6) {
    lines[lines.length - 2] += " " + lines.pop();
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // Latin : largeur moyenne par caractère ≈ pt × 11 twips (plus étroit que CJK)
  const charWidth = (pt) => pt * 11;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

// Recette R1 — Pure Paragraph Cover (left aligned), design-system.md
function buildCoverR1(config) {
  const C = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "),
        size: 18, color: C.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: C.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: C.cover.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: C.cover.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: C.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------------------------------------------------------------------------
// Composants de corps
// ---------------------------------------------------------------------------
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: "1A5276", font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: "21618C", font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 22, color: P.text, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, ...opts })],
  });
}
function bodyRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: runs.map((r) => new TextRun({ size: 22, color: P.text, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, ...r })),
  });
}
function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 80 },
    indent: { left: 400 },
    children: [
      new TextRun({ text: "·  ", size: 22, color: P.accent, bold: true }),
      new TextRun({ text, size: 22, color: P.text, font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } }),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 21, color: "1A5276", font: { ascii: "Calibri" } })],
  });
}
const cellMargins = { top: 80, bottom: 80, left: 140, right: 140 };

function makeTable(header, rows, widths, centerCols = []) {
  const align = (i) => (centerCols.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT);
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: header.map((t, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({
        alignment: align(i),
        spacing: { line: 276 },
        children: [new TextRun({ text: t, bold: true, size: 20, color: P.table.headerText, font: { ascii: "Calibri" } })],
      })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((t, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? "FFFFFF" : P.table.surface },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      children: [new Paragraph({
        alignment: align(i),
        spacing: { line: 276 },
        children: [new TextRun({ text: String(t), size: 20, color: P.text, font: { ascii: "Calibri" } })],
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: P.table.accentLine },
      left: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      right: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
    },
    rows: [headerRow, ...bodyRows],
  });
}

// Pied de page avec numéro
function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: { ascii: "Calibri" } })],
    })],
  });
}
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.innerLine, space: 4 } },
      children: [new TextRun({ text: "VOLTRIX v2.0 — Rapport de mise à jour", size: 16, color: P.secondary, font: { ascii: "Calibri" } })],
    })],
  });
}

// Image (ratio préservé via image-size)
const sizeOf = require("image-size");
const imgBuf = fs.readFileSync("/home/z/my-project/scripts/rapport_backtest.png");
const dim = sizeOf.imageSize ? sizeOf.imageSize(imgBuf) : sizeOf(imgBuf);
const IMG_W = 560;
const IMG_H = Math.round(IMG_W * (dim.height / dim.width));

// ---------------------------------------------------------------------------
// Corps du document
// ---------------------------------------------------------------------------
const bodyChildren = [];

// 1. Résumé exécutif
bodyChildren.push(h1("1. Résumé exécutif"));
bodyChildren.push(body("La version 2.0 de VOLTRIX exécute deux directives de la mission : le retrait complet de tout ce qui touchait au football, et l'ajout d'un système de pronostics fiable et clair sur les combats et les combattants de MMA. L'application conserve son architecture à deux onglets (Accueil, Paramètres) et son design « Glass & Layered » ; l'onglet Accueil est désormais intégralement dédié au MMA."));
bodyChildren.push(body("Le moteur de pronostics voltrix-mma-v1 agrège onze dimensions statistiques observées (stats de carrière ESPN et indicateurs calculés sur les dix derniers combats) en une probabilité de victoire bornée entre 25 % et 75 %. Il désigne un favori, propose l'issue la plus probable, liste les facteurs clés et les points de vigilance, et publie ses pondérations. Sa fiabilité est mesurée en continu par un backtest public sur les combats terminés : 72 % de favoris confirmés sur 46 combats analysables au 8 novembre 2026, résultat affiché tel quel dans l'application, avec ses limites."));
bodyChildren.push(body("La suppression du football est totale et vérifiée : composants, routes API, moteur, table de base, journaux et cache ont été retirés ; la route /api/football/matches renvoie 404 et la base ne contient plus aucune trace football. La suite de tests automatisée — 49 tests réellement exécutés, dont l'accès réel aux endpoints ESPN et le parcours navigateur complet — passe sans échec."));

// 2. Objectifs et périmètre
bodyChildren.push(h1("2. Objectifs et périmètre de la mise à jour"));
bodyChildren.push(body("La mission initiale imposait de ne pas toucher au moteur football. La directive du 8 novembre 2026 inverse cette règle : « Retire tout ce qui est en rapport avec le foot. Le système doit être capable de donner des pronostics fiables et clairs sur les combats et combattants de MMA. » Le périmètre de la version 2.0 couvre donc :"));
bodyChildren.push(bullet("la suppression complète et vérifiée du module football, sans régressions sur le module MMA ;"));
bodyChildren.push(bullet("la conception d'un moteur de pronostics explicable, fondé uniquement sur des données observées et sourcées ;"));
bodyChildren.push(bullet("son intégration à l'interface (page combat, cartes d'événements, Paramètres) et à l'API ;"));
bodyChildren.push(bullet("la mesure publique de sa fiabilité (backtest sur combats terminés) ;"));
bodyChildren.push(bullet("une documentation et des tests réels, conformément aux règles absolues du projet."));
bodyChildren.push(body("Conformément au cadre éthique posé dès l'audit des sources, les pronostics restent des estimations statistiques clairement étiquetées : VOLTRIX n'édite aucune cote et ne donne aucun conseil de paris."));

// 3. Suppression du football
bodyChildren.push(h1("3. Suppression complète du module football"));
bodyChildren.push(h2("3.1 Fichiers et code supprimés"));
bodyChildren.push(body("Chaque artefact football a été retiré du dépôt, puis les références résiduelles ont été éliminées une à une (page d'accueil, sélecteur de discipline, métadonnées, étiquettes de journaux, TTL de cache, tests de non-régression devenus obsolètes)."));
bodyChildren.push(tableTitle("Tableau 1 — Suppressions effectuées"));
bodyChildren.push(makeTable(
  ["Artefact", "Emplacement", "Traitement"],
  [
    ["Vue matchs football", "src/components/football/", "Dossier supprimé"],
    ["Route API matchs", "src/app/api/football/", "Dossier supprimé (404 vérifié)"],
    ["Moteur football", "src/modules/football/", "Dossier supprimé"],
    ["Table FootballMatch", "prisma/schema.prisma", "Modèle retiré, schéma réappliqué"],
    ["Journaux football", "SyncLog (base)", "Purgés : 0 entrée restante"],
    ["Cache soccer", "ApiCache (base)", "Purgé : 0 entrée restante"],
    ["Sélecteur Football / MMA", "src/app/page.tsx", "Accueil MMA direct"],
    ["Test non-régression football", "src/modules/mma/__tests__/", "Remplacé par un test d'absence (404)"],
    ["Script de contrôle football", "scripts/check_football.ts", "Supprimé"],
  ],
  [30, 38, 32]
));
bodyChildren.push(h2("3.2 Base de données et traçabilité"));
bodyChildren.push(body("Le schéma Prisma a été réappliqué après retrait du modèle FootballMatch, ce qui a supprimé la table correspondante. Les journaux de synchronisation du module football et les entrées de cache « soccer » ont été purgés par un script dédié, puis un test automatisé vérifie qu'il n'en reste aucune trace. L'ensemble des compteurs du module MMA (16 événements, 157 combats, 304 combattants au 8 novembre 2026) est inchangé : la suppression n'a causé aucune perte de données MMA."));

// 4. Moteur de pronostics
bodyChildren.push(h1("4. Moteur de pronostics voltrix-mma-v1"));
bodyChildren.push(h2("4.1 Principes directeurs"));
bodyChildren.push(body("Un pronostic « fiable et clair » a été traduit en cinq exigences de conception : fondé uniquement sur des données réellement observées (jamais extrapolées) ; explicite (chaque dimension utilisée est listée avec son poids) ; honnête (probabilités bornées, combat trop serré signalé « indécis ») ; refusé quand les données manquent (moins de trois dimensions comparables : « Pronostic non disponible », plutôt qu'un avis bâti sur du vide) ; informatif (aucune cote, aucun conseil de paris)."));
bodyChildren.push(h2("4.2 Dimensions et pondérations"));
bodyChildren.push(tableTitle("Tableau 2 — Les onze dimensions du modèle et leurs poids"));
bodyChildren.push(makeTable(
  ["Dimension", "Poids", "Source de la donnée"],
  [
    ["Forme récente (5 combats)", "1,5", "Historique ESPN"],
    ["Volume de frappes (portées/min)", "1,2", "Stats de carrière ESPN"],
    ["Précision des frappes", "1,2", "Stats de carrière ESPN"],
    ["Frappes absorbées/min", "1,2", "Calcul VOLTRIX (10 derniers combats)"],
    ["Défense contre les frappes", "1,0", "Calcul VOLTRIX (10 derniers combats)"],
    ["Lutte (takedowns/15 min)", "1,0", "Stats de carrière ESPN"],
    ["Défense contre les takedowns", "1,0", "Calcul VOLTRIX (10 derniers combats)"],
    ["Soumissions tentées/15 min", "0,8", "Stats de carrière ESPN"],
    ["Pouvoir de finition (KO+TKO)", "1,0", "Stats + palmarès ESPN"],
    ["Expérience (combats disputés)", "0,8", "Palmarès ESPN"],
    ["Envergure physique (allonge)", "0,6", "Fiche ESPN"],
  ],
  [40, 12, 48],
  [1]
));
bodyChildren.push(h2("4.3 Du score à la probabilité"));
bodyChildren.push(body("Chaque dimension produit un indice relatif de 0 à 100 pour chaque combattant (part de la somme des deux valeurs ; inversion pour les indicateurs où « plus bas = mieux »). Le modèle agrège ces indices avec les poids du tableau 2, ramène l'avantage pondéré dans l'intervalle [-1 ; 1], puis le transforme en probabilité par une fonction logistique de pente 2,6. Le résultat est arrondi et borné entre 25 % et 75 % : aucun combat de MMA n'est une certitude statistique, et le modèle refuse de l'affirmer."));
bodyChildren.push(body("À titre d'illustration réelle, pour le combat principal de l'UFC 334 (Ciryl Gane vs. Josh Hokit), le modèle donne Hokit favori à 60 % : la lutte (indice 85 contre 15), la défense de takedown et le volume de frappes penchent pour le lutteur invaincu, tandis que Gane conserve l'expérience et la défense debout. Chacun de ces chiffres est affiché dans l'onglet Pronostic avec sa pondération."));
bodyChildren.push(h2("4.4 Règles d'honnêteté"));
bodyChildren.push(bullet("Refus sans base : moins de trois dimensions comparables, le pronostic n'est pas émis et la raison est affichée."));
bodyChildren.push(bullet("Indécis assumé : écart inférieur à six points, aucun favori n'est désigné."));
bodyChildren.push(bullet("Méthode prédite sourcée : l'issue la plus probable (KO/TKO, soumission, décision) provient du palmarès réel du favori, avec son pourcentage."));
bodyChildren.push(bullet("Rétrospection transparente : sur un combat terminé, l'application montre ce que le modèle aurait dit et le confronte au vainqueur réel."));
bodyChildren.push(bullet("Fiabilité mesurée : un backtest public recalcule le modèle sur les combats terminés et publie son taux de réussite, bon ou mauvais."));

// 5. Intégration applicative
bodyChildren.push(h1("5. Intégration applicative"));
bodyChildren.push(h2("5.1 Interface"));
bodyChildren.push(bullet("Onglet « Pronostic » (premier onglet de la page combat) : probabilités des deux combattants avec barres, badge de fiabilité (dimensions couvertes), issue la plus probable, facteurs clés, points de vigilance et méthodologie dépliable avec les onze pondérations."));
bodyChildren.push(bullet("Pronostic express sur chaque combat à venir d'une carte d'événement : fondé uniquement sur palmarès et forme, clairement étiqueté, avec renvoi vers l'analyse complète."));
bodyChildren.push(bullet("Section « Fiabilité du moteur de pronostics » dans Paramètres : backtest public, ventilation par niveau de fiabilité, derniers combats testés, notes de méthode."));
bodyChildren.push(bullet("Encadré de vérification rétrospective sur les combats terminés (favori confirmé ou surprise)."));
bodyChildren.push(h2("5.2 Routes API"));
bodyChildren.push(tableTitle("Tableau 3 — Routes API après la mise à jour (documentées dans DOC_API_VOLTRIX.md)"));
bodyChildren.push(makeTable(
  ["Route", "Méthode", "Statut v2.0"],
  [
    ["/api", "GET", "Modifiée : modules [mma], features + pronostics"],
    ["/api/mma/events", "GET", "Inchangée"],
    ["/api/mma/events/[id]", "GET", "Modifiée : champ expressPrediction par combat"],
    ["/api/mma/fights/[id]", "GET", "Modifiée : champ prediction complet"],
    ["/api/mma/fighters/[id]", "GET", "Inchangée"],
    ["/api/mma/sync", "GET/POST", "Inchangée (journaux MMA uniquement)"],
    ["/api/mma/predictions", "GET", "Nouvelle : backtest public du modèle"],
    ["/api/football/matches", "GET", "Supprimée : 404 vérifié par test"],
  ],
  [34, 14, 52]
));

// 6. Backtest
bodyChildren.push(h1("6. Fiabilité mesurée : backtest public"));
bodyChildren.push(body("Le modèle est recalculé sur les combats terminés présents en base et confronté aux vainqueurs réels. Au 8 novembre 2026 : 46 combats analysables, 33 favoris confirmés, soit un taux de réussite de 72 %. Les combats dont un combattant manque de données (32) et les combats statistiquement trop serrés (2) sont exclus du décompte et comptés séparément."));
bodyChildren.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 160, after: 60 },
  children: [new ImageRun({ data: imgBuf, transformation: { width: IMG_W, height: IMG_H }, type: "png" })],
}));
bodyChildren.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Figure 1 — Taux de réussite du backtest par niveau de fiabilité (8 nov. 2026)", italics: true, size: 18, color: P.secondary, font: { ascii: "Calibri" } })],
}));
bodyChildren.push(body("Trois limites sont affichées avec le résultat : un biais de recul (les statistiques de carrière utilisées sont celles connues aujourd'hui, pas celles au moment du combat) ; un échantillon limité aux combats dont les deux combattants disposent de données suffisantes ; l'exclusion des combats trop serrés. Le backtest est recalculable à tout moment depuis l'onglet Paramètres et publié tel quel, y compris s'il devient défavorable."));

// 7. Tests
bodyChildren.push(h1("7. Tests et vérifications réelles"));
bodyChildren.push(body("La suite automatisée bun test comporte désormais 49 tests, tous exécutés avec succès (3 165 assertions), dont l'accès réel aux endpoints ESPN, la vérification de cohérence de la base réelle et les parcours API complets. Le détail des résultats est livré dans RESULTATS_TESTS_MMA.txt."));
bodyChildren.push(tableTitle("Tableau 4 — Couverture de la suite de tests (49 tests, 0 échec)"));
bodyChildren.push(makeTable(
  ["Bloc", "Tests", "Points vérifiés"],
  [
    ["Mappages et formules", "13", "Statuts ESPN, durées de combat (cas réels), palmarès, noms, méthodes"],
    ["Identifiants et placeholders", "5", "Clés externes, UID, détection TBA/TBD"],
    ["Base de données réelle", "9", "Dédoublonnage, plages de validité, données manquantes jamais fabriquées"],
    ["API locale (serveur réel)", "7", "Événements, carte, analyse + pronostic, backtest, 404 football"],
    ["Adaptateur ESPN (accès réel)", "3", "Scoreboard, fiche combattant, donnée inexistante"],
    ["Moteur de pronostics", "7", "Favori, symétrie, refus sans données, méthode, express, poids"],
    ["Backtest + suppression football", "2", "Cohérence des compteurs, zéro trace football"],
    ["Tests unitaires complémentaires", "3", "Divers mappages"],
  ],
  [30, 10, 60],
  [1]
));
bodyChildren.push(body("Le parcours navigateur a été vérifié de bout en bout avec un navigateur headless : accueil MMA sans sélecteur football, pronostics express sur la carte UFC 334, onglet Pronostic complet (11/11 dimensions, méthodologie dépliable), vérification rétrospective sur un combat terminé (Sezinando vs. Berggren, favori confirmé), section fiabilité dans Paramètres, et affichage mobile 390×844 sans débordement horizontal."));

// 8. Incidents
bodyChildren.push(h1("8. Incidents rencontrés et résolutions"));
bodyChildren.push(body("Pendant le remplissage historique des fiches des combattants des combats terminés (166 combattants ciblés, nécessaires au backtest), le CDN d'ESPN a renvoyé des erreurs HTTP 403 intermittentes. Des tests croisés (neuf requêtes, trois chaînes User-Agent) ont montré qu'il s'agissait d'un bridage temporaire du CDN après des rafales de requêtes, indépendant de la chaîne User-Agent. Trois mesures ont été prises :"));
bodyChildren.push(bullet("une relance polie unique (2,5 s d'attente) sur les réponses 403/429 dans le client HTTP partagé du module core ;"));
bodyChildren.push(bullet("un script de remplissage incrémentiel qui reprend là où il s'est arrêté et compte honnêtement les enrichissements complets et partiels ;"));
bodyChildren.push(bullet("l'ordonnanceur applicatif (enrichissement toutes les six heures) complète les fiches restantes sans intervention manuelle."));
bodyChildren.push(body("Au moment des tests, 166 combattants étaient ciblés et 127 fiches complètes ; les 39 restantes étaient déjà partiellement remplies (historique présent) et continuent d'être complétées par l'ordonnanceur. Chaque étape du diagnostic est consignée dans RESULTATS_TESTS_MMA.txt."));

// 9. Limites et suite
bodyChildren.push(h1("9. Limites et étapes suivantes"));
bodyChildren.push(body("Limites connues et affichées :"));
bodyChildren.push(bullet("biais de recul du backtest (statistiques de carrière actuelles appliquées à des combats passés) ;"));
bodyChildren.push(bullet("échantillon de backtest encore restreint (46 combats analysables) ; il s'étoffe à mesure que les fiches sont enrichies ;"));
bodyChildren.push(bullet("le modèle ignore ce que les statistiques ne voient pas : blessures, camps, dynamique du soir — rappelé dans l'interface ;"));
bodyChildren.push(bullet("probabilités volontairement bornées entre 25 % et 75 %, cohérentes avec l'imprévisibilité du MMA."));
bodyChildren.push(body("Étapes suivantes proposées : compléter l'enrichissement des fiches restantes via l'ordonnanceur ; recalculer périodiquement le backtest pour suivre la stabilité du taux de réussite ; à plus long terme, entraîner les pondérations sur l'historique accumulé (calibration), et étendre l'architecture modulaire à d'autres organisations couvertes par ESPN si le besoin apparaît."));

// ---------------------------------------------------------------------------
// Assemblage du document
// ---------------------------------------------------------------------------
const doc = new Document({
  creator: "VOLTRIX",
  title: "VOLTRIX v2.0 — Rapport de mise à jour",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 22, color: P.text },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  features: { updateFields: true },
  sections: [
    // Section 1 : couverture (marges 0, pas de pied de page)
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCoverR1({
        title: "VOLTRIX v2.0 — Rapport de mise à jour",
        subtitle: "Suppression totale du football · Moteur de pronostics MMA",
        englishLabel: "MMA PREDICTION ENGINE",
        metaLines: [
          "Version applicative : 2.0.0",
          "Modèle de pronostics : voltrix-mma-v1",
          "Source de données : ESPN (endpoints vérifiés)",
          "Date du rapport : 8 novembre 2026",
        ],
        footerLeft: "VOLTRIX — données sportives sourcées et datées",
        footerRight: "Usage personnel, non commercial",
        palette: P,
      }),
    },
    // Section 2 : sommaire (romain)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
        },
      },
      footers: { default: pageFooter() },
      children: [
        new Paragraph({
          spacing: { before: 200, after: 240 },
          children: [new TextRun({ text: "Sommaire", bold: true, size: 34, color: "1A5276", font: { ascii: "Calibri", eastAsia: "SimHei" } })],
        }),
        new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note : ce sommaire est généré par champs. Après modification du document, faites un clic droit sur le sommaire puis « Mettre à jour les champs » pour actualiser la pagination.",
            italics: true, size: 18, color: "888888", font: { ascii: "Calibri" },
          })],
        }),
        // Pas de PageBreak ici : la section suivante (NEXT_PAGE) assure le
        // passage à la page suivante — un PageBreak en plus créerait une
        // page blanche (règle des sections du design-system).
      ],
    },
    // Section 3 : corps (arabe, démarre à 1)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/Rapport_MiseAJour_MMA.docx", buf);
  console.log("OK —", buf.length, "octets");
});
