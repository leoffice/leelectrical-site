#!/usr/bin/env node
/**
 * regen-le-pro-agent-context.mjs
 *
 * A181 refinement (Levi 2026-07-30): generate a LE-Pro-ONLY, CURRENT-STATE-ONLY
 * context slice for the in-app AI agent. Replaces feeding raw HANDOFF.md.
 *
 * Sources (filtered):
 *   - ~/.hermes/shared/handoff/HANDOFF.md  (SESSION STATE / LE Pro live / Ready)
 *   - ~/.hermes/shared/handoff/CURRENT_STATUS.md  (LE Pro lines only)
 *   - ~/.hermes/shared/handoff/01_Operations/PRO_UX_REFERENCE.md  (do-not-regress)
 *   - pro-src public knowledge pack (assistant/*.md, LAYOUT.json)
 *   - pro-src public/version.json (stamp)
 *
 * Explicitly DROPS: other projects, roadmap/planned/future, retired/archived.
 * Run on every deploy (wired into npm run build via stamp path) and after handoff updates.
 *
 * Output: public/assistant/LE_PRO_CURRENT.md  (+ optional stamp in LAYOUT.json)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/assistant/LE_PRO_CURRENT.md");
const LAYOUT = path.join(ROOT, "public/assistant/LAYOUT.json");
const VERSION_JSON = path.join(ROOT, "public/version.json");

const HANDOFF_DIR =
  process.env.LE_HANDOFF_DIR ||
  path.join(os.homedir(), ".hermes/shared/handoff");

/** Project names that must NEVER appear as agent knowledge */
const OTHER_PROJECT_RE =
  /\b(NEC\s*School|NEC Study|PointQuest|ResellHub|ReSellHub|School Sign-?In|gematria|Abba|גימטריה|LE Flow|Voice Flow|marketplace|white-?label roadmap)\b/i;

/** Lines that are future / planned / not current */
const FUTURE_RE =
  /\b(roadmap|planned|not built yet|future|NEXT BUILD|Phase \d+ SPEC|hold for designer|when built|aspirational|TODO ship)\b/i;

/** Keep LE Pro / ops that the in-app agent needs */
const LE_PRO_KEEP_RE =
  /\b(LE Pro|le-pro|pro-src|leelectrical-cf|cf-native|Job Information|Sync chip|jobsdata|QBO|QuickBooks|chat bubble|assistant|invoice|estimate|payment|calendar|appointment|requisition|Baez|SOV|Sola|Cardknox|Agent Access|do not regress|do-not-regress|Letters|Form A|Winthrop|meter install)\b/i;

function readSafe(p, max = 400_000) {
  try {
    const s = fs.readFileSync(p, "utf8");
    return s.length > max ? s.slice(0, max) : s;
  } catch {
    return "";
  }
}

function linesOf(text) {
  return text.split(/\r?\n/);
}

/** True if the line is primarily about another project (even if LE Pro is mentioned for comparison). */
function isOtherProjectPrimary(t) {
  if (/^\|?\s*(Gematria|PointQuest|Abba|NEC|School Sign|ResellHub|LE Flow)\b/i.test(t)) return true;
  if (/^\|?\s*SW cache\b/i.test(t) && OTHER_PROJECT_RE.test(t)) return true;
  // Table rows whose subject cell is another product
  if (/^\|\s*(Gematria|PointQuest|Abba|NEC School|School Sign-?In)/i.test(t)) return true;
  // Bullets that open with other product names
  if (/^(-\s*)?\*{0,2}(NEC|PointQuest|Abba|School Sign|ResellHub|Gematria|LE Flow)\b/i.test(t))
    return true;
  // Pure other-project lines with no LE Pro subject
  if (OTHER_PROJECT_RE.test(t) && !/\bLE Pro\b/i.test(t)) return true;
  return false;
}

/** Strip other-project clauses from mixed LE Pro lines. */
function stripOtherProjects(t) {
  return t
    .replace(/\s*\/\s*Abba[^.|]*$/i, "")
    .replace(/;\s*NEC School[^.|]*$/i, "")
    .replace(/\s*\/\s*Abba live[^|]*/gi, "")
    .replace(/\s*\|\s*Gematria Android APK\s*\|[^|]*/gi, "")
    .replace(/\s*\|\s*PointQuest\s*\|[^|]*/gi, "")
    .replace(/\s*·\s*Abba live[^.|]*/gi, "")
    .replace(/\s*\/\s*gematria-sorter-v\d+[^.|]*/gi, "")
    .replace(/\s*\|\s*v2\.\d+\.\d+\s*/gi, " ");
}

