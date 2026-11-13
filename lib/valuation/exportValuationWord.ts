import type { IBorderOptions, IRunOptions, ITableCellBorders, Paragraph, ParagraphChild, Table, TableCell, TableRow } from 'docx';

export type WordPageOrientation = 'portrait' | 'landscape';

type Docx = typeof import('docx');
type Block = Paragraph | Table;

const PX_PER_INCH = 96;
const TWIPS_PER_PX = 15;
const PAGE_MARGIN_INCHES = 0.6;
const CHART_PIXEL_RATIO = 2.5;
const MAX_CHART_HEIGHT_INCHES = 3.8;
const MAX_BOX_HEIGHT_PX = 700;
const DROPPED_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'BUTTON', 'TEMPLATE', 'LINK', 'META']);
const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'table', 'list-item', 'flow-root', 'table-row-group', 'table-row']);
const SVG_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'opacity',
  'font-size',
  'font-weight',
  'font-family',
  'text-anchor',
  'dominant-baseline',
] as const;

type Ctx = {
  D: Docx;
  /** Width available to the current block, in document pixels. */
  maxWidthPx: number;
  pageContentWidthPx: number;
  align?: 'left' | 'center' | 'right';
  /** Card styling applied to every paragraph inside a bordered/shaded container. */
  box?: { fill: string | null; border: { width: number; color: string } | null };
  inCell?: boolean;
};

type Segment =
  | { kind: 'text'; text: string; style: IRunOptions }
  | { kind: 'break' }
  | { kind: 'tab' }
  | { kind: 'image'; run: ParagraphChild };

function contentWidthPx(orientation: WordPageOrientation): number {
  const pageWidthInches = orientation === 'landscape' ? 11 : 8.5;
  return Math.floor((pageWidthInches - PAGE_MARGIN_INCHES * 2) * PX_PER_INCH);
}

function twips(px: number): number {
  return Math.max(0, Math.round(px * TWIPS_PER_PX));
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Converts a computed CSS color to RRGGBB, blending alpha onto white. Returns null for transparent. */
function toHex(color: string): string | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
  const alpha = Number.parseFloat(a);
  if (!Number.isFinite(alpha) || alpha < 0.05) return null;
  const blend = (c: string) => Math.round(Number.parseFloat(c) * alpha + 255 * (1 - alpha));
  return [blend(r), blend(g), blend(b)].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

function backgroundHex(style: CSSStyleDeclaration): string | null {
  const hex = toHex(style.backgroundColor);
  return hex && hex.toLowerCase() !== 'ffffff' ? hex : null;
}

type Side = 'Top' | 'Right' | 'Bottom' | 'Left';
const SIDES: Side[] = ['Top', 'Right', 'Bottom', 'Left'];

function borderFor(style: CSSStyleDeclaration, side: Side): { width: number; color: string } | null {
  const width = px(style.getPropertyValue(`border-${side.toLowerCase()}-width`));
  const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
  const color = toHex(style.getPropertyValue(`border-${side.toLowerCase()}-color`));
  if (width < 0.5 || kind === 'none' || kind === 'hidden' || !color) return null;
  return { width, color };
}

function isVisible(el: Element): boolean {
  if (DROPPED_TAGS.has(el.tagName.toUpperCase())) return false;
  if (el.classList.contains('valuation-rich-print-hide')) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isChartElement(el: Element): boolean {
  if (!(el instanceof SVGSVGElement || el instanceof HTMLCanvasElement)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 80 && rect.height >= 40;
}

function containsChart(el: Element): boolean {
  if (isChartElement(el)) return true;
  return Array.from(el.querySelectorAll('svg, canvas')).some((c) => !c.parentElement?.closest('svg') && isChartElement(c));
}

function isBlockish(el: Element): boolean {
  if (el instanceof HTMLTableElement || isChartElement(el)) return true;
  if (el instanceof SVGElement) return false;
  return BLOCK_DISPLAYS.has(window.getComputedStyle(el).display);
}

function visibleChildren(el: Element): Element[] {
  return Array.from(el.children).filter(isVisible);
}

function hasBlockChildren(el: Element): boolean {
  return visibleChildren(el).some((child) => isBlockish(child) || hasBlockChildren(child));
}

function hasDirectText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0);
}

function isPageBreakBefore(el: Element): boolean {
  if (el.classList.contains('valuation-section-print-page')) return true;
  return (
    el.classList.contains('valuation-print-category') &&
    !!el.previousElementSibling?.classList.contains('valuation-print-category')
  );
}

function hasPageBreakInside(el: Element): boolean {
  return Array.from(el.querySelectorAll('.valuation-section-print-page, .valuation-print-category')).some(isPageBreakBefore);
}

function isBox(el: Element, style: CSSStyleDeclaration): boolean {
  if (el instanceof HTMLTableElement || el instanceof HTMLTableCellElement) return false;
  const hasBackground = !!backgroundHex(style);
  const fullBorder = SIDES.every((side) => !!borderFor(style, side));
  if (!hasBackground && !fullBorder) return false;
  if (el.getBoundingClientRect().height > MAX_BOX_HEIGHT_PX) return false;
  return !hasPageBreakInside(el);
}

/** Groups laid-out children into visual rows using vertical overlap. */
function groupIntoRows(children: Element[]): Element[][] {
  const rows: { top: number; bottom: number; items: Element[] }[] = [];
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    const row = rows.find((r) => rect.top < r.bottom - 2 && rect.bottom > r.top + 2);
    if (row) {
      row.items.push(child);
      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else {
      rows.push({ top: rect.top, bottom: rect.bottom, items: [child] });
    }
  }
  return rows
    .sort((a, b) => a.top - b.top)
    .map((r) => r.items.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left));
}

