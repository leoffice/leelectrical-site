// Customer-facing description text for invoice/estimate print + PDF.
// Product/Service (itemName) is backend-only — never print it.
// Preserve blank lines and professional bullet/dot layout.

/** Normalize description for print. Never falls back to product/service name. */
export function formatPrintDescription(description) {
  let s = String(description ?? "");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Unicode bullets / middle-dots at line start → ASCII dash bullets
  s = s.replace(/^[ \t]*[•●◦▪▫·∙‣⁃]/gm, (m) => m.replace(/[•●◦▪▫·∙‣⁃]/, "-"));
  // En/em dash anywhere → regular hyphen (PDF fonts often print them as "?")
  s = s.replace(/[–—]/g, "-");
  // "-text" → "- text" (professional gap after the bullet)
  s = s.replace(/^([ \t]*-)(?=[^\s-])/gm, "$1 ");
  // Smart quotes / ellipsis / nbsp → PDF-safe ASCII
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/\u2026/g, "...");
  s = s.replace(/\u00a0/g, " ");
  // Drop only leading/trailing blank lines; keep intentional gaps inside
  s = s.replace(/^\n+/, "").replace(/\n+$/, "");
  return s;
}

/**
 * Word-wrap for PDF description columns.
 * - Blank lines in the source stay blank (spacing gap on the page)
 * - Bullet lines keep their "- " prefix; wrapped continuations indent
 * - `max` is a character budget when measure is omitted, otherwise a width
 *   and measure(str) returns the rendered width of str
 */
export function wrapPrintDescription(text, max, measure) {
  const widthOf = typeof measure === "function" ? measure : (str) => String(str || "").length;
  const out = [];

  for (const raw of String(text || "").split("\n")) {
    if (!String(raw).trim()) {
      out.push("");
      continue;
    }

    const bulletMatch = raw.match(/^(\s*(?:[-*]|\d+\.)\s+)/);
    const prefix = bulletMatch ? bulletMatch[1] : "";
    const body = bulletMatch ? raw.slice(bulletMatch[1].length) : raw.replace(/^\s+/, "");
    const words = body.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push(prefix.trimEnd());
      continue;
    }

    // Continuation indent matches bullet body start (cap at 4 spaces)
    const cont = prefix ? " ".repeat(Math.min(prefix.length, 4)) : "";
    let cur = prefix;

    for (const w of words) {
      const candidate = cur === prefix || cur === cont || cur === "" ? cur + w : `${cur} ${w}`;
      if (widthOf(candidate) <= max || cur === "" || cur === prefix || cur === cont) {
        // Fits, or first word on this line (may still overflow a single long word)
        if (widthOf(candidate) > max && typeof measure !== "function") {
          // Hard-break long tokens by character budget
          let rest = candidate;
          while (widthOf(rest) > max && rest.length > 1) {
            out.push(rest.slice(0, max));
            rest = cont + rest.slice(max).replace(/^\s+/, "");
          }
          cur = rest;
        } else {
          cur = candidate;
        }
      } else {
        out.push(cur);
        cur = cont + w;
      }
    }
    if (cur !== "" && cur !== cont) out.push(cur);
  }

  return out.length ? out : [""];
}
