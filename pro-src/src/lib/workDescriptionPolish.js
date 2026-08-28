// Polish rough notes into professional electrical work descriptions (estimates, invoices, job scope).

import { preferLearnedPolish, loadPolishLearning } from "./workDescriptionPolishLearning.js";

/** Menu styles only — keep polishWorkDescription switch cases for older keys. */
export const WORK_DESCRIPTION_STYLES = [
  { key: "professional", label: "Professional", emoji: "💼" },
  { key: "brief", label: "Brief", emoji: "✂️" },
  { key: "detailed", label: "Detailed", emoji: "📐" },
  { key: "invoice", label: "Invoice-ready", emoji: "🧾" },
];

/** Approved trailer SOW rough notes — golden fixture for Professional voice tests. */
export const TRAILER_SOW_ROUGH =
  "temp sleeping trailers — 400A 3ph temp service to lot; overhead feeders from school building across street; set/connect outdoor temp equipment customer-supplied from last year; dedicated feeders/circuits to each trailer; circuits for outdoor lighting and exit signs; outdoor receptacles as needed. Labor only — customer supplies materials.";

/**
 * Levi fail case (2026-08-28) — preamble must not become a bullet; no invented price/junk.
 * Rough notes describing dedicated lines on one floor.
 */
export const DEDICATED_LINES_ROUGH =
  "The following is the description of the work that will need to be done. We are going to remove the old existing equipment. We are going to install 5 dedicated lines in the same floor, roughly 150 ft of cables....";

function clean(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** Drop meta fluff like "The following is the description of the work…" — never a scope bullet. */
export function stripMetaFluff(raw) {
  let t = String(raw || "").trim();
  if (!t) return "";
  // Repeat: leading sentence that only announces the description / scope.
  // Keep newlines — questionnaire extras are appended as their own lines.
  for (let i = 0; i < 3; i++) {
    const next = t
      .replace(
        /^(?:the\s+following\s+is\s+(?:the\s+)?(?:description|scope)(?:\s+of(?:\s+the)?\s+work)?(?:\s+that\s+will\s+need\s+to\s+be\s+done)?(?:\s+is\s+as\s+follows)?\s*[.:]?\s*)/i,
        ""
      )
      .replace(
        /^(?:(?:here|below)\s+is\s+(?:the\s+)?(?:description|scope)(?:\s+of(?:\s+the)?\s+work)?\s*[.:]?\s*)/i,
        ""
      )
      .replace(/^(?:description\s+of\s+(?:the\s+)?work\s*[.:]\s*)/i, "")
      .replace(/^(?:scope\s+of\s+work\s*[.:]\s*)/i, "")
      .replace(/^(?:work\s+description\s*[.:]\s*)/i, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/\.{3,}/g, ".").trim();
}

/** Truncated / empty / meta chunks that must never become bullets. */
function isJunkScopeChunk(chunk) {
  const c = clean(chunk);
  if (!c || c.length < 6) return true;
  if (/^i\s+don'?t\b/i.test(c)) return true;
  if (/^(um+|uh+|etc|tbd|n\/?a|none|idk)\.?$/i.test(c)) return true;
  if (/^the\s+following\s+is\b/i.test(c)) return true;
  if (/^(?:description|scope)\s+of\s+(?:the\s+)?work\b/i.test(c)) return true;
  if (/^work\s+that\s+will\s+need\s+to\s+be\s+done\.?$/i.test(c)) return true;
  // Invented commercial fluff — only keep when Levi actually wrote labor/materials (handled separately).
  if (/^price\s+includes\s+labor\s+and\s+materials\.?$/i.test(c)) return true;
  return false;
}

/** "We are going to remove…" → "remove…" for imperative bullets. */
function toImperativeLead(chunk) {
  let b = clean(chunk);
  b = b
    .replace(/^we\s+are\s+going\s+to\s+/i, "")
    .replace(/^we'?re\s+going\s+to\s+/i, "")
    .replace(/^we\s+will\s+(?:be\s+)?/i, "")
    .replace(/^going\s+to\s+/i, "")
    .replace(/^will\s+/i, "")
    .replace(/^i\s+will\s+/i, "")
    .replace(/^they\s+will\s+/i, "");
  return b;
}

function punctuate(part) {
  const p = clean(part);
  if (!p) return "";
  // Titles like "Electrical work — panel:" already end with : — do not add a period.
  if (/[.!?:]$/.test(p)) return p;
  return p + ".";
}

/** Join scope parts on separate lines — never one long dotted sentence. */
function lines(parts) {
  return parts
    .map((p) => {
      const chunk = String(p || "").trim();
      if (!chunk) return "";
      if (chunk.includes("\n")) return chunk;
      // Bullets keep their own punctuation style (often no trailing period).
      if (chunk.startsWith("• ")) return chunk;
      return punctuate(chunk);
    })
    .filter(Boolean)
    .join("\n");
}

function bulletize(raw) {
  const chunks = String(raw || "")
    .split(/[\n;•]+|(?:\s+and\s+)/i)
    .map((c) => clean(c))
    .filter((c) => c.length > 2);
  if (chunks.length < 2) return null;
  return chunks.map((c) => "• " + punctuate(c)).join("\n");
}

/** Core work notes — bullets when splittable, otherwise one line. */
function workBody(raw) {
  const bullets = bulletize(raw);
  if (bullets) return bullets;
  const t = clean(raw);
  if (!t) return "";
  return punctuate(t);
}

/** True when a service/billing address is in New Jersey. */
export function addressInNewJersey(addr) {
  const s = String(addr || "").trim();
  if (!s) return false;
  return (
    /\bnew\s+jersey\b/i.test(s) ||
    /,\s*NJ\b(?:\s+\d{5}(?:-\d{4})?)?/i.test(s) ||
    /\bNJ\s+\d{5}(?:-\d{4})?\b/i.test(s)
  );
}

function addressInNewYork(addr) {
  const s = String(addr || "").trim();
  if (!s) return false;
  return (
    /\bnew\s+york\b/i.test(s) ||
    /,\s*NY\b(?:\s+\d{5}(?:-\d{4})?)?/i.test(s) ||
    /\bNY\s+\d{5}(?:-\d{4})?\b/i.test(s) ||
    /\b(brooklyn|queens|manhattan|bronx|staten\s+island)\b/i.test(s)
  );
}

function codeComplianceLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Scope includes labor, materials coordination, and code-compliant installation per NJ requirements";
  }
  if (addressInNewYork(addr)) {
    return "Scope includes labor, materials coordination, and code-compliant installation per NYC requirements";
  }
  return "Scope includes labor, materials coordination, and code-compliant installation per applicable local code";
}

function permitLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Work to be performed under applicable NJ / local permits as required";
  }
  if (addressInNewYork(addr)) {
    return "Work to be performed under applicable NYC DOB / local permits as required";
  }
  return "Work to be performed under applicable local permits as required";
}

