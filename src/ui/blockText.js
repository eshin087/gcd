// Big words built from characters: the banners' block letters, in the same six-row letterforms as
// the ABYSS title logo (ui/screens.js). blockLines('YOU DIED') → six strings; `plain` gives the
// same shapes in '#' alone (the logo's box-drawing shadow strokes left out).

const ROWS = 6;
const F = {
  A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  C: [' ██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
  D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  F: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '██║     ', '╚═╝     '],
  G: [' ██████╗ ', '██╔════╝ ', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  H: ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
  J: ['     ██╗', '     ██║', '     ██║', '██   ██║', '╚█████╔╝', ' ╚════╝ '],
  K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'],
  L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
  M: ['███╗   ███╗', '████╗ ████║', '██╔████╔██║', '██║╚██╔╝██║', '██║ ╚═╝ ██║', '╚═╝     ╚═╝'],
  N: ['███╗   ██╗', '████╗  ██║', '██╔██╗ ██║', '██║╚██╗██║', '██║ ╚████║', '╚═╝  ╚═══╝'],
  O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  P: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔═══╝ ', '██║     ', '╚═╝     '],
  Q: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║▄▄ ██║', '╚██████╔╝', ' ╚══▀▀═╝ '],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
  U: ['██╗   ██╗', '██║   ██║', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  W: ['██╗    ██╗', '██║    ██║', '██║ █╗ ██║', '██║███╗██║', '╚███╔███╔╝', ' ╚══╝╚══╝ '],
  X: ['██╗  ██╗', '╚██╗██╔╝', ' ╚███╔╝ ', ' ██╔██╗ ', '██╔╝ ██╗', '╚═╝  ╚═╝'],
  Y: ['██╗   ██╗', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚██╔╝  ', '   ██║   ', '   ╚═╝   '],
  Z: ['███████╗', '╚══███╔╝', '  ███╔╝ ', ' ███╔╝  ', '███████╗', '╚══════╝'],
  ' ': ['    ', '    ', '    ', '    ', '    ', '    '],
  ',': ['   ', '   ', '   ', '   ', '▄█╗', '╚═╝'],
  '.': ['   ', '   ', '   ', '   ', '██╗', '╚═╝'],
  '-': ['      ', '      ', '█████╗', '╚════╝', '      ', '      '],
  "'": ['██╗', '╚═╝', '   ', '   ', '   ', '   '],
  '!': ['██╗', '██║', '██║', '╚═╝', '██╗', '╚═╝'],
};

/** Six rows of characters spelling `text` (letters it has no shape for are skipped). */
export function blockLines(text, plain = false) {
  const rows = Array.from({ length: ROWS }, () => '');
  for (const ch of String(text ?? '').toUpperCase()) {
    const g = F[ch];
    if (!g) continue;
    for (let i = 0; i < ROWS; i++) rows[i] += g[i];
  }
  if (!plain) return rows;
  // '#' alone: the shadow strokes go, and with them the sixth row (it is shadow only)
  return rows.map((r) => r.replace(/[█▄▀]/g, '#').replace(/[^# ]/g, ' ')).filter((r, i) => i < ROWS - 1 || r.trim());
}

/**
 * `text` as block letters, broken between words into as few stacked blocks as keep every row at
 * most `maxCols` characters wide. Returns { lines, cols }: all rows (a blank row between blocks,
 * each block centred) and the widest row's length.
 */
export function blockText(text, { maxCols = 120, plain = false } = {}) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const blocks = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && blockLines(next, plain)[0].length > maxCols) {
      blocks.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) blocks.push(cur);
  const rendered = blocks.map((b) => blockLines(b, plain));
  const cols = Math.max(1, ...rendered.map((r) => r[0].length));
  const lines = [];
  rendered.forEach((r, i) => {
    if (i) lines.push('');
    const pad = ' '.repeat(Math.floor((cols - r[0].length) / 2));
    for (const row of r) lines.push(pad + row);
  });
  return { lines, cols };
}
