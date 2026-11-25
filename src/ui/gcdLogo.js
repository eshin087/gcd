// The game's name, "gcd", always lowercase, in the block / box-drawing letters of the old title logo
// (ui/blockText.js's faces), drawn as true lowercase: an x-height of three rows, the d's stem rising two
// rows above it and the g's tail hanging two rows below. Eight rows, 26 columns.
//
// The loading screen in index.html draws the SAME rows before any module loads (it cannot import
// this file): change both together.

const G = ['        ', '        ', ' ██████╗', '██╔══██║', '╚██████║', ' ╚═══██║', ' █████╔╝', ' ╚════╝ '];
const C = ['        ', '        ', ' ██████╗', '██╔════╝', '╚██████╗', ' ╚═════╝', '        ', '        '];
const D = ['     ██╗', '     ██║', ' ██████║', '██╔══██║', '╚██████║', ' ╚═════╝', '        ', '        '];

export const GCD_LOGO = Object.freeze(G.map((g, i) => `${g} ${C[i]} ${D[i]}`));
export const GCD_LOGO_W = GCD_LOGO[0].length;
