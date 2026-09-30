/**
 * Finds icons that do not line up with the text beside them — the three faults
 * described under "Icons beside text" in Documentation/brand.md.
 *
 * - `off-centre`: the icon's middle is not level with the middle of the
 *   label's capitals — of its only line in a centred row, of its first line in
 *   a top-aligned one. Both brand fonts are built so a centred
 *   row gets this right on its own; a hit here means a font whose box is not
 *   centred on its capitals, or a manual nudge.
 * - `wraps`: the label runs onto a second line, so the icon is centred on the
 *   whole block instead of sitting beside the first line. (A title over a
 *   subtitle is a deliberate block and is not reported.)
 * - `icon-sets-baseline`: an `inline-flex` row that starts with an icon sits
 *   loose in a line of text. An SVG has no baseline, so the browser lines the
 *   row up by the icon's bottom edge and the label rides above its neighbours.
 *   Reported only where it shows: text beside the row, or a line taller than
 *   the row (a button alone in a block is neither).
 *
 * Runs in development only (components/brand/icon-alignment-check.tsx); it
 * measures the rendered page, so it needs a real browser.
 */

export type IconMisalignment = {
  kind: 'off-centre' | 'wraps' | 'icon-sets-baseline';
  label: string;
  element: Element;
  /** off-centre only: how far the icon's middle sits below the capitals' middle. */
  offsetPx?: number;
};

// A row is judged off-centre from one pixel: below that it is rounding.
const TOLERANCE_PX = 1;
// Anything wider than this is a picture, not an icon.
const MAX_ICON_PX = 48;

const isFlex = (display: string) => display.includes('flex') || display.includes('grid');
const shown = (r: DOMRect) => r.width > 0 && r.height > 0;

function firstContent(el: Element): ChildNode | null {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.COMMENT_NODE) continue;
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
    return node;
  }
  return null;
}

