/**
 * Build the Atlantic Precision CSR Vendors and Projections tutorial as Word.
 * Run: npx tsx scripts/build-atlantic-precision-csr-tutorial-docx.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const NAVY = '0F2A4A';
const TEAL = '0E7C86';
const GRAY = '475569';
const LIGHT_TEAL = 'E6F4F5';
const FONT = 'Calibri';
const BODY_SIZE = 21;
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };

function run(text: string, options: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: options.size ?? BODY_SIZE,
    bold: options.bold,
    italics: options.italics,
    color: options.color,
  });
}

function rich(text: string, size = BODY_SIZE): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => part.startsWith('**')
      ? run(part.slice(2, -2), { bold: true, size })
      : run(part, { size }));
}

function title(text: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [run(text, { bold: true, color: NAVY, size: 40 })],
  });
}

function heading(text: string, level: 1 | 2 | 3) {
  const sizes = { 1: 30, 2: 26, 3: 23 };
  return new Paragraph({
    spacing: { before: level === 1 ? 280 : 180, after: 70 },
    border: level === 1
      ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 2 } }
      : undefined,
    children: [run(text, { bold: true, color: level === 1 ? NAVY : TEAL, size: sizes[level] })],
  });
}

function paragraph(text: string) {
  return new Paragraph({ spacing: { after: 100, line: 270 }, children: rich(text) });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 45, line: 260 },
    children: rich(text),
  });
}

function ordered(text: string) {
  const [, number, body] = text.match(/^(\d+)\.\s+(.*)$/) || [];
  return new Paragraph({
    spacing: { after: 45, line: 260 },
    indent: { left: 360, hanging: 360 },
    children: [run(`${number}.  `, { bold: true, color: NAVY }), ...rich(body)],
  });
}

function note(text: string) {
  return new Paragraph({
    spacing: { before: 80, after: 120, line: 260 },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: LIGHT_TEAL },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 6 } },
    children: rich(text.replace(/^>\s*/, '')),
  });
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((value) => value.trim());
}

function tableCell(text: string, header: boolean, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : undefined,
    margins: { top: 55, bottom: 55, left: 90, right: 90 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: 240 },
        children: header ? [run(text, { bold: true, color: 'FFFFFF', size: 18 })] : rich(text, 18),
      }),
    ],
  });
}

function markdownTable(lines: string[]) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}/.test(line.trim()))
    .map(parseTableRow);
  const columnCount = Math.max(...rows.map((row) => row.length));
  const width = Math.floor(100 / columnCount);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, rowIndex) => new TableRow({
      children: Array.from({ length: columnCount }, (_, index) => tableCell(row[index] ?? '', rowIndex === 0, width)),
    })),
  });
}

function buildChildren(markdown: string[]): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];

  for (let index = 0; index < markdown.length; index += 1) {
    const line = markdown[index];
    if (!line.trim() || /^---+$/.test(line.trim())) continue;

    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (index < markdown.length && markdown[index].startsWith('|')) {
        tableLines.push(markdown[index]);
        index += 1;
      }
      children.push(markdownTable(tableLines));
      index -= 1;
      continue;
    }

    if (line.startsWith('# ')) {
      children.push(title(line.slice(2)));
    } else if (line.startsWith('## ')) {
      children.push(heading(line.slice(3), 1));
    } else if (line.startsWith('### ')) {
      children.push(heading(line.slice(4), 2));
    } else if (line.startsWith('#### ')) {
      children.push(heading(line.slice(5), 3));
    } else if (line.startsWith('> ')) {
      children.push(note(line));
    } else if (/^-\s+/.test(line)) {
      children.push(bullet(line.replace(/^-\s+/, '')));
    } else if (/^\d+\.\s+/.test(line)) {
      children.push(ordered(line));
    } else {
      children.push(paragraph(line));
    }
  }

  return children;
}

async function main() {
  const docsDirectory = path.join(process.cwd(), 'docs');
  const sourcePath = path.join(docsDirectory, 'ATLANTIC_PRECISION_CSR_VENDORS_AND_PROJECTIONS_TUTORIAL.md');
  const outPath = path.join(docsDirectory, 'Atlantic_Precision_CSR_Vendors_and_Projections_Tutorial.docx');
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');

  const doc = new Document({
    creator: 'Corelytics',
    title: 'Atlantic Precision Resources: CSR Tutorial — Vendors and Projections',
    description: 'Production training tutorial for Atlantic Precision Resources customer service representatives',
    sections: [{
      properties: { page: { margin: { top: 1008, right: 1080, bottom: 1008, left: 1080 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              run('Corelytics — Atlantic Precision CSR Tutorial  |  ', { italics: true, color: GRAY, size: 17 }),
              run('Page ', { color: GRAY, size: 17 }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: GRAY }),
            ],
          })],
        }),
      },
      children: buildChildren(source.split(/\r?\n/)),
    }],
  });

  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