/** NEC + local code affirmation — customer-facing, no company name. */
function necComplianceLine(addr) {
  if (addressInNewJersey(addr)) {
    return "Work performed in accordance with NEC and applicable NJ / local code requirements";
  }
  if (addressInNewYork(addr)) {
    return "Work performed in accordance with NEC and applicable NYC / local code requirements";
  }
  return "Work performed in accordance with NEC and applicable local code requirements";
}

/** Labor-only commercial note matching Levi's approved invoice voice. */
export const LABOR_ONLY_NOTE =
  "Pricing is labor only. Materials are supplied by the customer (or purchased separately) and are not included in this price.";

/** Detect labor-only / materials-by-customer notes in the draft. Never invent L+M. */
export function extractCommercialNotes(raw) {
  const t = String(raw || "");
  const laborAndMaterials =
    /(?:price|pricing|quote)\s+includes?\s+labor\s+and\s+materials|labor\s+and\s+materials\s+included|(?:includes?|including)\s+labor\s*(?:&|and)\s*materials/i.test(
      t
    );
  const laborOnly =
    !laborAndMaterials &&
    /labor\s+only|prices?\s+include\s+labor(?!\s+and\s+materials)|pricing\s+is\s+labor|materials?\s+will\s+be\s+an\s+additional/i.test(
      t
    );
  const materialsByCustomer =
    /materials?\s+.*(?:customer|owner|supplied|purchased\s+separately)|customer[- ]supplied|customer\s+furnish|provided\s+from\s+(?:previous|prior|last)/i.test(
      t
    );
  return { laborOnly, materialsByCustomer, laborAndMaterials };
}

function isCommercialBullet(chunk) {
  return /labor\s+only|all\s+prices?\s+include\s+labor|materials?\s+will\s+be|materials?\s+(?:are\s+)?(?:an\s+additional|supplied|purchased|by\s+the\s+customer)|pricing\s+is\s+labor|not\s+included\s+in\s+this\s+price|purchased\s+separately|price\s+includes\s+labor\s+and\s+materials/i.test(
    chunk
  );
}