/** Extract LE Pro–relevant bullets from a big markdown file */
function filterLeProLines(text, { allowFuture = false } = {}) {
  const out = [];
  for (const line of linesOf(text)) {
    const t = line.trim();
    if (!t) continue;
    if (isOtherProjectPrimary(t)) continue;
    // Footnote lines that mix LE Pro with other live apps
    if (/\*\([^)]*(NEC School|PointQuest|Abba|gematria)[^)]*\)\*/i.test(t)) continue;
    if (/^\*\([^)]*\)\*$/.test(t) && OTHER_PROJECT_RE.test(t)) continue;
    if (!allowFuture && FUTURE_RE.test(t) && !/HELD|held|NOT shipped|intentionally NOT/i.test(t)) {
      // keep HELD / intentionally not shipped — those are current-state facts
      if (!LE_PRO_KEEP_RE.test(t)) continue;
      // still drop pure roadmap "when built"
      if (/\bwhen built\b|aspirational|not built yet/i.test(t)) continue;
    }
    if (!LE_PRO_KEEP_RE.test(t)) continue;
    let cleaned = stripOtherProjects(t);
    // Drop status noise that is historical audit (PWA banner removal deep history, etc.)
    if (/Install LE Pro.*popup REMOVED|concurrent sessions risk|undeployed banner/i.test(cleaned))
      continue;
    if (/RESEND_API_KEY/i.test(cleaned) && /BLOCKED/i.test(cleaned)) {
      // keep as current ops fact — fine
    }
    if (cleaned.length > 400) cleaned = cleaned.slice(0, 397) + "…";
    out.push(cleaned);
  }
  // de-dupe, keep order
  const seen = new Set();
  return out.filter((l) => {
    const k = l.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractSection(text, headingRe, stopRe) {
  const lines = linesOf(text);
  const out = [];
  let on = false;
  for (const line of lines) {
    if (headingRe.test(line)) {
      on = true;
      out.push(line);
      continue;
    }
    if (on && stopRe && stopRe.test(line)) break;
    if (on) out.push(line);
  }
  return out.join("\n");
}

function extractDoNotRegress(proUx) {
  const chunk = extractSection(
    proUx,
    /^## Do not regress/i,
    /^## (?!Do-not-regress)/i
  );
  // Also grab dated do-not-regress blocks
  const more = extractSection(
    proUx,
    /^## Do-not-regress/i,
    /^## (?!Do-not)/i
  );
  const body = [chunk, more].filter(Boolean).join("\n\n");
  // Keep only short bullets / headers — drop long prose that names other apps
  return linesOf(body)
    .filter((l) => {
      if (OTHER_PROJECT_RE.test(l) && !/LE Pro/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function extractLiveLePro(handoff) {
  // Prefer "### LE Pro — live now" table + recent LIVE vNNN lines
  const liveRaw = extractSection(
    handoff,
    /^### LE Pro — live now/i,
    /^### /
  );
  // Rebuild live table: only LE Pro rows
  const liveNow = linesOf(liveRaw)
    .filter((l) => {
      if (!l.trim()) return true;
      if (isOtherProjectPrimary(l)) return false;
      if (/^\|\s*(Gematria|PointQuest|Abba|NEC)/i.test(l.trim())) return false;
      return true;
    })
    .map(stripOtherProjects)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const ready = extractSection(
    handoff,
    /^### Ready to deploy/i,
    /^### /
  );
  const liveLines = filterLeProLines(handoff).filter((l) =>
    /LE Pro LIVE|le-pro-v\d+|SW `le-pro/i.test(l)
  );
  // Keep ~12 recent LE Pro LIVE ship notes
  const recentLive = liveLines
    .filter((l) => /\*\*20\d{2}-\d{2}-\d{2}.*LE Pro LIVE/i.test(l) || /LE Pro LIVE \(v\d+\)/i.test(l))
    .slice(0, 12);
  // Only *active* queue items — not historical LIVE/strikethrough ship notes
  const readyLe = filterLeProLines(ready, { allowFuture: true }).filter((l) => {
    if (isOtherProjectPrimary(l)) return false;
    if (/~~/.test(l)) return false; // strikethrough = already shipped
    if (/LE Pro LIVE \(v\d+\)/i.test(l)) return false;
    if (!/LE Pro|Agent Access|bubble|in-app AI|HELD|NEXT BUILD|STAGED/i.test(l)) return false;
    // keep HELD / NEXT / STAGED / active ready bullets
    return /HELD|NEXT BUILD|STAGED|bubble →|Agent Access|in-app AI/i.test(l);
  }).slice(0, 10);
  return { liveNow, readyLe, recentLive };
}

function packSummaries() {
  const dir = path.join(ROOT, "public/assistant");
  const files = [
    "COMPANY.md",
    "SCOPE.md",
    "NAVIGATION.md",
    "JOBS.md",
    "CALENDAR.md",
    "BILLING.md",
    "COMMANDS.md",
  ];
  const bits = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const first = linesOf(readSafe(p, 20_000))
      .filter((l) => l.trim() && !l.startsWith("#"))
      .slice(0, 3)
      .join(" ");
    bits.push(`- **${f}**: ${first.slice(0, 220)}${first.length > 220 ? "…" : ""}`);
  }
  return bits.join("\n");
}

function main() {
  const handoff = readSafe(path.join(HANDOFF_DIR, "HANDOFF.md"));
  const status = readSafe(path.join(HANDOFF_DIR, "CURRENT_STATUS.md"), 80_000);
  const proUx = readSafe(
    path.join(HANDOFF_DIR, "01_Operations/PRO_UX_REFERENCE.md"),
    80_000
  );
  let version = {};
  try {
    version = JSON.parse(readSafe(VERSION_JSON) || "{}");
  } catch {
    version = {};
  }

  const { liveNow, readyLe, recentLive } = extractLiveLePro(handoff);
  // Prefer recent status (first ~80 lines of CURRENT_STATUS are the live snapshot)
  const statusHead = linesOf(status).slice(0, 120).join("\n");
  const statusLe = filterLeProLines(statusHead)
    .filter(
      (l) =>
        !/Install LE Pro.*popup|pro-src tests:|wrangler pages deploy|Isolation:|School Sign|Claude Supabase|Claude OTA/i.test(
          l
        )
    )
    .slice(0, 12);
  const dnr = extractDoNotRegress(proUx);
  const generatedAt = new Date().toISOString();
  const gitSha = version.gitShaShort || version.gitSha || "unknown";
  const builtAt = version.builtAt || "";

  const md = `# LE Pro — current-state agent context (scoped)

> **AUTO-GENERATED** — do not hand-edit. Regen: \`node scripts/regen-le-pro-agent-context.mjs\`
> **generatedAt:** ${generatedAt}
> **versionStamp:** git \`${gitSha}\`${builtAt ? ` · builtAt ${builtAt}` : ""}
> **scope:** LE Pro ONLY · CURRENT state ONLY
> **must not load:** raw HANDOFF.md · other projects · roadmap / planned / future

## Purpose

This is the **only** ops-context slice the in-app LE Pro agent may treat as "what is true about the product right now."
Product how-to still comes from the on-device pack (\`COMPANY\`, \`NAVIGATION\`, \`JOBS\`, …).
This file replaces feeding the full multi-project handoff into the bubble agent (A181 refinement).

## Hard rules for the agent

1. You only know **LE Pro** (this app). You do not know or discuss other company projects.
2. You only know **current** state — what is live or held *now*. Never invent roadmap items.
3. If this file and the knowledge pack disagree on a product rule, prefer the knowledge pack for UX rules and this file for live/version facts.
4. **Send on behalf:** draft in chat **or** create a notification for the owner to approve — never auto-complete a customer send.
5. **To-dos / read / show:** direct (no confirm) — primary job.

## Live product (from handoff filter)

${liveNow || "_No LE Pro live table found — check handoff path._"}

### Recent LE Pro ships (filtered)

${recentLive.length ? recentLive.map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n") : "- (none extracted)"}

### Status notes (LE Pro only)

${statusLe.length ? statusLe.map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n") : "- (none)"}

### Ready / held (LE Pro only — current queue, not a roadmap dump)

${readyLe.length ? readyLe.map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n") : "- (none)"}

## Do not regress (current product law)

${dnr || "- Job Information always visible on job detail; only below sections collapse.\n- Empty QBO refresh must never wipe jobs list.\n- Sync chip: no twitching skip behavior.\n- Chat composer clears on Send; focus stays."}

## On-device knowledge pack (always load with this file)

Path: \`/app/pro/assistant/\`

${packSummaries()}

## Actions ceiling (A181 refinements)

| Action | Mode |
|--------|------|
| Create to-do | **DIRECT** (no confirm) — primary job |
| Read / show / open job screens / lookups | **DIRECT** |
| Draft notes, invoice text, email body | **DIRECT** (stays in chat as draft) |
| Send message / email / document to customer | **PROPOSE ONLY** — show draft in chat **or** owner notification to approve. **Never auto-send.** Full auto-send = NOT YET. |
| Record payment / money moves | Confirm gate (owner) — never silent |
| Secrets / keys / passwords | **Never** expose |

## UI while processing

Show the **three-dots working indicator** while the agent is thinking/working. Do not claim done until the real reply is ready.

## Regen contract

- **When:** every LE Pro deploy (build step) and after significant handoff LE Pro updates.
- **How:** filter main handoff → LE Pro current only → drop other projects + future/roadmap → version-stamp.
- **Consumer:** bubble / chat responder injects this file + pack; **never** injects raw \`HANDOFF.md\`.

---
*Generator: scripts/regen-le-pro-agent-context.mjs · A181 scoped feed*
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");

  // Stamp LAYOUT.json so the agent can detect mid-session refresh
  try {
    const layout = JSON.parse(readSafe(LAYOUT) || "{}");
    layout.currentContext = {
      file: "LE_PRO_CURRENT.md",
      generatedAt,
      versionStamp: gitSha,
      scope: "le-pro-current-only",
    };
    layout.status = {
      ...(layout.status || {}),
      knowledgePack: "phase0",
      scopedCurrentContext: "generated",
      chatsTab: layout.status?.chatsTab || "planned",
    };
    fs.writeFileSync(LAYOUT, JSON.stringify(layout, null, 2) + "\n", "utf8");
  } catch (e) {
    console.warn("LAYOUT.json stamp skipped:", e.message);
  }

  console.log(
    `LE_PRO_CURRENT.md written (${md.length} chars) · stamp ${gitSha} · ${generatedAt}`
  );
}

main();