export function findIconMisalignments(doc: Document = document): IconMisalignment[] {
  const win = doc.defaultView;
  if (!win) return [];
  const style = (el: Element) => win.getComputedStyle(el);
  const ctx = doc.createElement('canvas').getContext('2d');
  const found: IconMisalignment[] = [];

  // Where the capitals sit, from the font file: the ascent puts the baseline
  // in the text box, the height of an H gives the capitals.
  const capitals = (el: Element) => {
    if (!ctx) return null;
    const cs = style(el);
    // The ascent at a large size, because canvas rounds it to whole pixels;
    // the H at the real size, so a variable font measures the optical cut it
    // draws there.
    ctx.font = `${cs.fontWeight} 1000px ${cs.fontFamily}`;
    const big = ctx.measureText('H');
    const scale = parseFloat(cs.fontSize) / 1000;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return {
      ascent: big.fontBoundingBoxAscent * scale,
      descent: big.fontBoundingBoxDescent * scale,
      cap: ctx.measureText('H').actualBoundingBoxAscent,
    };
  };

  for (const svg of doc.querySelectorAll('svg')) {
    const iconRect = svg.getBoundingClientRect();
    if (!shown(iconRect) || iconRect.width > MAX_ICON_PX) continue;

    // The icon, or the badge (and any one-line box) it sits in when that
    // holds nothing else.
    let icon: Element = svg;
    let row = svg.parentElement;
    while (row && row.childElementCount === 1 && !row.textContent?.trim()) {
      icon = row;
      row = row.parentElement;
    }
    if (!row) continue;
    const rowStyle = style(row);
    if (!rowStyle.display.includes('flex') || rowStyle.flexDirection !== 'row') continue;
    // A centred row centres the icon on the label; a top-aligned row keeps it
    // beside the first line, which is what a label that may wrap needs.
    const centred = rowStyle.alignItems === 'center';
    if (!centred && rowStyle.alignItems !== 'flex-start' && rowStyle.alignItems !== 'start') continue;

    // The label: the text in the row beside the icon.
    const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const texts: { node: Text; lines: DOMRect[] }[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.textContent?.trim() || icon.contains(node)) continue;
      const range = doc.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter(shown);
      if (lines.length) texts.push({ node, lines });
    }
    if (!texts.length || !texts[0].node.parentElement) continue;
    const label = texts[0].node;
    const lines = texts[0].lines;
    const text = label.textContent!.trim().slice(0, 40);

    const tops = new Set(texts.flatMap((t) => t.lines.map((r) => Math.round(r.top))));
    if (centred && tops.size > 1) {
      // A title over a subtitle is a deliberate block, centred as one. One
      // label running onto a second line is not.
      if (texts.length === 1) found.push({ kind: 'wraps', label: text, element: row });
      continue;
    }

    const box = icon.getBoundingClientRect();
    // In a top-aligned row, only text whose first line sits beside the icon is
    // its label; a caption under a picture is not.
    if (!centred && (lines[0].bottom < box.top || lines[0].top > box.bottom)) continue;
    const m = capitals(label.parentElement!);
    if (!m) continue;
    const capMiddle = lines[0].top + m.ascent - m.cap / 2;
    const offset = box.top + box.height / 2 - capMiddle;
    if (Math.abs(offset) >= TOLERANCE_PX) {
      found.push({ kind: 'off-centre', label: text, element: row, offsetPx: Math.round(offset * 10) / 10 });
    }
  }

  for (const el of doc.querySelectorAll('*')) {
    const display = style(el).display;
    if (display !== 'inline-flex' && display !== 'inline-grid') continue;
    const first = firstContent(el);
    if (!(first instanceof win.SVGSVGElement) || !el.textContent?.trim()) continue;
    const parent = el.parentElement;
    if (!parent || isFlex(style(parent).display)) continue;
    const rect = el.getBoundingClientRect();
    if (!shown(rect)) continue;

    // The row sits on the line by its own baseline, which — its first item
    // being an SVG — is the icon's bottom margin edge. A row given another
    // vertical-align was placed on purpose; leave it.
    if (style(el).verticalAlign !== 'baseline') continue;
    const lineBaseline = first.getBoundingClientRect().bottom + parseFloat(style(first).marginBottom);
    // …and the baseline of the row's own label.
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let label: Text | null = null;
    while (walker.nextNode()) {
      if ((walker.currentNode as Text).textContent?.trim()) {
        label = walker.currentNode as Text;
        break;
      }
    }
    if (!label?.parentElement) continue;
    const range = doc.createRange();
    range.selectNodeContents(label);
    const labelLine = [...range.getClientRects()].find(shown);
    const lm = capitals(label.parentElement);
    const pm = capitals(parent);
    if (!labelLine || !lm || !pm) continue;
    if (Math.abs(labelLine.top + lm.ascent - lineBaseline) < TOLERANCE_PX) continue;

    // Off the line's baseline only matters if the line can show it: text
    // beside the row, or the line (its strut) reaching past the row, which
    // shifts the row inside its parent. A button alone in a block is neither.
    const ps = style(parent);
    const lineHeight = ps.lineHeight === 'normal' ? pm.ascent + pm.descent : parseFloat(ps.lineHeight);
    const halfLeading = (lineHeight - pm.ascent - pm.descent) / 2;
    const strutTop = lineBaseline - pm.ascent - halfLeading;
    const strutBottom = lineBaseline + pm.descent + halfLeading;
    const strutSticksOut = strutTop < rect.top - 0.5 || strutBottom > rect.bottom + 0.5;
    const hasNeighbours = [...parent.childNodes].some(
      (n) => n !== el && n.textContent?.trim() && (n.nodeType === Node.TEXT_NODE || style(n as Element).display.startsWith('inline')),
    );
    if (strutSticksOut || hasNeighbours) {
      found.push({ kind: 'icon-sets-baseline', label: el.textContent.trim().slice(0, 40), element: el });
    }
  }

  return found;
}
