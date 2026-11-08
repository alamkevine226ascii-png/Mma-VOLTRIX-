/**
 * RAPPORT FINAL — Développement du module MMA dans VOLTRIX
 * Généré avec docx-js. Texte français, palette Lapis Tech (VOLTRIX).
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  TableLayoutType, PageBreak, SectionType, NumberFormat, TableOfContents,
  Footer, PageNumber, VerticalAlign,
} = require("docx");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Palette Lapis Tech (VOLTRIX)
// ---------------------------------------------------------------------------
const P = {
  bg: "1A1F36",
  titleColor: "FFFFFF",
  subtitleColor: "C9CEE8",
  metaColor: "AEB5D6",
  accent: "667eea",
  accent2: "8B9CF5",
  footerColor: "8A91B8",
  primary: "1A1F36",
  body: "222633",
  secondary: "5A6080",
  surface: "F5F6FB",
  white: "FFFFFF",
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const F = { ascii: "Calibri", hAnsi: "Calibri" };

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: opts.after != null ? opts.after : 120, before: opts.before || 0 },
    indent: opts.indent,
    children: (Array.isArray(text) ? text : [new TextRun({ text, size: opts.size || 21, color: opts.color || P.body, bold: opts.bold, italics: opts.italics, font: F })]),
  });
}

function run(text, opts = {}) {
  return new TextRun({ text, size: opts.size || 21, color: opts.color || P.body, bold: opts.bold, italics: opts.italics, font: F });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200, line: 312 },
    children: [new TextRun({ text, bold: true, size: 30, color: P.primary, font: F })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 25, color: P.primary, font: F })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 22, color: P.secondary, font: F })],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 60 },
    indent: { left: 360, hanging: 200 },
    children: [
      new TextRun({ text: "•  ", size: 21, color: P.accent, bold: true, font: F }),
      ...(Array.isArray(text) ? text : [new TextRun({ text, size: 21, color: P.body, font: F, bold: opts.bold })]),
    ],
  });
}

const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };
const thinBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D8DBEA" },
};

function tableFromRows(headers, rows, widths) {
  const total = widths ? widths.reduce((a, b) => a + b, 0) : 100;
  const headerCells = headers.map((htext, i) => new TableCell({
    margins: cellMargins,
    shading: { type: ShadingType.CLEAR, fill: P.accent },
    verticalAlign: VerticalAlign.CENTER,
    width: widths ? { size: (widths[i] / total) * 100, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      spacing: { line: 276 },
      children: [new TextRun({ text: htext, bold: true, size: 19, color: P.white, font: F })],
    })],
  }));
  const bodyRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((cellText, ci) => new TableCell({
      margins: cellMargins,
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 1 ? P.surface : "FFFFFF" },
      verticalAlign: VerticalAlign.CENTER,
      width: widths ? { size: (widths[ci] / total) * 100, type: WidthType.PERCENTAGE } : undefined,
      children: String(cellText).split("\n").map((line) => new Paragraph({
        spacing: { line: 264, after: 20 },
        children: [new TextRun({ text: line, size: 18, color: P.body, font: F, bold: ci === 0 && false })],
      })),
    })),
  }));
  return new Table({
    layout: TableLayoutType.FIXED,
    borders: thinBorders,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, cantSplit: true, children: headerCells }), ...bodyRows],
  });
}

function tableTitle(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 20, color: P.secondary, font: F })],
  });
}

// ---------------------------------------------------------------------------
// Couverture — Recette R1 (paragraphe pur, aligné à gauche)
// ---------------------------------------------------------------------------
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  const split = (t, cpl) => {
    if (t.length <= cpl) return [t];
    const words = t.split(" ");
    const out = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > cpl && cur) { out.push(cur.trim()); cur = w; }
      else cur = (cur + " " + w).trim();
    }
    if (cur) out.push(cur);
    if (out.length > 1 && out[out.length - 1].length <= 4) {
      const last = out.pop();
      out[out.length - 1] += " " + last;
    }
    return out;
  };
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 4) { titlePt -= 2; continue; }
    lines = split(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines) { lines = split(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false, metaLineCount = 0, fixedHeight = 400, pageHeight = 16838 } = params;
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
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

function buildCoverR1(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent2, font: F, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: F })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: F })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: P.metaColor, font: F })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: F }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: F }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------------------------------------------------------------------------
// Pied de page
// ---------------------------------------------------------------------------
function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: P.secondary, font: F })],
    })],
  });
}

module.exports = { P, F, para, run, h1, h2, h3, bullet, tableFromRows, tableTitle, buildCoverR1, pageFooter, allNoBorders, noBorders };

// Si exécuté directement, génère le document (le contenu est dans report_content.js)
if (require.main === module) {
  const { buildDocument } = require("./report_content.js");
  buildDocument().then(() => console.log("Document généré."));
}
