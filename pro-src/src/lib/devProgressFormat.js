// Dev Progress dashboard formatting — mirrors LE_Pro_Dev_Progress_Infographic.html helpers.

export function commas(n) {
  return Number(n).toLocaleString("en-US");
}

export function kfmt(n) {
  n = Number(n);
  return n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n);
}

export function money(n) {
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function md(dateStr) {
  const p = dateStr.slice(5).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[parseInt(p[0], 10) - 1] + " " + parseInt(p[1], 10);
}

export function shortTitle(s) {
  s = s.replace(/^Task #\d+:\s*/i, "").replace(/^#\d+:?\s*/, "");
  if (/^Deploy\b/i.test(s)) return "Live deploy";
  s = s.split(" — ")[0].split(" (")[0].split(":")[0].trim();
  if (s.length > 36) s = s.slice(0, 34).trim() + "…";
  return s;
}

export const DEV_PROGRESS_CONFIG = {
  humanDevNetLinesPerHour: 40,
  copilotTeamNetLinesPerHour: 180,
  maxChips: 12,
};