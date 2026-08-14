// E-13B MICR character set as vector glyph outlines (rectangle decomposition).
//
// E-13B is the magnetic-ink font printed on the bottom "MICR line" of US bank
// checks: digits 0-9 plus four delimiter symbols. Each glyph is a list of
// axis-aligned rectangles [x, y, w, h] on a normalized grid:
//   * unit = 1 mil (0.001")
//   * y = 0 is the BASELINE, y increases UPWARD
//   * BODY_HEIGHT = 91 units (0.091" tall body)
//   * ADVANCE     = 130 units (0.130" MICR pitch, 8 chars/inch)
// Symbol keys: 'T' Transit, 'A' Amount, 'O' On-Us, 'D' Dash. ' ' = blank advance.
//
// Ported from the standalone BLZ check generator (scripts/e13b_glyphs.py) so the
// LE Pro "Check Print" feature draws the identical, genuine E-13B MICR geometry.

export const ADVANCE = 130; // units per character cell (0.130" pitch)
export const BODY_HEIGHT = 91; // tall-glyph body height in units

// Stroke weights (mils) — E-13B mixes heavy and light strokes.
const T_THICK = 22;
const T_MED = 16;
const BW = 80; // nominal digit body width
const LX = 8; // left inset of the body within the cell
const TOP = BODY_HEIGHT; // 91
const MID = 45; // BODY_HEIGHT / 2, floored

// Each entry: array of [x, y, w, h] ink rectangles.
export const GLYPHS = {
  // ── digits ──────────────────────────────────────────────────────────────
  "0": [
    [LX, 0, T_THICK, TOP],
    [LX + BW - T_MED, 0, T_MED, TOP],
    [LX, TOP - T_MED, BW, T_MED],
    [LX, 0, BW, T_MED],
  ],
  "1": [
    [LX + 30, 0, T_THICK, TOP],
    [LX + 30 - 18, TOP - T_MED, 18 + T_THICK, T_MED],
    [LX + 30 - 16, 0, T_THICK + 32, T_MED],
  ],
  "2": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX + BW - T_MED, MID, T_MED, TOP - MID],
    [LX, MID, BW, T_MED],
    [LX, 0, T_THICK, MID + T_MED],
    [LX, 0, BW, T_MED],
  ],
  "3": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX, MID, BW, T_MED],
    [LX, 0, BW, T_MED],
    [LX + BW - T_THICK, 0, T_THICK, TOP],
  ],
  "4": [
    [LX, MID, T_MED, TOP - MID],
    [LX, MID, BW, T_MED],
    [LX + BW - T_THICK, 0, T_THICK, TOP],
  ],
  "5": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX, MID, BW, T_MED],
    [LX, MID, T_MED, TOP - MID],
    [LX + BW - T_THICK, 0, T_THICK, MID + T_MED],
    [LX, 0, BW, T_MED],
  ],
  "6": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX, 0, T_THICK, TOP],
    [LX, MID, BW, T_MED],
    [LX + BW - T_MED, 0, T_MED, MID + T_MED],
    [LX, 0, BW, T_MED],
  ],
  "7": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX + BW - T_THICK, 0, T_THICK, TOP - T_MED],
  ],
  "8": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX, MID, BW, T_MED],
    [LX, 0, BW, T_MED],
    [LX, 0, T_THICK, TOP],
    [LX + BW - T_MED, 0, T_MED, TOP],
  ],
  "9": [
    [LX, TOP - T_MED, BW, T_MED],
    [LX, MID, BW, T_MED],
    [LX, MID, T_MED, TOP - MID],
    [LX + BW - T_THICK, 0, T_THICK, TOP],
    [LX, 0, BW, T_MED],
  ],
  // ── delimiter symbols ────────────────────────────────────────────────────
  // Transit (⑆): heavy '||' framing the routing number.
  T: [
    [LX + 12, 0, 22, TOP],
    [LX + 12 + 22 + 22, 0, 22, TOP],
  ],
  // Amount (⑇): stepped/pyramidal solid block, the heaviest symbol.
  A: [
    [LX + 4, 0, 84, 28],
    [LX + 4 + 16, 31, 84 - 32, 28],
    [LX + 4 + 32, 62, 84 - 64, 29],
  ],
  // On-Us (⑈): stubby anchor — central stem, top-right arm, wide base foot.
  O: [
    [LX + 20, 0, 20, TOP],
    [LX + 20 + 20, TOP - 24, 30, 24],
    [LX + 20 - 14, 0, 20 + 44, 24],
  ],
  // Dash (⑉): short centered horizontal bar.
  D: [[LX + 6, MID - 10, 84, 20]],
};

/**
 * Standard commercial-check MICR line:
 *   On-Us[ checkNo ]On-Us   Transit[ routing ]Transit   account On-Us
 * @returns {string} e.g. "O1001O T021000021T 606031220O"
 */
export function micrLine(routing, account, checkNo) {
  return `O${checkNo}O T${routing}T ${account}O`;
}