function noBorders(D: Docx) {
  const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

function cellBorders(D: Docx, styles: CSSStyleDeclaration[]): ITableCellBorders {
  const result: Record<string, IBorderOptions> = {};
  for (const side of SIDES) {
    const found = styles.map((s) => borderFor(s, side)).find(Boolean);
    result[side.toLowerCase()] = found
      ? { style: D.BorderStyle.SINGLE, size: Math.max(2, Math.round(found.width * 6)), color: found.color }
      : { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  }
  return result;
}

function alignmentFor(D: Docx, style: CSSStyleDeclaration, override?: Ctx['align']) {
  const align = override || style.textAlign;
  if (align === 'center') return D.AlignmentType.CENTER;
  if (align === 'right' || align === 'end') return D.AlignmentType.RIGHT;
  if (align === 'justify') return D.AlignmentType.JUSTIFIED;
  return D.AlignmentType.LEFT;
}

function runStyle(D: Docx, style: CSSStyleDeclaration): IRunOptions {
  const weight = Number.parseInt(style.fontWeight, 10);
  const color = toHex(style.color);
  const isInlineBadge = style.display === 'inline-block' || style.display === 'inline-flex';
  const badgeFill = isInlineBadge ? backgroundHex(style) : null;
  return {
    bold: Number.isFinite(weight) ? weight >= 600 : style.fontWeight === 'bold',
    italics: style.fontStyle === 'italic',
    underline: style.textDecorationLine.includes('underline') ? {} : undefined,
    color: color || undefined,
    size: Math.max(12, Math.round(px(style.fontSize) * 1.5)),
    shading: badgeFill ? { type: D.ShadingType.CLEAR, fill: badgeFill, color: 'auto' } : undefined,
  };
}

function inlineSvgStyles(original: SVGSVGElement, clone: SVGSVGElement): void {
  const originals = [original, ...Array.from(original.querySelectorAll('*'))];
  const clones = [clone, ...Array.from(clone.querySelectorAll('*'))];
  originals.forEach((orig, i) => {
    const target = clones[i] as SVGElement | undefined;
    if (!target) return;
    const computed = window.getComputedStyle(orig);
    for (const prop of SVG_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) target.style.setProperty(prop, value);
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize chart'));
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Charts get the full available width so their labels stay legible, capped by a max height. */
function chartSize(rect: { width: number; height: number }, ctx: Ctx): { width: number; height: number } {
  const aspect = rect.height / Math.max(1, rect.width);
  let width = Math.min(ctx.maxWidthPx, ctx.pageContentWidthPx);
  let height = width * aspect;
  const maxHeight = MAX_CHART_HEIGHT_INCHES * PX_PER_INCH;
  if (height > maxHeight) {
    height = maxHeight;
    width = height / aspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

async function chartRun(el: SVGSVGElement | HTMLCanvasElement, ctx: Ctx): Promise<ParagraphChild | null> {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  let size = chartSize(rect, ctx);
  let dataUrl: string;
  if (el instanceof HTMLCanvasElement) {
    dataUrl = el.toDataURL('image/png');
  } else {
    const clone = el.cloneNode(true) as SVGSVGElement;
    inlineSvgStyles(el, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Axis labels often overflow the viewBox (overflow: visible); widen it so the raster keeps them.
    const base = el.viewBox?.baseVal;
    const vb = base && base.width > 0 && base.height > 0
      ? { x: base.x, y: base.y, w: base.width, h: base.height }
      : { x: 0, y: 0, w: rect.width, h: rect.height };
    let view = vb;
    try {
      const bbox = el.getBBox();
      const x0 = Math.min(vb.x, bbox.x);
      const y0 = Math.min(vb.y, bbox.y);
      const x1 = Math.max(vb.x + vb.w, bbox.x + bbox.width);
      const y1 = Math.max(vb.y + vb.h, bbox.y + bbox.height);
      view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } catch {
      // getBBox throws for SVGs that are not rendered; keep the original view.
    }
    clone.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    size = chartSize({ width: rect.width * (view.w / vb.w), height: rect.height * (view.h / vb.h) }, ctx);
    clone.setAttribute('width', String(size.width * CHART_PIXEL_RATIO));
    clone.setAttribute('height', String(size.height * CHART_PIXEL_RATIO));
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    clone.style.width = '';
    clone.style.height = '';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    const markup = new XMLSerializer().serializeToString(clone);
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size.width * CHART_PIXEL_RATIO);
    canvas.height = Math.round(size.height * CHART_PIXEL_RATIO);
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.fillStyle = '#ffffff';
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL('image/png');
  }
  return new ctx.D.ImageRun({ data: dataUrlToBytes(dataUrl), transformation: size });
}

async function collectSegments(node: Node, ctx: Ctx, out: Segment[]): Promise<void> {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent) return;
    const style = window.getComputedStyle(parent);
    const raw = node.textContent || '';
    const preserve = /^pre/.test(style.whiteSpace) || style.whiteSpace === 'break-spaces';
    const style0 = runStyle(ctx.D, style);
    if (preserve) {
      raw.split('\n').forEach((line, i) => {
        if (i > 0) out.push({ kind: 'break' });
        if (line) out.push({ kind: 'text', text: line, style: style0 });
      });
    } else {
      const text = raw.replace(/\s+/g, ' ');
      if (text) out.push({ kind: 'text', text, style: style0 });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (!isVisible(el)) return;
  if (el.tagName === 'BR') {
    out.push({ kind: 'break' });
    return;
  }
  if (el instanceof SVGSVGElement || el instanceof HTMLCanvasElement) {
    if (!isChartElement(el)) return;
    const run = await chartRun(el, ctx);
    if (run) out.push({ kind: 'image', run });
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'hidden'].includes(el.type)) return;
    const value = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.textContent || el.value : el.value;
    if (value) out.push({ kind: 'text', text: value, style: runStyle(ctx.D, window.getComputedStyle(el)) });
    return;
  }
  const style = window.getComputedStyle(el);
  const isInlineBlock = style.display === 'inline-block' || style.display === 'inline-flex';
  const hasBadge = isInlineBlock && !!backgroundHex(style);
  if (hasBadge) out.push({ kind: 'text', text: ' ', style: runStyle(ctx.D, style) });
  for (const child of Array.from(el.childNodes)) await collectSegments(child, ctx, out);
  if (hasBadge) out.push({ kind: 'text', text: ' ', style: runStyle(ctx.D, style) });
}

function isBlankText(seg: Segment): boolean {
  return seg.kind === 'break' || seg.kind === 'tab' || (seg.kind === 'text' && !seg.text.trim());
}

function trimSegments(segments: Segment[]): Segment[] {
  const trimmed = [...segments];
  while (trimmed.length && isBlankText(trimmed[0])) trimmed.shift();
  while (trimmed.length && isBlankText(trimmed[trimmed.length - 1])) trimmed.pop();
  return trimmed;
}

/** Large, all-bold, short text lines become Word headings so they use styles, keep-with-next, and the Navigation Pane. */
function headingLevel(segments: Segment[], ctx: Ctx): 1 | 2 | null {
  if (ctx.box || ctx.inCell) return null;
  const texts = segments.filter((s): s is Extract<Segment, { kind: 'text' }> => s.kind === 'text' && !!s.text.trim());
  if (!texts.length || segments.some((s) => s.kind === 'image')) return null;
  const text = texts.map((s) => s.text).join('').trim();
  if (text.length > 100 || !/[A-Za-z]/.test(text) || /^[$€£(+\-\d]/.test(text)) return null;
  if (!texts.every((s) => s.style.bold)) return null;
  const size = Math.max(...texts.map((s) => Number(s.style.size) || 0));
  if (size >= 27) return 1;
  if (size >= 23) return 2;
  return null;
}

function segmentsToRuns(D: Docx, segments: Segment[], plain = false): ParagraphChild[] {
  const trimmed = trimSegments(segments);
  const runs: ParagraphChild[] = [];
  let previousEndsWithSpace = true;
  trimmed.forEach((seg, i) => {
    if (seg.kind === 'image') {
      runs.push(seg.run);
      previousEndsWithSpace = true;
      return;
    }
    if (seg.kind === 'break' || seg.kind === 'tab') {
      runs.push(seg.kind === 'break' ? new D.TextRun({ text: '', break: 1 }) : new D.TextRun({ children: [new D.Tab()] }));
      previousEndsWithSpace = true;
      return;
    }
    let text = seg.text;
    if (previousEndsWithSpace) text = text.replace(/^ +/, '');
    if (i === 0) text = text.trimStart();
    if (i === trimmed.length - 1) text = text.trimEnd();
    if (!text) return;
    previousEndsWithSpace = text.endsWith(' ');
    runs.push(new D.TextRun(plain ? { text, italics: seg.style.italics } : { ...seg.style, text }));
  });
  return runs;
}

function boxFormatting(ctx: Ctx) {
  const { D, box } = ctx;
  if (!box) return {};
  const side = box.border
    ? { style: D.BorderStyle.SINGLE, size: Math.max(4, Math.round(box.border.width * 6)), color: box.border.color, space: 4 }
    : box.fill
      ? { style: D.BorderStyle.SINGLE, size: 4, color: box.fill, space: 4 }
      : undefined;
  return {
    shading: box.fill ? { type: D.ShadingType.CLEAR, fill: box.fill, color: 'auto' } : undefined,
    border: side ? { top: side, bottom: side, left: side, right: side } : undefined,
    indent: { left: 80, right: 80 },
  };
}

function paragraphFromSegments(segments: Segment[], el: Element | null, ctx: Ctx, tabStopPx?: number): Paragraph | null {
  const { D } = ctx;
  const level = headingLevel(segments, ctx);
  const runs = segmentsToRuns(D, segments, level !== null);
  if (!runs.length) return null;
  const style = el ? window.getComputedStyle(el) : null;
  const alignment = style ? alignmentFor(D, style, ctx.align) : ctx.align === 'right' ? D.AlignmentType.RIGHT : undefined;
  if (level !== null) {
    return new D.Paragraph({
      children: runs,
      heading: level === 1 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2,
      alignment,
    });
  }
  const bottomBorder = style && !SIDES.slice(0, 3).some((s) => borderFor(style, s)) ? borderFor(style, 'Bottom') : null;
  const isListItem = el?.tagName === 'LI' || style?.display === 'list-item';
  const boxed = boxFormatting(ctx);
  const titlesChart = !!el?.nextElementSibling && containsChart(el.nextElementSibling);
  return new D.Paragraph({
    children: runs,
    alignment,
    keepNext: titlesChart || undefined,
    spacing: {
      before: style ? twips(Math.min(px(style.marginTop), 16)) : 0,
      after: style ? twips(Math.max(4, Math.min(px(style.marginBottom) + px(style.paddingBottom), 16))) : 60,
    },
    bullet: isListItem ? { level: 0 } : undefined,
    tabStops: tabStopPx ? [{ type: D.TabStopType.RIGHT, position: twips(tabStopPx) }] : undefined,
    ...boxed,
    border:
      boxed.border ||
      (bottomBorder
        ? { bottom: { style: D.BorderStyle.SINGLE, size: Math.max(2, Math.round(bottomBorder.width * 6)), color: bottomBorder.color, space: 2 } }
        : undefined),
  });
}

function spacer(D: Docx): Paragraph {
  return new D.Paragraph({ spacing: { before: 0, after: 80 }, children: [new D.TextRun({ text: '', size: 8 })] });
}

function pageBreak(D: Docx): Paragraph {
  return new D.Paragraph({ children: [new D.PageBreak()] });
}

/** Word requires each table cell to end with a paragraph. */
function cellChildren(D: Docx, blocks: Block[]): Block[] {
  if (blocks.length === 0) return [new D.Paragraph({ children: [] })];
  if (blocks[blocks.length - 1] instanceof D.Table) return [...blocks, new D.Paragraph({ spacing: { after: 0 }, children: [] })];
  return blocks;
}

async function layoutTable(el: Element, rows: Element[][], style: CSSStyleDeclaration, ctx: Ctx): Promise<Block[]> {
  const { D } = ctx;
  const containerWidth = el.getBoundingClientRect().width || 1;
  const columnCount = Math.max(...rows.map((r) => r.length));
  const totalTwips = twips(ctx.maxWidthPx);
  const widestRow = rows.find((r) => r.length === columnCount) || rows[0];
  const rawWidths = widestRow.map((c) => Math.max(1, c.getBoundingClientRect().width));
  const rawTotal = rawWidths.reduce((a, b) => a + b, 0);
  const columnPcts = rawWidths.map((w) => (w / rawTotal) * 100);
  const alignLastRight = style.justifyContent === 'space-between';

  const tableRows: TableRow[] = [];
  for (const row of rows) {
    const cells: TableCell[] = [];
    for (let i = 0; i < row.length; i += 1) {
      const span = i === row.length - 1 && row.length < columnCount ? columnCount - row.length + 1 : 1;
      const cellPct = columnPcts.slice(i, i + span).reduce((a, b) => a + b, 0);
      const cellStyle = window.getComputedStyle(row[i]);
      const cellIsCard = isBox(row[i], cellStyle);
      const fill = cellIsCard ? backgroundHex(cellStyle) : null;
      const cellCtx: Ctx = {
        ...ctx,
        maxWidthPx: Math.max(60, (row[i].getBoundingClientRect().width / containerWidth) * ctx.maxWidthPx - 12),
        align: alignLastRight && row.length > 1 && i === row.length - 1 ? 'right' : undefined,
        inCell: true,
        box: undefined,
      };
      cells.push(
        new D.TableCell({
          children: cellChildren(D, cellIsCard ? await walkChildren(row[i], cellCtx) : await walkElement(row[i], cellCtx)),
          columnSpan: span > 1 ? span : undefined,
          width: { size: Math.round(cellPct), type: D.WidthType.PERCENTAGE },
          shading: fill ? { type: D.ShadingType.CLEAR, fill, color: 'auto' } : undefined,
          borders: cellIsCard ? cellBorders(D, [cellStyle]) : undefined,
          margins: { top: cellIsCard ? 60 : 0, bottom: cellIsCard ? 60 : 0, left: 80, right: 80 },
          verticalAlign: D.VerticalAlign.TOP,
        })
      );
    }
    const rowHeight = Math.max(...row.map((c) => c.getBoundingClientRect().height));
    tableRows.push(new D.TableRow({ children: cells, cantSplit: rowHeight < 3 * PX_PER_INCH || undefined }));
  }
  return [
    new D.Table({
      rows: tableRows,
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      columnWidths: columnPcts.map((p) => Math.round((p / 100) * totalTwips)),
      borders: noBorders(D),
      layout: D.TableLayoutType.AUTOFIT,
    }),
    spacer(D),
  ];
}

/** A two-item flex row (label on the left, value on the right) becomes one line with a right tab stop. */
async function labelValueParagraph(el: Element, left: Element, right: Element, ctx: Ctx): Promise<Paragraph | null> {
  const segments: Segment[] = [];
  for (const child of Array.from(left.childNodes)) await collectSegments(child, ctx, segments);
  segments.push({ kind: 'tab' });
  for (const child of Array.from(right.childNodes)) await collectSegments(child, ctx, segments);
  const leftText = segments.some((s) => s.kind === 'text' && s.text.trim());
  if (!leftText) return null;
  return paragraphFromSegments(segments, el, { ...ctx, align: undefined }, ctx.maxWidthPx - (ctx.box ? 12 : 0));
}

async function htmlTable(table: HTMLTableElement, ctx: Ctx): Promise<Block[]> {
  const { D } = ctx;
  const htmlRows = Array.from(table.rows).filter(isVisible);
  if (!htmlRows.length) return [];
  const columnCount = Math.max(
    ...htmlRows.map((r) => Array.from(r.cells).filter(isVisible).reduce((sum, c) => sum + (c.colSpan || 1), 0))
  );
  const parentWidth = table.parentElement?.getBoundingClientRect().width || 0;
  const widthRatio = parentWidth > 0 ? Math.min(1, table.getBoundingClientRect().width / parentWidth) : 1;
  const totalTwips = twips(ctx.maxWidthPx * Math.max(0.5, widthRatio));
  const measureRow =
    htmlRows.find((r) => Array.from(r.cells).filter(isVisible).length === columnCount) || htmlRows[0];
  const rawWidths = Array.from(measureRow.cells)
    .filter(isVisible)
    .flatMap((c) => Array.from({ length: c.colSpan || 1 }, () => Math.max(1, c.getBoundingClientRect().width / (c.colSpan || 1))));
  while (rawWidths.length < columnCount) rawWidths.push(rawWidths[rawWidths.length - 1] || 1);
  const rawTotal = rawWidths.reduce((a, b) => a + b, 0);
  const columnWidths = rawWidths.map((w) => Math.round((w / rawTotal) * totalTwips));
  const pxPerTwip = ctx.maxWidthPx / twips(ctx.maxWidthPx);

  const rows: TableRow[] = [];
  for (const tr of htmlRows) {
    const trStyle = window.getComputedStyle(tr);
    const section = tr.parentElement;
    const sectionStyle = section && section !== table ? window.getComputedStyle(section) : null;
    const isHeader = section?.tagName === 'THEAD';
    const cells: TableCell[] = [];
    let colIndex = 0;
    for (const td of Array.from(tr.cells).filter(isVisible)) {
      const tdStyle = window.getComputedStyle(td);
      const span = td.colSpan || 1;
      const widthTwips = columnWidths.slice(colIndex, colIndex + span).reduce((a, b) => a + b, 0);
      colIndex += span;
      const fill = backgroundHex(tdStyle) || backgroundHex(trStyle) || (sectionStyle ? backgroundHex(sectionStyle) : null);
      const cellCtx: Ctx = { ...ctx, maxWidthPx: Math.max(40, widthTwips * pxPerTwip - 12), align: undefined, inCell: true, box: undefined };
      const pad = (side: string) => twips(Math.min(px(tdStyle.getPropertyValue(`padding-${side}`)), 8));
      cells.push(
        new D.TableCell({
          children: cellChildren(D, await walkElement(td, cellCtx)),
          columnSpan: span > 1 ? span : undefined,
          rowSpan: td.rowSpan > 1 ? td.rowSpan : undefined,
          width: { size: widthTwips, type: D.WidthType.DXA },
          shading: fill ? { type: D.ShadingType.CLEAR, fill, color: 'auto' } : undefined,
          borders: cellBorders(D, [tdStyle, trStyle]),
          margins: { top: pad('top'), bottom: pad('bottom'), left: pad('left'), right: pad('right') },
          verticalAlign: D.VerticalAlign.CENTER,
        })
      );
    }
    rows.push(new D.TableRow({ children: cells, tableHeader: isHeader, cantSplit: true }));
  }
  return [
    new D.Table({
      rows,
      width: { size: Math.round(Math.max(0.5, widthRatio) * 100), type: D.WidthType.PERCENTAGE },
      columnWidths,
      borders: noBorders(D),
      layout: D.TableLayoutType.AUTOFIT,
    }),
    spacer(D),
  ];
}

/** Converts an element's children, grouping runs of inline content into paragraphs. */
async function walkChildren(el: Element, ctx: Ctx): Promise<Block[]> {
  const blocks: Block[] = [];
  let pending: Segment[] = [];
  const flush = () => {
    const paragraph = paragraphFromSegments(pending, el, ctx);
    if (paragraph) blocks.push(paragraph);
    pending = [];
  };
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as Element;
      if (!isVisible(childEl)) continue;
      if (isBlockish(childEl) || hasBlockChildren(childEl)) {
        flush();
        blocks.push(...(await walkElement(childEl, ctx)));
        continue;
      }
    }
    await collectSegments(child, ctx, pending);
  }
  flush();
  return blocks;
}

async function walkElement(el: Element, ctx: Ctx): Promise<Block[]> {
  const { D } = ctx;
  if (!isVisible(el)) return [];
  const out: Block[] = [];
  if (isPageBreakBefore(el)) out.push(pageBreak(D));

  if (isChartElement(el)) {
    const run = await chartRun(el as SVGSVGElement | HTMLCanvasElement, ctx);
    if (run) {
      out.push(
        new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 60, after: 120 }, ...boxFormatting(ctx), children: [run] })
      );
    }
    return out;
  }
  if (el instanceof SVGElement) return out;
  if (el instanceof HTMLTableElement) {
    out.push(...(await htmlTable(el, { ...ctx, box: undefined })));
    return out;
  }

  const style = window.getComputedStyle(el);
  const box = isBox(el, style);
  const innerCtx: Ctx = box
    ? {
        ...ctx,
        maxWidthPx: Math.max(60, ctx.maxWidthPx - 16),
        box: { fill: backgroundHex(style), border: SIDES.map((side) => borderFor(style, side)).find(Boolean) || null },
      }
    : ctx;
  let blocks: Block[];

  if (!hasBlockChildren(el)) {
    const segments: Segment[] = [];
    for (const child of Array.from(el.childNodes)) await collectSegments(child, innerCtx, segments);
    const paragraph = paragraphFromSegments(segments, el, innerCtx);
    blocks = paragraph ? [paragraph] : [];
  } else {
    const children = visibleChildren(el);
    const isRowLayout = /(^|-)(grid|flex)$/.test(style.display) && !style.flexDirection.startsWith('column');
    const rows = isRowLayout && children.length > 1 && !hasDirectText(el) ? groupIntoRows(children) : null;
    const isLabelValueRow =
      !!rows &&
      rows.length === 1 &&
      rows[0].length === 2 &&
      style.display.endsWith('flex') &&
      rows[0].every((child) => !hasBlockChildren(child) && !containsChart(child));
    if (rows && isLabelValueRow) {
      const paragraph = await labelValueParagraph(el, rows[0][0], rows[0][1], innerCtx);
      blocks = paragraph ? [paragraph] : [];
    } else if (rows && rows.some((r) => r.length > 1)) {
      blocks = children.some(containsChart)
        ? (await Promise.all(children.map((child) => walkElement(child, innerCtx)))).flat()
        : await layoutTable(el, rows, style, { ...innerCtx, box: undefined });
    } else {
      blocks = await walkChildren(el, innerCtx);
    }
  }

  out.push(...blocks);
  if (box && blocks.length) out.push(spacer(D));
  return out;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** One converted report section; each becomes its own Word section starting on a new page. */
export type WordSection = { blocks: Block[]; orientation: WordPageOrientation };

async function buildDocument(sections: WordSection[], options: { title: string }): Promise<Blob> {
  const D = await import('docx');
  const filled = sections.filter((s) => s.blocks.length);
  if (!filled.length) throw new Error('The report had no content to export yet.');
  const margin = Math.round(PAGE_MARGIN_INCHES * 1440);
  const doc = new D.Document({
    creator: 'Corelytics',
    title: options.title,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 20, color: '334155' },
          paragraph: { spacing: { after: 60 } },
        },
        heading1: {
          run: { font: 'Arial', size: 30, bold: true, color: '0F172A' },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, keepLines: true },
        },
        heading2: {
          run: { font: 'Arial', size: 24, bold: true, color: '1E293B' },
          paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, keepLines: true },
        },
      },
    },
    sections: filled.map((section) => ({
      properties: {
        type: D.SectionType.NEXT_PAGE,
        page: {
          size: {
            width: 12240,
            height: 15840,
            orientation: section.orientation === 'landscape' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT,
          },
          margin: { top: margin, right: margin, bottom: margin, left: margin, header: 360, footer: 360 },
        },
      },
      footers: {
        default: new D.Footer({
          children: [
            new D.Paragraph({
              alignment: D.AlignmentType.RIGHT,
              children: [new D.TextRun({ children: ['Page ', D.PageNumber.CURRENT], size: 16, color: '64748B' })],
            }),
          ],
        }),
      },
      children: section.blocks,
    })),
  });
  return D.Packer.toBlob(doc);
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Waits until the dynamically-loaded charts inside `root` have rendered. */
export async function waitForChartsToRender(root: HTMLElement, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  let lastCount = -1;
  let stableTicks = 0;
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const count = root.querySelectorAll('svg, canvas').length;
    stableTicks = count === lastCount ? stableTicks + 1 : 0;
    lastCount = count;
    if (stableTicks >= 3 && root.innerText.trim().length > 0) return;
  }
}

