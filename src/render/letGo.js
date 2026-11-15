import * as THREE from 'three';

// LETTING GO: a dying wyrm comes apart as text. Its letters let go one screen cell at a time, from
// the top of the body down, each column a little behind or ahead of its neighbours; a letter that
// has let go falls down the screen, burning out as it falls, and then its cell is empty and the
// ground shows through.
//
// Two shaders must agree on WHEN a cell lets go, so the rule lives here and both include it:
//   - the wyrm's materials (materials.js, SG_WYRM) discard a cell once its letter has fallen away;
//   - the ASCII pass (pipeline.js) prints the cell black from the moment its letter lets go, and
//     draws that letter falling.
// The cells are the wyrm's art cells, counted from its own screen anchor (the pass's uWyrmAnchor),
// so the pattern rides with the body when the camera moves.
//
// Shared uniforms (on U, made once by letGoUniforms):
//   uWyrmGrid   xy = the art cell (px), zw = the wyrm's grid anchor (px, lower-left origin). Written
//               by the pipeline at the top of render(), before the scene pass.
//   uWyrmLetGo  x = how far the dissolve has run, 0..1 (0 = off: nothing below is evaluated),
//               y = the body's top row (cells above the anchor), z = its height in rows,
//               w = its half width in cells. Written by the dragon (Dragon._applyMaterials).

export const LET_GO = {
  /** Share of the dissolve a letter spends falling (the material lets the cell go after it). */
  window: 0.12,
  /** Cells a letter falls in that time (accelerating). */
  fall: 5,
  /** What orders the cells: the row from the top down, slow strands of columns, a column, a cell. */
  rows: 0.64,
  strand: 0.18,
  col: 0.1,
  one: 0.08,
};

/**
 * JS twin of letGoAt for a body point: the share of the dissolve at which the letters round a point
 * `row` cells above the grid anchor let go, on average (lg = uWyrmLetGo's value).
 */
export function letGoRow(row, lg) {
  const top = Math.min(1, Math.max(0, (lg.y - row) / Math.max(lg.z, 1)));
  return (top * LET_GO.rows + 0.5 * (LET_GO.strand + LET_GO.col + LET_GO.one)) * (1 - LET_GO.window);
}

/** The shared uniform objects, created on U the first time anyone asks. */
export function letGoUniforms(U) {
  U.uWyrmGrid ??= { value: new THREE.Vector4(5, 8, 0, 0) };
  U.uWyrmLetGo ??= { value: new THREE.Vector4(0, 20, 40, 60) };
  return { uWyrmGrid: U.uWyrmGrid, uWyrmLetGo: U.uWyrmLetGo };
}

/**
 * GLSL: the uniforms and letGoAt(cell): the share of the dissolve (0 .. 1 - window) at which the
 * cell lets go. Top rows first; columns in slow waves a few cells wide plus a little of their own,
 * so the body drains in strands and not along a ruled line; each cell a touch of its own.
 */
export const LET_GO_GLSL = /* glsl */ `
  uniform vec4 uWyrmGrid;
  uniform vec4 uWyrmLetGo;
  const float LG_WINDOW = ${LET_GO.window.toFixed(3)};
  const float LG_FALL = ${LET_GO.fall.toFixed(1)};
  float lgHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float letGoAt(vec2 cell) {
    float top = clamp((uWyrmLetGo.y - cell.y) / max(uWyrmLetGo.z, 1.0), 0.0, 1.0);
    float cx = cell.x / 4.0;
    float f = fract(cx);
    float strand = mix(lgHash(vec2(floor(cx), 3.7)), lgHash(vec2(floor(cx) + 1.0, 3.7)), f * f * (3.0 - 2.0 * f));
    float col = lgHash(vec2(cell.x, 9.1));
    float one = lgHash(cell * 0.73 + 5.1);
    return (top * ${LET_GO.rows.toFixed(3)} + strand * ${LET_GO.strand.toFixed(3)} + col * ${LET_GO.col.toFixed(3)} + one * ${LET_GO.one.toFixed(3)}) * (1.0 - LG_WINDOW);
  }
`;
