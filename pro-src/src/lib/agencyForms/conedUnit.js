/**
 * Con Edison Form A — "Room/Floor/Office #/Apartment #" (Part Supply) field.
 * Portal rejects overly long unit text. Auto-abbreviate free text into short forms
 * Con Ed accepts (~6 chars hard max, usually 3).
 *
 * Behavior (Levi 2026-07-30):
 * - FIRST pass: auto-reframe user text into short abbreviation.
 * - If the user RE-CORRECTS after that auto pass, leave their text exactly
 *   (respect second correction — do not re-abbreviate). Still hard-cap length.
 */

export const CONED_UNIT_MAX_LEN = 6;

const WORD_MAP = [
  [/\bapartments?\b/gi, "apt"],
  [/\bapartment\b/gi, "apt"],
  [/\bapts?\b/gi, "apt"],
  [/\bsuites?\b/gi, "ste"],
  [/\bfloors?\b/gi, "fl"],
  [/\bflr\b/gi, "fl"],
  [/\boffices?\b/gi, "ofc"],
  [/\broom\b/gi, "rm"],
  [/\bbasement\b/gi, "bsmt"],
  [/\bground\b/gi, "grnd"],
  [/\bbuilding\b/gi, "bldg"],
  [/\bunit\b/gi, "u"],
  [/\bnumber\b/gi, "#"],
  [/\bnum\b/gi, "#"],
];

const ORDINAL_WORDS = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
  sixth: "6",
  seventh: "7",
  eighth: "8",
  ninth: "9",
  tenth: "10",
};

/**
 * Abbreviate free-text unit into Con Ed short form.
 * @param {string} raw
 * @returns {string}
 */
export function abbreviateConedUnit(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";

  // Number words → digits
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
    (m) => ORDINAL_WORDS[m.toLowerCase()] || m
  );

  for (const [re, rep] of WORD_MAP) s = s.replace(re, rep);

  // "apt 1" / "floor 3" → "apt1" / "fl3" (drop spaces between letters and numbers)
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/([a-zA-Z#])\s+(\d)/g, "$1$2");
  s = s.replace(/(\d)\s+([a-zA-Z])/g, "$1$2");
  // Drop remaining spaces and punctuation except # -
  s = s.replace(/[^\w#\-]/g, "");
  // Prefer lowercase letter prefix
  s = s.replace(/^([A-Za-z]+)/, (m) => m.toLowerCase());

  if (s.length > CONED_UNIT_MAX_LEN) s = s.slice(0, CONED_UNIT_MAX_LEN);
  return s;
}

/**
 * Hard max-length guard (always applied).
 * @param {string} raw
 */
export function clampConedUnit(raw) {
  return String(raw || "").slice(0, CONED_UNIT_MAX_LEN);
}

/**
 * Apply first-pass auto-abbrev, or honor a second user correction.
 *
 * Track with companion keys on answers:
 *   serviceUnit / mailingUnit  — the field value
 *   serviceUnitUserCorrected / mailingUnitUserCorrected — bool, set after user edits post-auto
 *   serviceUnitAutoApplied / mailingUnitAutoApplied — bool, set after first auto pass
 *
 * @param {object} opts
 * @param {string} opts.prevValue
 * @param {string} opts.nextValue
 * @param {boolean} [opts.alreadyAutoApplied]
 * @param {boolean} [opts.userCorrected]
 * @returns {{ value: string, autoApplied: boolean, userCorrected: boolean }}
 */
export function applyConedUnitInput({
  prevValue = "",
  nextValue = "",
  alreadyAutoApplied = false,
  userCorrected = false,
} = {}) {
  const raw = String(nextValue || "");
  if (!raw.trim()) {
    return { value: "", autoApplied: false, userCorrected: false };
  }

  // Second correction: leave exactly as typed (still hard-cap).
  if (userCorrected || alreadyAutoApplied) {
    // If they already got an auto pass and are typing again, treat as correction.
    if (alreadyAutoApplied && String(prevValue) !== raw) {
      return {
        value: clampConedUnit(raw),
        autoApplied: true,
        userCorrected: true,
      };
    }
    if (userCorrected) {
      return {
        value: clampConedUnit(raw),
        autoApplied: true,
        userCorrected: true,
      };
    }
  }

  // First pass: auto-abbreviate when the text looks free-form (spaces / long words).
  const needsAbbrev =
    /\s/.test(raw) ||
    raw.length > CONED_UNIT_MAX_LEN ||
    /\b(apartment|floor|suite|office|room|basement|unit|number)\b/i.test(raw);

  if (needsAbbrev) {
    const abbr = abbreviateConedUnit(raw);
    return {
      value: abbr || clampConedUnit(raw),
      autoApplied: true,
      userCorrected: false,
    };
  }

  return {
    value: clampConedUnit(raw),
    autoApplied: false,
    userCorrected: false,
  };
}
