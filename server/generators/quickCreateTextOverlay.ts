export interface QuickCreateSection {
  heading: string;
  body: string;
}

export interface QuickCreatePageCopy {
  title: string;
  subtitle: string;
  sections: QuickCreateSection[];
  footerNote: string;
}

const PAGE_WIDTH = 2550;
const PAGE_HEIGHT = 3300;
const FONT_FAMILY = "DejaVu Sans";
const BRANDING = "WishesWithoutBordersCo";

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(value: string): string {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(value: string, maxChars: number): string[] {
  const words = cleanText(value).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const originalWord of words) {
    const chunks: string[] = [];
    let word = originalWord;
    while (word.length > maxChars) {
      chunks.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (word) chunks.push(word);

    for (const chunk of chunks) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = chunk;
      }
    }
  }

  if (current) lines.push(current);
  return lines;
}

function fitText(
  value: string,
  width: number,
  height: number,
  preferredSize: number,
  minimumSize: number,
  lineHeightRatio = 1.28
): { fontSize: number; lineHeight: number; lines: string[] } {
  for (let fontSize = preferredSize; fontSize >= minimumSize; fontSize -= 2) {
    const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.56)));
    const lines = wrapText(value, maxChars);
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    if (lines.length * lineHeight <= height) {
      return { fontSize, lineHeight, lines };
    }
  }

  const fontSize = minimumSize;
  const lineHeight = Math.round(fontSize * lineHeightRatio);
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.56)));
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const lines = wrapText(value, maxChars);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    const last = visible[visible.length - 1] ?? "";
    visible[visible.length - 1] =
      `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
    return { fontSize, lineHeight, lines: visible };
  }

  return { fontSize, lineHeight, lines };
}

function renderTextLines({
  lines,
  x,
  y,
  fontSize,
  lineHeight,
  fill,
  weight = 400,
  anchor = "start",
}: {
  lines: string[];
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle";
}): string {
  if (lines.length === 0) return "";

  return `<text x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("")}</text>`;
}

function normalizedCopy(copy: QuickCreatePageCopy): QuickCreatePageCopy {
  const sections = copy.sections
    .map(section => ({
      heading: cleanText(section.heading),
      body: cleanText(section.body),
    }))
    .filter(section => section.heading || section.body)
    .slice(0, 10);

  return {
    title: cleanText(copy.title) || "Untitled Page",
    subtitle: cleanText(copy.subtitle),
    sections:
      sections.length > 0
        ? sections
        : [{ heading: "Overview", body: "Content prepared for this page." }],
    footerNote: cleanText(copy.footerNote),
  };
}

export function buildQuickCreateTextOverlaySvg(
  sourceCopy: QuickCreatePageCopy
): Buffer {
  const copy = normalizedCopy(sourceCopy);
  const margin = 125;
  const panelGap = 34;
  const headerX = margin;
  const headerY = 105;
  const headerWidth = PAGE_WIDTH - margin * 2;

  const titleFit = fitText(copy.title, headerWidth - 180, 190, 112, 68, 1.08);
  const subtitleFit = copy.subtitle
    ? fitText(copy.subtitle, headerWidth - 210, 120, 48, 34, 1.22)
    : { fontSize: 0, lineHeight: 0, lines: [] as string[] };
  const titleHeight = titleFit.lines.length * titleFit.lineHeight;
  const subtitleHeight = subtitleFit.lines.length * subtitleFit.lineHeight;
  const headerHeight = Math.max(
    300,
    95 + titleHeight + (subtitleHeight > 0 ? 38 + subtitleHeight : 0) + 70
  );

  const footerY = PAGE_HEIGHT - 112;
  const contentY = headerY + headerHeight + 48;
  const contentBottom = footerY - 82;
  const contentHeight = contentBottom - contentY;
  const columns = copy.sections.length >= 6 ? 2 : 1;
  const rows = Math.ceil(copy.sections.length / columns);
  const panelWidth =
    (PAGE_WIDTH - margin * 2 - panelGap * (columns - 1)) / columns;
  const panelHeight = (contentHeight - panelGap * Math.max(0, rows - 1)) / rows;

  const panels = copy.sections
    .map((section, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (panelWidth + panelGap);
      const y = contentY + row * (panelHeight + panelGap);
      const paddingX = columns === 2 ? 54 : 68;
      const paddingTop = columns === 2 ? 46 : 52;
      const textWidth = panelWidth - paddingX * 2;
      const headingFit = fitText(
        section.heading,
        textWidth,
        Math.min(116, panelHeight * 0.3),
        columns === 2 ? 48 : 58,
        columns === 2 ? 34 : 40,
        1.12
      );
      const headingHeight = headingFit.lines.length * headingFit.lineHeight;
      const bodyY = y + paddingTop + headingHeight + 30;
      const bodyHeight = Math.max(
        45,
        panelHeight - paddingTop - headingHeight - 62
      );
      const bodyFit = fitText(
        section.body,
        textWidth,
        bodyHeight,
        columns === 2 ? 38 : 44,
        columns === 2 ? 27 : 30,
        1.3
      );

      return `<g>
        <rect x="${x}" y="${y}" width="${panelWidth}" height="${panelHeight}" rx="34" fill="#031a34" fill-opacity="0.86" stroke="#6ee7f5" stroke-opacity="0.82" stroke-width="5"/>
        <rect x="${x + 18}" y="${y + 18}" width="14" height="${Math.max(50, panelHeight - 36)}" rx="7" fill="#ffd84d"/>
        ${renderTextLines({
          lines: headingFit.lines,
          x: x + paddingX,
          y: y + paddingTop + headingFit.fontSize,
          fontSize: headingFit.fontSize,
          lineHeight: headingFit.lineHeight,
          fill: "#ffd84d",
          weight: 700,
        })}
        ${renderTextLines({
          lines: bodyFit.lines,
          x: x + paddingX,
          y: bodyY + bodyFit.fontSize,
          fontSize: bodyFit.fontSize,
          lineHeight: bodyFit.lineHeight,
          fill: "#ffffff",
          weight: 400,
        })}
      </g>`;
    })
    .join("");

  const titleStartY = headerY + 78 + titleFit.fontSize;
  const subtitleStartY = titleStartY + titleHeight + 24 + subtitleFit.fontSize;
  const footerNote = copy.footerNote ? ` • ${copy.footerNote}` : "";
  const footerText = `${BRANDING}${footerNote}`;
  const footerFit = fitText(
    footerText,
    PAGE_WIDTH - margin * 2,
    58,
    34,
    26,
    1.1
  );

  const svg = `<svg width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <rect x="${headerX}" y="${headerY}" width="${headerWidth}" height="${headerHeight}" rx="46" fill="#031a34" fill-opacity="0.9" stroke="#6ee7f5" stroke-opacity="0.9" stroke-width="6"/>
      <rect x="${headerX + 32}" y="${headerY + 32}" width="${headerWidth - 64}" height="12" rx="6" fill="#ffd84d"/>
      ${renderTextLines({
        lines: titleFit.lines,
        x: PAGE_WIDTH / 2,
        y: titleStartY,
        fontSize: titleFit.fontSize,
        lineHeight: titleFit.lineHeight,
        fill: "#ffffff",
        weight: 700,
        anchor: "middle",
      })}
      ${renderTextLines({
        lines: subtitleFit.lines,
        x: PAGE_WIDTH / 2,
        y: subtitleStartY,
        fontSize: subtitleFit.fontSize,
        lineHeight: subtitleFit.lineHeight,
        fill: "#bff6ff",
        weight: 400,
        anchor: "middle",
      })}
      ${panels}
      <rect x="${margin}" y="${footerY - 42}" width="${PAGE_WIDTH - margin * 2}" height="76" rx="30" fill="#031a34" fill-opacity="0.88"/>
      ${renderTextLines({
        lines: footerFit.lines,
        x: PAGE_WIDTH / 2,
        y: footerY + 8,
        fontSize: footerFit.fontSize,
        lineHeight: footerFit.lineHeight,
        fill: "#ffffff",
        weight: 700,
        anchor: "middle",
      })}
    </g>
  </svg>`;

  return Buffer.from(svg);
}