export function safeWordFileName(title: string): string {
  const safe = title.replace(/[^a-zA-Z0-9 \-_.&]/g, '').replace(/\s+/g, ' ').trim();
  return `${safe || 'Valuation Section'}.docx`;
}

/** Lays `root` out at Word page width and converts it to Word content for one section. */
export async function elementToWordSection(root: HTMLElement, orientation: WordPageOrientation): Promise<WordSection> {
  const previous = { width: root.style.width, maxWidth: root.style.maxWidth, maxHeight: root.style.maxHeight, overflow: root.style.overflowY };
  root.style.width = `${contentWidthPx(orientation)}px`;
  root.style.maxWidth = 'none';
  root.style.maxHeight = 'none';
  root.style.overflowY = 'visible';
  try {
    await nextFrame();
    await nextFrame();
    const D = await import('docx');
    const pageContentWidthPx = contentWidthPx(orientation);
    const blocks = await walkChildren(root, { D, maxWidthPx: pageContentWidthPx, pageContentWidthPx });
    return { blocks, orientation };
  } finally {
    root.style.width = previous.width;
    root.style.maxWidth = previous.maxWidth;
    root.style.maxHeight = previous.maxHeight;
    root.style.overflowY = previous.overflow;
  }
}

/** Combines converted sections into one .docx and downloads it. */
export async function exportWordSections(sections: WordSection[], options: { title: string; fileName: string }): Promise<void> {
  triggerDownload(await buildDocument(sections, options), options.fileName);
}

/** Lays `root` out at Word page width, converts it to an editable .docx, and downloads it. */
export async function exportElementToWord(
  root: HTMLElement,
  options: { title: string; fileName: string; orientation: WordPageOrientation }
): Promise<void> {
  await exportWordSections([await elementToWordSection(root, options.orientation)], options);
}

/** Renders an HTML string off-screen at page width so charts get real layout, then exports it to Word. */
export async function exportHtmlToWord(
  html: string,
  options: { title: string; fileName: string; orientation: WordPageOrientation }
): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position: fixed; left: -100000px; top: 0; background: #ffffff; font-family: Arial, sans-serif;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await exportElementToWord(host, options);
  } finally {
    document.body.removeChild(host);
  }
}