/**
 * Split rough notes into invoice-style scope items (Levi Professional voice).
 * Keeps each install/line as its own item — never one long dotted sentence.
 */
function invoiceBullets(raw) {
  const text = stripMetaFluff(raw);
  if (!text) return [];
  const parts = text
    .split(/\n+|(?<=[.])\s+(?=[A-Z•\-])|(?:\s*;\s*)|(?:^|\n)\s*[-•]\s+/m)
    // Strip list markers only — keep leading quantities like "8 trailers".
    .map((c) => clean(c.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "")))
    .map(toImperativeLead)
    .filter((c) => c.length > 2)
    .filter((c) => !isJunkScopeChunk(c))
    .filter((c) => !isCommercialBullet(c));
  if (parts.length >= 2) return parts;
  const andSplit = text
    .split(/\s+and\s+/i)
    .map((c) => clean(c))
    .map(toImperativeLead)
    .filter((c) => c.length > 2)
    .filter((c) => !isJunkScopeChunk(c))
    .filter((c) => !isCommercialBullet(c));
  if (andSplit.length >= 2) return andSplit;
  const single = toImperativeLead(clean(text));
  if (!single || isCommercialBullet(single) || isJunkScopeChunk(single)) return [];
  return [single];
}

/** Imperative / clean bullet wording for Professional + Invoice-ready. */
function formatScopeBullet(chunk) {
  let b = toImperativeLead(clean(chunk));
  if (!b || isJunkScopeChunk(b)) return "";
  // Drop lead-in job titles that duplicate the Professional header.
  b = b
    .replace(/^(?:temp(?:orary)?\s+)?sleeping\s+trailers?\s*[—–\-:,]+\s*/i, "")
    .replace(/^temporary\s+sleeping\s+trailers?\s*[—–\-:,]+\s*/i, "")
    .replace(/^electrical\s+work\s*[—–\-:,]+\s*/i, "");
  b = b
    .replace(/^installation\s+of\s+/i, "Install ")
    .replace(/^install\s+of\s+/i, "Install ")
    .replace(/^temp\b/i, "temporary")
    .replace(/\btemp\s+service\b/gi, "temporary electric service")
    .replace(/\btemp\s+equipment\b/gi, "temporary equipment")
    .replace(/\b3ph\b/gi, "three-phase")
    .replace(/\b400\s*a\b/gi, "400 A")
    .replace(/\bset\/connect\b/gi, "Set and connect")
    .replace(/\bfeeders\/circuits\b/gi, "feeder / branch circuits")
    .replace(/\bas needed\b/gi, "as required for the layout")
    .replace(/\bfrom\s+previous\s+year'?s?\s+supplies\b/gi, "from prior-year stock")
    .replace(/\bprevious\s+year'?s?\s+supplies\b/gi, "prior-year stock")
    .replace(/\blast year\b/gi, "prior-year stock")
    .replace(/\bprevious year\b/gi, "prior-year stock")
    // Levi dedicated-lines voice.
    .replace(/\bold\s+existing\b/gi, "existing")
    .replace(/\bremove\s+the\s+existing\b/gi, "Remove existing")
    .replace(/\bin\s+the\s+same\s+floor\b/gi, "on the same floor")
    .replace(/\bdedicated\s+lines\b/gi, "dedicated circuits / lines")
    .replace(/\broughly\s+(\d+)\s*ft\s+of\s+cables?\b/gi, "(~$1 ft of cable)")
    .replace(/\bapprox(?:imately)?\s+(\d+)\s*ft\s+of\s+cables?\b/gi, "(~$1 ft of cable)")
    .replace(/\b(\d+)\s*ft\s+of\s+cables\b/gi, "$1 ft of cable")
    .replace(/,\s*\(/g, " (");
  // Prefer imperative lead-ins when the chunk is a bare noun phrase about install work.
  // Leave quantity / duration / AHJ facts alone — they are clarifying answers.
  const isFactLine =
    /^\d+\s+(trailer|unit|amp)/i.test(b) ||
    /^(overhead run|utility\s*\/\s*ahj|reuse from|exit signs|outdoor receptacles|grounding|site logistics|temporary service duration|job address)\b/i.test(
      b
    );
  if (
    !isFactLine &&
    !/^(install|run|set|provide|connect|replace|upgrade|remove|relocate|mount|wire|pull|troubleshoot)\b/i.test(b)
  ) {
    if (/^dedicated\b/i.test(b)) b = "Install " + b;
    else if (/^(circuits?|feeders?|receptacles?|outlets?|outdoor\s+)/i.test(b)) b = "Install " + b;
    else if (/^overhead\b/i.test(b)) b = "Run " + b;
    else if (
      /^temporary\b.*service\b/i.test(b) ||
      /^\d+\s*a\b/i.test(b) ||
      /three-phase.*service/i.test(b) ||
      /temporary\s+electric\s+service/i.test(b)
    ) {
      b = "Install " + b;
    }
  }
  // Capitalize first letter; no forced trailing period on bullets (approved voice).
  if (!b || isJunkScopeChunk(b)) return "";
  b = b.charAt(0).toUpperCase() + b.slice(1);
  b = b.replace(/\.+$/, "");
  return "• " + b;
}

/** Turn questionnaire answers into short scope facts (not Q:A paste). */
function answerAsScopeFact(id, answer) {
  const a = clean(answer);
  if (!a) return "";
  switch (id) {
    case "count_load":
      return a.match(/trailer|unit|amp|panel|\d/i) ? a : `${a} trailers / load`;
    case "overhead_path":
      return /^overhead\b/i.test(a) ? a : `Overhead run — ${a}`;
    case "utility_ahj":
      return /^ahj|utility|con\s*ed|dob/i.test(a) ? a : `Utility / AHJ — ${a}`;
    case "reuse_gear":
      return /^reuse|customer|panel|disconnect/i.test(a) ? a : `Reuse from prior year — ${a}`;
    case "lighting_supply":
      return /exit|light|fixture|battery|line-voltage/i.test(a) ? a : `Exit signs / outdoor lights — ${a}`;
    case "receptacles":
      return /receptacle|outlet|gfci|weatherproof/i.test(a) ? a : `Outdoor receptacles — ${a}`;
    case "grounding":
      return /ground|bond|electrode/i.test(a) ? a : `Grounding / bonding — ${a}`;
    case "night_traffic":
      return /night|street|traffic|flagger|none/i.test(a) ? a : `Site logistics — ${a}`;
    case "duration":
      return /^(schedule|duration)\b/i.test(a) ? a : `Temporary service duration — ${a}`;
    case "labor_materials":
      return a;
    case "address":
      return `Job address — ${a}`;
    case "missing":
      return a;
    default:
      return a;
  }
}

/** Short title guess for Professional polish when no job title is set. */
function guessScopeTitle(raw) {
  const t = String(raw || "");
  if (/temporary\s+sleeping\s+trailer|sleeping\s+trailer|temp\s+sleeping\s+trailer/i.test(t)) {
    return "temporary sleeping trailers";
  }
  // Temp service + trailers in scope → same Levi title even without the words "sleeping trailers".
  if (/trailer/i.test(t) && /temporary\s+(?:electric(?:al)?\s+)?service|temp\s+service|400\s*a/i.test(t)) {
    return "temporary sleeping trailers";
  }
  if (/temporary\s+(?:electric\s+)?service|temp\s+service/i.test(t)) return "temporary electrical service";
  if (/panel\s+upgrade/i.test(t)) return "panel upgrade";
  if (/rewire/i.test(t)) return "rewire";
  return "";
}

/**
 * Levi Professional / Invoice lead: "Electrical work — {title}:"
 * Em-dash voice from the approved trailer SOW rewrite.
 */
export function professionalLead(jobTitle, addr, raw) {
  const job = clean(jobTitle || "");
  const guessed = guessScopeTitle(raw);
  const title = job || guessed;
  if (title) return `Electrical work — ${title}:`;
  if (addr) return `Electrical work — ${clean(addr)}:`;
  return "Electrical work:";
}

/**
 * Clarifying questions for Polish — generated from the draft so Levi can tighten
 * the scope before (or after) rewriting. Each item: { id, prompt, placeholder }.
 * Empty array = nothing useful to ask.
 */
export function polishClarifyingQuestions(raw, ctx = {}) {
  const text = String(raw || "");
  const qs = [];
  const has = (re) => re.test(text);
  const push = (id, prompt, placeholder = "") => {
    if (qs.some((q) => q.id === id)) return;
    qs.push({ id, prompt, placeholder });
  };

  const trailerish = has(/trailer|temp(?:orary)?\s+sleeping|sleeping\s+trailer/i);
  const tempService = has(/temporary\s+service|temp\s+service|temporary\s+electric/i);
  const overhead = has(/overhead|across\s+the\s+street|from\s+the\s+building/i);

  if (trailerish || (has(/\b\d+\s*a\b|\bamp/i) && !has(/\b\d+\s*(trailer|unit|room|apt|apartment|store)/i))) {
    push(
      "count_load",
      "How many trailers, and approx. amp load per trailer (or panel size in each)?",
      "e.g. 8 trailers · 60 A each"
    );
  }
  if (overhead) {
    push(
      "overhead_path",
      "Exact path for the overhead run (span length, attachment points, clearance over the street / driveway)?",
      "e.g. ~120 ft school → lot, 18 ft clearance"
    );
  }
  if (tempService || trailerish) {
    push(
      "utility_ahj",
      "Utility / AHJ: who is the AHJ, and is a temporary service application / Con Ed (or local utility) coordination already started?",
      "e.g. NYC DOB · Con Ed temp app started"
    );
  }
  if (has(/outdoor\s+equipment|previous\s+year|prior[- ]year|last\s+year|customer[- ]supplied/i) || trailerish) {
    push(
      "reuse_gear",
      "Which outdoor equipment from last year is being reused (panel, disconnect, meter stack, poles, luminaires)?",
      "e.g. reuse panel + disconnect; new receptacles"
    );
  }
  if (has(/exit\s+sign|outdoor\s+lighting|lighting/i) || trailerish) {
    push(
      "lighting_supply",
      "Are exit signs / outdoor lights line-voltage or battery-unit, and who supplies fixtures?",
      "e.g. line-voltage · customer fixtures"
    );
  }
  if (has(/outlet|receptacle/i) || trailerish) {
    push(
      "receptacles",
      "Outdoor receptacles: GFCI-protected? weatherproof while-in-use covers? qty and locations?",
      "e.g. GFCI + WIUC · 2 per trailer"
    );
  }
  if (tempService || trailerish || has(/ground|bond/i)) {
    push(
      "grounding",
      "Is grounding / bonding / temporary grounding electrode part of this labor scope?",
      "e.g. yes — electrode + bonding included"
    );
  }
  if (overhead || has(/night\s+work|street\s+opening|traffic/i)) {
    push(
      "night_traffic",
      "Any night work, street opening, or traffic protection needed for the overhead crossing?",
      "e.g. night pull · flaggers by GC"
    );
  }
  if (tempService || trailerish) {
    push(
      "duration",
      "Desired schedule / duration the temporary service must remain in place?",
      "e.g. Aug 15 – Oct 1"
    );
  }
  // Only ask labor/materials when the draft already looks like a real scope.
  if (
    (trailerish || tempService || has(/install|labor|materials|circuit|panel|service/i)) &&
    clean(text).length > 24 &&
    (!extractCommercialNotes(text).laborOnly || trailerish || tempService)
  ) {
    push(
      "labor_materials",
      "Confirm: labor-only quote; customer furnishes all materials — any exclusions (lifts, excavation, utility fees)?",
      "e.g. labor only · exclude lift + utility fees"
    );
  }
  if (
    !ctx.address &&
    !has(/\d{1,5}\s+\w+\s+(st|ave|rd|blvd|street|avenue)/i) &&
    qs.length >= 1 &&
    qs.length < 3 &&
    clean(text).length > 40
  ) {
    push("address", "What's the job address / lot location for the estimate header?", "Street, city, ZIP");
  }

  // Cap to a usable sheet (≤10). Prefer trailer-style set when it fits.
  const capped = qs.slice(0, 10);
  if (capped.length === 0 && clean(text).length > 40) {
    capped.push({
      id: "missing",
      prompt: "Anything missing from the scope that should be on the estimate (permits, trench, poles, grounding)?",
      placeholder: "Optional notes",
    });
  }
  return capped;
}

/** @deprecated string-only helper — prefer polishClarifyingQuestions. */
export function polishClarifyingQuestionPrompts(raw, ctx = {}) {
  return polishClarifyingQuestions(raw, ctx).map((q) => q.prompt);
}

/**
 * Merge Levi's questionnaire answers into the rough draft, then re-polish.
 * Skipped / blank answers are ignored. Answers become short scope facts, not Q:A paste.
 */
export function polishWorkDescriptionWithAnswers(raw, styleKey = "professional", ctx = {}, answers = {}) {
  const extras = [];
  const list = polishClarifyingQuestions(raw, ctx);
  const knownIds = new Set(list.map((q) => q.id));
  for (const q of list) {
    const ans = clean(answers?.[q.id] ?? answers?.[q.prompt] ?? "");
    if (!ans) continue;
    const fact = answerAsScopeFact(q.id, ans);
    if (fact) extras.push(fact);
  }
  // Also accept free-form answer keys not in the generated list.
  for (const [id, val] of Object.entries(answers || {})) {
    if (knownIds.has(id)) continue;
    const ans = clean(val);
    if (!ans) continue;
    const fact = answerAsScopeFact(id, ans);
    if (fact) extras.push(fact);
  }
  const merged = extras.length ? `${String(raw || "").trim()}\n${extras.join("\n")}` : raw;
  return polishWorkDescription(merged, styleKey, {
    ...ctx,
    answers,
  });
}

function commercialLines(notes) {
  // Only when Levi wrote labor-only / customer materials — never invent "labor and materials".
  if (notes.laborAndMaterials) return [];
  if (notes.laborOnly || notes.materialsByCustomer) return [LABOR_ONLY_NOTE];
  return [];
}

function professionalBody(raw, ctx) {
  const notes = extractCommercialNotes(raw);
  const bullets = invoiceBullets(raw);
  const title = professionalLead(ctx.jobTitle || ctx.serviceType || "", ctx.address || "", raw);
  const scopeLines =
    bullets.length >= 1
      ? bullets.map(formatScopeBullet).filter(Boolean)
      : [workBody(stripMetaFluff(raw))].filter(Boolean);
  return lines([title, ...scopeLines, ...commercialLines(notes), necComplianceLine(ctx.address || "")]);
}

function invoiceReadyBody(raw, ctx) {
  // Same Levi voice as Professional, framed as completed / billable scope.
  const notes = extractCommercialNotes(raw);
  const bullets = invoiceBullets(raw);
  const title = professionalLead(ctx.jobTitle || ctx.serviceType || "", ctx.address || "", raw);
  const scopeLines =
    bullets.length >= 1
      ? bullets.map(formatScopeBullet).filter(Boolean)
      : [workBody(stripMetaFluff(raw))].filter(Boolean);
  return lines([
    title,
    ...scopeLines,
    ...commercialLines(notes),
    necComplianceLine(ctx.address || ""),
  ]);
}

/** Rewrite draft text for a work-description field. */
export function polishWorkDescription(raw, styleKey = "professional", ctx = {}) {
  const text = clean(raw);
  if (!text) return "";

  // Prefer a prior Levi edit when rough notes match a saved train pair.
  if (ctx.skipLearning !== true) {
    const entries = Array.isArray(ctx.learningEntries) ? ctx.learningEntries : loadPolishLearning();
    const learned = preferLearnedPolish(raw, styleKey, entries);
    if (learned) return learned;
  }

  const job = ctx.jobTitle || ctx.serviceType || "";
  const addr = ctx.address || "";
  const lead = job ? `Electrical work at ${job}` : addr ? `Electrical services at ${addr}` : "Electrical services";
  const body = workBody(stripMetaFluff(text));

  switch (styleKey) {
    case "commercial":
      return lines([
        lead,
        body,
        codeComplianceLine(addr),
        "Pricing subject to site conditions and permit requirements",
      ]);
    case "breakdown":
      return lines(["Scope of work:", body.startsWith("•") ? body : "• " + body]);
    case "brief": {
      const summary =
        text.length > 120 ? text.slice(0, 117).replace(/\s+\S*$/, "") + "…" : body;
      return lines(["Summary:", summary]);
    }
    case "detailed":
      return lines([
        lead,
        body,
        "Work performed in accordance with applicable NEC and local code",
        "Includes standard cleanup and owner walkthrough upon completion",
      ]);
    case "permit":
      return lines([
        body,
        permitLine(addr),
        "Includes filing coordination and inspection scheduling where applicable",
      ]);
    case "customer":
      return lines([
        `Hi — here's what we're doing:`,
        body,
        "We'll keep you posted and leave the area clean when we're done",
      ]);
    case "insurance":
      return lines([
        "Inspection / report scope:",
        body,
        "Findings documented per insurer requirements; corrective recommendations provided as applicable",
      ]);
    case "estimate":
      return lines([
        "Proposed scope of work:",
        body,
        "Estimate valid 30 days; final price may adjust after on-site verification",
      ]);
    case "invoice":
      return invoiceReadyBody(raw, ctx);
    case "professional":
    default:
      return professionalBody(raw, ctx);
  }
}
