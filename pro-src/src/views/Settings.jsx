// Settings — collapsible menu: connections, company profile, features, agent access.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { MODULES, MODULE_LABELS } from "../lib/tenantConfig.js";
import {
  DEFAULT_FEATURES,
  DEFAULT_PROFILE,
  FEATURE_GROUPS,
  anyQuickbooksDocFeature,
  featureLabel,
  mergeFeatures,
  mergeProfile,
  quickbooksDocFeature,
} from "../lib/tenantProfile.js";
import SignatureRegisterSheet from "../components/SignatureRegisterSheet.jsx";
import { probeConnections } from "../lib/connectionHealth.js";
import { logOff } from "../lib/lock.js";
import {
  ASSISTANT_VOICE_PRESETS,
  clearCompanyLogo,
  getCompanyLogoSrc,
  readLogoFileAsDataUrl,
  setAssistantSpeakEnabled,
  setAssistantVoiceId,
  setCompanyLogoDataUrl,
  setQuickbooksDocFeatureEnabled,
  setQuickbooksDocsFeatureEnabled,
  setQuickbooksFeatureEnabled,
  setSpeechToTextEnabled,
  useAppSettings,
} from "../lib/appSettings.js";
import {
  applyCompanyLogoToActiveConfig,
  applyCompanyProfileToActiveConfig,
  defaultZelleInstructions,
} from "../lib/tenantBranding.js";
import {
  AGENT_ACCESS_MAX_TTL_MS,
  extendAgentAccess,
  fetchAgentAccessStatus,
  formatRemaining,
  mintAgentAccess,
  mintAgentAccess24h,
  revokeAgentAccess,
} from "../lib/agentAccessClient.js";
import {
  activateAssistantLicense,
  clearStoredAssistantToken,
  fetchAssistantLicenseStatus,
  getStoredAssistantToken,
  mintAssistantLicense,
  revokeAssistantLicense,
} from "../lib/assistantLicenseClient.js";
import Toggle from "../components/Toggle.jsx";

/** Feature keys for the per-document send-through-QuickBooks switches. */
const QB_DOC_KEYS = ["quickbooksInvoices", "quickbooksEstimates"];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-brand focus:bg-white";

function Fld({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2 py-1 rounded-full ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

/** Top-level Settings menu row — closed by default; expands in place. */
function MenuSection({ id, title, summary, open, onToggle, children, badge }) {
  return (
    <section
      className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-3 overflow-hidden"
      data-testid={`settings-section-${id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 active:bg-slate-50 transition-colors"
        data-testid={`settings-toggle-${id}`}
      >
        <span
          className={`text-slate-400 text-[10px] w-3 shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold text-slate-800 tracking-tight">{title}</div>
          {!open && summary ? (
            <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{summary}</div>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </button>
      {open ? (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100" data-testid={`settings-body-${id}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

const FEATURE_ROW =
  "flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5";

/** Longer explanations for the switches that need one. */
const FEATURE_HINTS = {
  speechToText: "On = mic on the field you're typing in. Off = no mic anywhere.",
};

/** One feature switch — labelled row plus a Toggle. */
function FeatureRow({ featureKey, features, setF, title, hint, disabled = false, testId }) {
  const label = title || featureLabel(featureKey);
  const note = hint === undefined ? FEATURE_HINTS[featureKey] : hint;
  return (
    <div className={FEATURE_ROW} data-testid={testId || `settings-feature-${featureKey}`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {note ? <div className="text-xs text-slate-500 font-semibold mt-0.5">{note}</div> : null}
      </div>
      <Toggle
        on={!disabled && features[featureKey] !== false}
        onChange={(on) => setF(featureKey, on)}
        label={label}
      />
    </div>
  );
}

/** Nested feature category under Features. */
function FeatureSubmenu({ id, title, hint, open, onToggle, children }) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/60 mb-2 overflow-hidden"
      data-testid={`feature-group-${id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-100/80"
        data-testid={`feature-toggle-${id}`}
      >
        <span
          className={`text-slate-400 text-[9px] w-2.5 shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-slate-800">{title}</div>
          {!open && hint ? (
            <div className="text-[11px] text-slate-500 font-semibold mt-0.5 truncate">{hint}</div>
          ) : null}
        </div>
      </button>
      {open ? <div className="px-3 pb-3 space-y-2 border-t border-slate-200/80 pt-2">{children}</div> : null}
    </div>
  );
}

export default function Settings() {
  const appSettings = useAppSettings();
  const { showToast, pullCalendarNow, getSettings, saveSettings } = useStore();
  const config = useTenantConfig();
  const internal = config.internal === true;
  const [profile, setProfile] = useState(() => mergeProfile(DEFAULT_PROFILE));
  const [features, setFeatures] = useState(() => mergeFeatures(DEFAULT_FEATURES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [sigSheetOpen, setSigSheetOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [agentGrant, setAgentGrant] = useState(null);
  const [agentAudit, setAgentAudit] = useState([]);
  const [agentCodeShown, setAgentCodeShown] = useState("");
  const [agentTtlMin, setAgentTtlMin] = useState(30);
  /** Custom mint scope (More options). Default full for power users. */
  const [agentScope, setAgentScope] = useState("full");
  /**
   * One-tap 24h scope — default narrowest ("test"). Opt-in to "full"
   * with live-data warning (flagged to Levi for final default).
   */
  const [agent24Scope, setAgent24Scope] = useState("test");
  const [agentMoreOpen, setAgentMoreOpen] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentNow, setAgentNow] = useState(Date.now());
  const [asstLicenses, setAsstLicenses] = useState([]);
  const [asstAudit, setAsstAudit] = useState([]);
  const [asstBusy, setAsstBusy] = useState(false);
  const [asstTokenShown, setAsstTokenShown] = useState("");
  const [asstPaidLabel, setAsstPaidLabel] = useState("");
  const [asstActivateInput, setAsstActivateInput] = useState("");
  const [asstStored, setAsstStored] = useState(() => getStoredAssistantToken());

  // All top-level menus start collapsed.
  const [openMenu, setOpenMenu] = useState({
    connections: false,
    company: false,
    features: false,
    special: false,
    assistant: false,
    agent: false,
    account: false,
  });
  // Feature subcategories start collapsed.
  const [openFeature, setOpenFeature] = useState(() =>
    Object.fromEntries(FEATURE_GROUPS.map((g) => [g.id, false]))
  );

  const toggleMenu = (key) => setOpenMenu((m) => ({ ...m, [key]: !m[key] }));
  const toggleFeature = (key) => setOpenFeature((m) => ({ ...m, [key]: !m[key] }));

  const qbSyncOn = features.quickbooks !== false;
  const qbInvoicesOn = qbSyncOn && quickbooksDocFeature(features, "invoice");
  const qbEstimatesOn = qbSyncOn && quickbooksDocFeature(features, "estimate");

  // Groups after plan/role filtering. A group left with one switch renders as
  // that switch; one left with none disappears.
  const featureGroups = useMemo(
    () =>
      FEATURE_GROUPS.map((g) => ({
        ...g,
        keys: g.keys.filter((key) => internal || key !== "progressDashboard"),
      })).filter((g) => g.keys.length > 0),
    [internal]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof getSettings === "function") {
        const doc = await getSettings();
        const p = mergeProfile(doc?.profile);
        const f = mergeFeatures(doc?.features);
        setProfile(p);
        setFeatures(f);
        // Server logo wins when present. Never wipe a device upload just
        // because the server hasn't stored one yet (demo/local/Company tab).
        if (p.logoDataUrl) setCompanyLogoDataUrl(p.logoDataUrl);
        setSpeechToTextEnabled(f.speechToText !== false);
        setQuickbooksFeatureEnabled(f.quickbooks !== false);
        setQuickbooksDocsFeatureEnabled(anyQuickbooksDocFeature(doc?.features));
        setQuickbooksDocFeatureEnabled("invoice", quickbooksDocFeature(doc?.features, "invoice"));
        setQuickbooksDocFeatureEnabled("estimate", quickbooksDocFeature(doc?.features, "estimate"));
      }
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setLoading(false);
      setDirty(false);
    }
  }, [getSettings, showToast]);

  const runHealth = useCallback(async () => {
    setHealthBusy(true);
    try {
      setHealth(await probeConnections());
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setHealthBusy(false);
    }
  }, [showToast]);

  const loadAgentAccess = useCallback(async () => {
    try {
      const st = await fetchAgentAccessStatus();
      setAgentGrant(st.grant || null);
      setAgentAudit(Array.isArray(st.audit) ? st.audit : []);
    } catch {
      /* offline / function not live yet */
    }
  }, []);

  useEffect(() => {
    loadAgentAccess();
  }, [loadAgentAccess]);

  const loadAssistantLicenses = useCallback(async () => {
    try {
      const st = await fetchAssistantLicenseStatus();
      setAsstLicenses(Array.isArray(st.licenses) ? st.licenses : []);
      setAsstAudit(Array.isArray(st.audit) ? st.audit : []);
      setAsstStored(getStoredAssistantToken());
    } catch {
      /* offline / function not live yet */
    }
  }, []);

  useEffect(() => {
    loadAssistantLicenses();
  }, [loadAssistantLicenses]);

  useEffect(() => {
    const id = setInterval(() => setAgentNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const mintOwnerAsst = useCallback(async () => {
    setAsstBusy(true);
    setAsstTokenShown("");
    try {
      const res = await mintAssistantLicense({
        kind: "owner",
        label: "Owner unlimited",
      });
      setAsstTokenShown(res.token || "");
      setAsstLicenses(Array.isArray(res.licenses) ? res.licenses : []);
      setAsstAudit(Array.isArray(res.audit) ? res.audit : []);
      showToast?.("Your unlimited assistant token is ready — copy it once");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAsstBusy(false);
    }
  }, [showToast]);

  const mintPaidAsst = useCallback(async () => {
    const label = asstPaidLabel.trim();
    if (!label) {
      showToast?.("Enter the customer name first");
      return;
    }
    setAsstBusy(true);
    setAsstTokenShown("");
    try {
      const res = await mintAssistantLicense({ kind: "paid", label });
      setAsstTokenShown(res.token || "");
      setAsstLicenses(Array.isArray(res.licenses) ? res.licenses : []);
      setAsstAudit(Array.isArray(res.audit) ? res.audit : []);
      setAsstPaidLabel("");
      showToast?.("Customer token ready — copy once and send it");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAsstBusy(false);
    }
  }, [asstPaidLabel, showToast]);

  const revokeAsst = useCallback(
    async (licenseId) => {
      setAsstBusy(true);
      try {
        const res = await revokeAssistantLicense(licenseId);
        setAsstLicenses(Array.isArray(res.licenses) ? res.licenses : []);
        setAsstAudit(Array.isArray(res.audit) ? res.audit : []);
        showToast?.(res.message || "License revoked");
      } catch (e) {
        showToast?.(String(e.message || e));
      } finally {
        setAsstBusy(false);
      }
    },
    [showToast]
  );

  const activateAsst = useCallback(async () => {
    const token = asstActivateInput.trim();
    if (!token) {
      showToast?.("Paste a license token first");
      return;
    }
    setAsstBusy(true);
    try {
      const res = await activateAssistantLicense(token);
      setAsstStored(getStoredAssistantToken());
      setAsstActivateInput("");
      showToast?.(res.message || "Assistant unlocked");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAsstBusy(false);
    }
  }, [asstActivateInput, showToast]);

  const clearAsstLocal = useCallback(() => {
    clearStoredAssistantToken();
    setAsstStored(null);
    showToast?.("License removed from this device");
  }, [showToast]);

  const copyAsstToken = useCallback(async () => {
    if (!asstTokenShown) return;
    try {
      await navigator.clipboard?.writeText?.(asstTokenShown);
      showToast?.("Token copied");
    } catch {
      showToast?.("Could not copy — select the token manually");
    }
  }, [asstTokenShown, showToast]);

  const grantAgent = useCallback(async () => {
    setAgentBusy(true);
    setAgentCodeShown("");
    try {
      const res = await mintAgentAccess({
        ttlMs: agentTtlMin * 60 * 1000,
        scope: agentScope,
        label: "agent",
      });
      setAgentCodeShown(res.code || "");
      setAgentGrant(res.grant || null);
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      showToast?.("Agent code ready — share it once");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [agentScope, agentTtlMin, showToast]);

  /** One-tap 24h ON: mint at server MAX_TTL_MS with label agent-24h. */
  const grantAgent24h = useCallback(async () => {
    setAgentBusy(true);
    setAgentCodeShown("");
    try {
      const res = await mintAgentAccess24h({ scope: agent24Scope });
      setAgentCodeShown(res.code || "");
      setAgentGrant(res.grant || null);
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      showToast?.("24-hour agent code ready — share it once");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [agent24Scope, showToast]);

  /** Refresh = add the chosen duration to the same code (keep code / session). */
  const extendAgent = useCallback(async () => {
    setAgentBusy(true);
    try {
      const res = await extendAgentAccess({
        ttlMs: agentTtlMin * 60 * 1000,
        scope: agentScope,
      });
      setAgentGrant(res.grant || null);
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      // Don't clear a just-shown code — same code, more time.
      showToast?.("Access extended — same code, more time");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [agentScope, agentTtlMin, showToast]);

  const revokeAgent = useCallback(async () => {
    setAgentBusy(true);
    try {
      const res = await revokeAgentAccess();
      setAgentGrant(null);
      setAgentCodeShown("");
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      showToast?.(res.revoked ? "Agent access revoked" : "No active grant");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [showToast]);

  /** Toggle ON mints 24h; OFF / STOP revokes immediately server-side. */
  const onAgent24hToggle = useCallback(
    async (wantOn) => {
      if (wantOn) {
        if (agentGrant) return; // already active
        await grantAgent24h();
      } else {
        await revokeAgent();
      }
    },
    [agentGrant, grantAgent24h, revokeAgent]
  );

  const copyAgentCode = useCallback(async () => {
    if (!agentCodeShown) return;
    try {
      await navigator.clipboard?.writeText?.(agentCodeShown);
      showToast?.("Code copied");
    } catch {
      showToast?.("Could not copy — select the code manually");
    }
  }, [agentCodeShown, showToast]);

  useEffect(() => {
    load();
    runHealth();
  }, [load, runHealth]);

  const setP = (key, val) => {
    setProfile((p) => {
      const next = { ...p, [key]: val };
      // When the company email changes, keep the standard Zelle line pointed
      // at that same mailbox so printouts (and the demo) stay in sync.
      if (key === "email") {
        const email = String(val || "").trim();
        const prevZ = String(p.zelleInstructions || "").trim();
        const m = prevZ.match(/^Zelle:\s*Send payment to\s+(.+?)\.?\s*$/i);
        if (!prevZ || m) {
          next.zelleInstructions = defaultZelleInstructions(email);
        }
      }
      return next;
    });
    setDirty(true);
  };

  const setPayMethod = (key, on) => {
    setProfile((p) => ({
      ...p,
      paymentMethods: { ...p.paymentMethods, [key]: on },
    }));
    setDirty(true);
  };

  const setF = (key, on) => {
    setFeatures((f) => {
      const next = { ...f, [key]: on };
      // Sync off also kills every send-through-QB path (no half-state).
      if (key === "quickbooks" && !on) {
        next.quickbooksDocs = false;
        next.quickbooksInvoices = false;
        next.quickbooksEstimates = false;
      }
      // Sending a doc through QB requires sync on.
      if (QB_DOC_KEYS.includes(key) && on) next.quickbooks = true;
      // Keep the legacy umbrella in step so older readers stay correct.
      if (QB_DOC_KEYS.includes(key)) {
        next.quickbooksDocs = next.quickbooksInvoices !== false || next.quickbooksEstimates !== false;
      }
      return next;
    });
    if (key === "speechToText") setSpeechToTextEnabled(!!on);
    // Instant local gates so UI flips before Save.
    if (key === "quickbooks") {
      setQuickbooksFeatureEnabled(!!on);
      if (!on) {
        setQuickbooksDocsFeatureEnabled(false);
        setQuickbooksDocFeatureEnabled("invoice", false);
        setQuickbooksDocFeatureEnabled("estimate", false);
      }
    }
    if (QB_DOC_KEYS.includes(key)) {
      setQuickbooksDocFeatureEnabled(key === "quickbooksEstimates" ? "estimate" : "invoice", !!on);
      if (on) {
        setQuickbooksFeatureEnabled(true);
        setQuickbooksDocsFeatureEnabled(true);
      }
    }
    setDirty(true);
  };

  const onLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const dataUrl = await readLogoFileAsDataUrl(file);
      setP("logoDataUrl", dataUrl);
      setCompanyLogoDataUrl(dataUrl);
      applyCompanyLogoToActiveConfig(dataUrl);
      showToast?.("Logo ready — used on invoices right away. Tap Save to keep it.");
    } catch {
      showToast?.("Couldn’t read that image — try another file");
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    if (typeof saveSettings !== "function") {
      showToast?.("Settings save not available");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ profile, features });
      if (profile.logoDataUrl) setCompanyLogoDataUrl(profile.logoDataUrl);
      else clearCompanyLogo();
      // Push the whole company profile into live branding so local printouts
      // (invoices, estimates, statements, requisitions) use the new values
      // immediately — no reload.
      applyCompanyProfileToActiveConfig(profile);
      setSpeechToTextEnabled(features.speechToText !== false);
      const qbOn = features.quickbooks !== false;
      const invOn = qbOn && quickbooksDocFeature(features, "invoice");
      const estOn = qbOn && quickbooksDocFeature(features, "estimate");
      setQuickbooksFeatureEnabled(qbOn);
      setQuickbooksDocsFeatureEnabled(invOn || estOn);
      setQuickbooksDocFeatureEnabled("invoice", invOn);
      setQuickbooksDocFeatureEnabled("estimate", estOn);
      setDirty(false);
      showToast?.(
        !qbOn
          ? "Settings saved — QuickBooks off, local only"
          : !invOn && !estOn
            ? "Settings saved — QuickBooks still syncing, send/view is local only"
            : invOn && estOn
              ? "Settings saved"
              : `Settings saved — only ${invOn ? "invoices" : "estimates"} send through QuickBooks`
      );
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const refreshCal = async () => {
    setCalBusy(true);
    try {
      if (typeof pullCalendarNow === "function") {
        await pullCalendarNow();
      }
      await runHealth();
      showToast?.("Calendar refresh requested");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setCalBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-sm font-semibold text-slate-500">Loading settings…</div>
    );
  }

  const connOk =
    !!health?.calendar?.ok && !!health?.email?.ok && !!health?.cardEntry?.ok;
  const agentRemainMs =
    agentGrant
      ? Math.max(
          0,
          (agentGrant.hasSession
            ? agentGrant.sessionExpiresAt || agentGrant.expiresAt
            : agentGrant.expiresAt || 0) - agentNow
        )
      : 0;
  const agentRemain = agentGrant ? formatRemaining(agentRemainMs) : null;
  const agentAccessOn = !!agentGrant && agentRemainMs > 0 && !agentGrant.revokedAt;
  const agentStatusLine = agentAccessOn
    ? `ON · ${agentRemain} remaining${
        agentGrant.hasSession
          ? " · agent is in"
          : agentGrant.used
            ? " · code used"
            : " · code waiting"
      }`
    : "OFF · no active access";

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-5 pb-28" data-testid="settings-page">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Open a section to manage it. Everything starts collapsed.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          data-testid="settings-save"
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
            dirty && !saving
              ? "bg-brand text-white shadow-sm"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {/* ── Connections ── */}
      <MenuSection
        id="connections"
        title="Connections"
        summary="Calendar, email, and card entry health"
        open={openMenu.connections}
        onToggle={() => toggleMenu("connections")}
        badge={
          health ? (
            <StatusPill ok={connOk} label={connOk ? "OK" : "Check"} />
          ) : null
        }
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Live checks — calendar sync, email send path, and card entry.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <StatusPill ok={!!health?.calendar?.ok} label="Calendar" />
          <StatusPill ok={!!health?.email?.ok} label="Email" />
          <StatusPill ok={!!health?.cardEntry?.ok} label="Card entry" />
        </div>
        <ul className="space-y-2 text-sm font-semibold text-slate-700">
          <li>
            <span className="text-slate-500 font-bold">Calendar · </span>
            {health?.calendar?.detail || "—"}
          </li>
          <li>
            <span className="text-slate-500 font-bold">Email · </span>
            {health?.email?.detail || "—"}
          </li>
          <li>
            <span className="text-slate-500 font-bold">Card entry · </span>
            {health?.cardEntry?.detail || "—"}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={runHealth}
            disabled={healthBusy}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700"
          >
            {healthBusy ? "Checking…" : "Re-check"}
          </button>
          <button
            type="button"
            onClick={refreshCal}
            disabled={calBusy}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700"
          >
            {calBusy ? "Refreshing…" : "Refresh calendar now"}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 font-semibold mt-3">
          Payment links use the host link builder. Card typing needs the server card key. Email needs
          the send key on the server.
        </p>
      </MenuSection>

      {/* ── Company profile ── */}
      <MenuSection
        id="company"
        title="Company profile"
        summary={profile.companyName || "Name, logo, address, payment profile"}
        open={openMenu.company}
        onToggle={() => toggleMenu("company")}
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Used on invoices, estimates, statements, and letterhead.
        </p>
        <Fld label="Company name">
          <input
            className={inputCls}
            value={profile.companyName}
            onChange={(e) => setP("companyName", e.target.value)}
          />
        </Fld>
        <Fld label="License #">
          <input className={inputCls} value={profile.license} onChange={(e) => setP("license", e.target.value)} />
        </Fld>
        <Fld label="Street">
          <input className={inputCls} value={profile.street} onChange={(e) => setP("street", e.target.value)} />
        </Fld>
        <Fld label="City, state, zip">
          <input
            className={inputCls}
            value={profile.cityStateZip}
            onChange={(e) => setP("cityStateZip", e.target.value)}
          />
        </Fld>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 sm:gap-3">
          <Fld label="Phone">
            <input className={inputCls} value={profile.phone} onChange={(e) => setP("phone", e.target.value)} />
          </Fld>
          <Fld label="Email">
            <input className={inputCls} value={profile.email} onChange={(e) => setP("email", e.target.value)} />
          </Fld>
        </div>
        <Fld label="Brand color">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={profile.brandColor || "#2d8a3e"}
              onChange={(e) => setP("brandColor", e.target.value)}
              className="h-10 w-14 rounded-lg border border-slate-200 cursor-pointer"
            />
            <input
              className={inputCls}
              value={profile.brandColor}
              onChange={(e) => setP("brandColor", e.target.value)}
            />
          </div>
        </Fld>
        <Fld label="Company logo file">
          <div className="flex items-start gap-3" data-testid="settings-logo-row">
            <div className="h-16 w-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={profile.logoDataUrl || getCompanyLogoSrc()}
                alt="Company logo"
                className="max-h-full max-w-full object-contain"
                data-testid="settings-logo-preview"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 font-semibold mb-2">
                {profile.logoDataUrl
                  ? "Custom logo on file — used in the app. Tap Save after changing."
                  : "Default LE logo file — change it anytime."}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-800 cursor-pointer">
                  {logoBusy ? "Loading…" : "Change logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      e.target.value = "";
                      onLogo(f);
                    }}
                    data-testid="settings-logo-file"
                  />
                </label>
                {profile.logoDataUrl ? (
                  <button
                    type="button"
                    className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700"
                    onClick={() => {
                      setP("logoDataUrl", "");
                      clearCompanyLogo();
                      applyCompanyLogoToActiveConfig("");
                    }}
                    data-testid="settings-logo-reset"
                  >
                    Use default
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Fld>
        <Fld label="Signatures">
          <p className="text-xs text-slate-500 font-semibold mb-2">
            Draw or upload once — letters and the Con Ed application use the same signature for each signer.
          </p>
          <button
            type="button"
            className="rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-extrabold text-white"
            onClick={() => setSigSheetOpen(true)}
            data-testid="settings-signatures-open"
          >
            Manage signatures
          </button>
        </Fld>
        <Fld label="Calendar account">
          <input
            className={inputCls}
            value={profile.calendarAccount}
            onChange={(e) => setP("calendarAccount", e.target.value)}
          />
        </Fld>
        <Fld label="Default terms">
          <input
            className={inputCls}
            value={profile.defaultTerms}
            onChange={(e) => setP("defaultTerms", e.target.value)}
          />
        </Fld>
        <Fld label="Email from address">
          <input
            className={inputCls}
            value={profile.emailFrom}
            onChange={(e) => setP("emailFrom", e.target.value)}
          />
        </Fld>
        <Fld label="Pay link base (Cardknox site)">
          <input
            className={inputCls}
            value={profile.payLinkBase}
            onChange={(e) => setP("payLinkBase", e.target.value)}
          />
        </Fld>
        <Fld label="Short name (emails / sign-off)">
          <input
            className={inputCls}
            value={profile.shortName || ""}
            onChange={(e) => setP("shortName", e.target.value)}
            placeholder="e.g. BLZ Electric"
          />
        </Fld>
        <Fld label="Website">
          <input
            className={inputCls}
            value={profile.website || ""}
            onChange={(e) => setP("website", e.target.value)}
          />
        </Fld>
        <Fld label="Zelle payment line (on invoices)">
          <input
            className={inputCls}
            value={profile.zelleInstructions || ""}
            onChange={(e) => setP("zelleInstructions", e.target.value)}
          />
        </Fld>
        <Fld label="Check payment line (on invoices)">
          <textarea
            className={inputCls + " min-h-[4.5rem]"}
            value={profile.checkInstructions || ""}
            onChange={(e) => setP("checkInstructions", e.target.value)}
          />
        </Fld>
        <Fld label="Deposit-to banks (one per line)">
          <textarea
            className={inputCls + " min-h-[4.5rem]"}
            value={Array.isArray(profile.depositBanks) ? profile.depositBanks.join("\n") : String(profile.depositBanks || "")}
            onChange={(e) =>
              setP(
                "depositBanks",
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder={"Martin Dorkin\nWells Fargo\nBLZ Chase"}
            data-testid="settings-deposit-banks"
          />
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            Shown when you record a check or Zelle — which bank the money goes into.
          </p>
        </Fld>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
          Payment methods (profile)
        </div>
        <div className="flex flex-wrap gap-3 mb-2">
          {["card", "zelle", "check"].map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={!!profile.paymentMethods?.[k]}
                onChange={(e) => setPayMethod(k, e.target.checked)}
              />
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </label>
          ))}
        </div>
      </MenuSection>

      {/* ── Features (plans & toggles, categorized) ── */}
      <MenuSection
        id="features"
        title="Features"
        summary="Speech-to-text, documents, payments, AI — turn sections on or off"
        open={openMenu.features}
        onToggle={() => toggleMenu("features")}
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Plans and features for this company. Open a category to turn items on or off.
        </p>
        {/* Plan/modules are subscription-driven (read-only). */}
        <div className="mb-3" data-testid="settings-plan">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="rounded-full bg-slate-900 text-white text-xs font-extrabold px-3 py-1 uppercase">
              {config.plan.tier}
            </span>
            {config.plan.crewAddon ? (
              <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1">
                + Crew
              </span>
            ) : null}
            {internal ? (
              <span className="rounded-full bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1">
                Internal
              </span>
            ) : null}
          </div>
          <div className="space-y-1.5">
            {MODULES.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2"
                data-testid={`module-${key}`}
              >
                <span className="text-sm font-semibold text-slate-800">{MODULE_LABELS[key]}</span>
                <span
                  className={`text-xs font-extrabold ${
                    config.modules[key] ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {config.modules[key] ? "On" : "Off"}
                </span>
              </div>
            ))}
          </div>
        </div>
        {featureGroups.map((group) =>
          group.keys.length <= 1 ? (
            // A category with a single switch is just that switch — a submenu
            // that hides one toggle is pure friction (Levi 2026-07-27).
            <div key={group.id} className="mb-2" data-testid={`feature-flat-${group.id}`}>
              {group.keys.map((key) => (
                <FeatureRow key={key} featureKey={key} features={features} setF={setF} />
              ))}
            </div>
          ) : (
            <FeatureSubmenu
              key={group.id}
              id={group.id}
              title={group.title}
              hint={group.hint}
              open={!!openFeature[group.id]}
              onToggle={() => toggleFeature(group.id)}
            >
              {group.keys.map((key) => (
                <FeatureRow key={key} featureKey={key} features={features} setF={setF} />
              ))}
            </FeatureSubmenu>
          )
        )}
      </MenuSection>

      {/* ── Special features (integrations that own their own sub-switches) ── */}
      <MenuSection
        id="special"
        title="Special features"
        summary={
          qbSyncOn
            ? qbInvoicesOn && qbEstimatesOn
              ? "QuickBooks — syncing, invoices & estimates send through QB"
              : qbInvoicesOn || qbEstimatesOn
                ? `QuickBooks — syncing, only ${qbInvoicesOn ? "invoices" : "estimates"} send through QB`
                : "QuickBooks — syncing in the background, sending is local"
            : "QuickBooks — off"
        }
        open={openMenu.special}
        onToggle={() => toggleMenu("special")}
        badge={<StatusPill ok={qbSyncOn} label={qbSyncOn ? "QuickBooks on" : "QuickBooks off"} />}
      >
        <div
          className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden"
          data-testid="special-feature-quickbooks"
        >
          <div className="px-3 py-2.5 border-b border-slate-200/80">
            <div className="text-sm font-extrabold text-slate-800">QuickBooks</div>
            <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
              Sync runs in the background. Sending each document type through QuickBooks is its
              own switch.
            </div>
          </div>
          <div className="px-3 py-3 space-y-2">
            <FeatureRow
              featureKey="quickbooks"
              features={features}
              setF={setF}
              title="QuickBooks synchronization"
              hint="On = jobs & customers keep syncing in the background. Off = no QuickBooks at all."
              testId="settings-quickbooks"
            />
            <FeatureRow
              featureKey="quickbooksInvoices"
              features={features}
              setF={setF}
              title="Send invoices through QuickBooks"
              hint={
                qbSyncOn
                  ? "Off = the send button emails the local PDF instead. Sync keeps running either way."
                  : "Turning this on switches synchronization back on too."
              }
              disabled={!qbSyncOn}
              testId="settings-quickbooks-invoices"
            />
            <FeatureRow
              featureKey="quickbooksEstimates"
              features={features}
              setF={setF}
              title="Send estimates through QuickBooks"
              hint={
                qbSyncOn
                  ? "Off = the send button emails the local PDF instead. Sync keeps running either way."
                  : "Turning this on switches synchronization back on too."
              }
              disabled={!qbSyncOn}
              testId="settings-quickbooks-estimates"
            />
          </div>
        </div>
      </MenuSection>

      {/* ── AI Assistant licenses (paid feature) ── */}
      <MenuSection
        id="assistant"
        title="AI Assistant licenses"
        summary={
          internal
            ? asstLicenses.some((l) => l.active)
              ? `${asstLicenses.filter((l) => l.active).length} active token${
                  asstLicenses.filter((l) => l.active).length === 1 ? "" : "s"
                }`
              : "Paid feature · mint unlimited tokens"
            : asstStored
              ? "Licensed on this device"
              : "Enter a paid license token"
        }
        open={openMenu.assistant}
        onToggle={() => toggleMenu("assistant")}
        badge={
          internal || asstStored ? (
            <StatusPill ok label={internal ? "Seller" : "Licensed"} />
          ) : (
            <StatusPill ok={false} label="Locked" />
          )
        }
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          The in-app assistant is a paid feature. Generate an unlimited token for yourself, or a
          token for anyone who pays. Tokens never expire unless you revoke them.
        </p>

        
        <div
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 mb-3 space-y-3"
          data-testid="asst-voice-settings"
        >
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
            Chat voice
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">Speak replies</div>
              <div className="text-xs text-slate-500 font-semibold mt-0.5">
                Read Israel&apos;s answers out loud in the chat bubble
              </div>
            </div>
            <Toggle
              on={!!appSettings.assistantSpeak}
              onChange={(on) => {
                setAssistantSpeakEnabled(on);
                showToast?.(on ? "Speak replies on" : "Speak replies off");
              }}
              label="Speak replies"
            />
          </div>
          <label className="block">
            <span className="text-xs font-extrabold text-slate-600">Voice</span>
            <select
              className={`${inputCls} mt-1`}
              value={appSettings.assistantVoice || "auto"}
              onChange={(e) => {
                setAssistantVoiceId(e.target.value);
                showToast?.("Voice updated");
              }}
              data-testid="asst-voice-select"
              aria-label="Assistant voice"
            >
              {ASSISTANT_VOICE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500 font-semibold">
            Mic (speech to text) is under Features. Expand / shrink chat from the bubble header; ✕
            minimizes.
          </p>
        </div>

        {internal ? (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                disabled={asstBusy}
                onClick={mintOwnerAsst}
                className="rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"
                data-testid="asst-mint-owner"
              >
                {asstBusy ? "Working…" : "My unlimited token"}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                className={inputCls}
                placeholder="Customer name (who paid)"
                value={asstPaidLabel}
                onChange={(e) => setAsstPaidLabel(e.target.value)}
                data-testid="asst-paid-label"
              />
              <button
                type="button"
                disabled={asstBusy}
                onClick={mintPaidAsst}
                className="rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-50 shrink-0"
                data-testid="asst-mint-paid"
              >
                {asstBusy ? "Working…" : "Token for customer"}
              </button>
            </div>
          </>
        ) : null}

        {asstTokenShown ? (
          <div
            className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 mb-3"
            data-testid="asst-token-panel"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800 mb-1">
              Copy this token once
            </div>
            <div className="text-sm font-mono font-extrabold tracking-wide text-slate-900 text-center py-1 break-all">
              {asstTokenShown}
            </div>
            <button
              type="button"
              onClick={copyAsstToken}
              className="mt-2 w-full rounded-xl bg-emerald-700 text-white px-3 py-2 text-sm font-extrabold"
            >
              Copy token
            </button>
            <p className="text-xs text-emerald-900/80 font-semibold mt-2 text-center">
              Shown once · unlimited use until revoked
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 mb-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
            Activate on this device
          </div>
          {asstStored ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill ok label="Licensed" />
              <span className="text-xs font-semibold text-slate-600">
                {asstStored.license?.label || asstStored.license?.tokenPreview || "Active"}
              </span>
              <button
                type="button"
                onClick={clearAsstLocal}
                className="text-xs font-extrabold text-slate-500 underline"
              >
                Remove from device
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className={inputCls}
                placeholder="Paste license token"
                value={asstActivateInput}
                onChange={(e) => setAsstActivateInput(e.target.value)}
                data-testid="asst-activate-input"
              />
              <button
                type="button"
                disabled={asstBusy}
                onClick={activateAsst}
                className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-50 shrink-0"
                data-testid="asst-activate-btn"
              >
                Unlock assistant
              </button>
            </div>
          )}
          {internal ? (
            <p className="text-[11px] text-slate-500 font-semibold mt-2">
              Your office app stays unlocked as the seller. Tokens are for other companies or
              devices that need the paid assistant.
            </p>
          ) : null}
        </div>

        {internal && asstLicenses.length > 0 ? (
          <div className="mb-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Issued tokens
            </div>
            <ul className="space-y-2 max-h-48 overflow-y-auto" data-testid="asst-license-list">
              {asstLicenses.slice(0, 40).map((lic) => (
                <li
                  key={lic.id}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-700 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
                >
                  <span className="flex-1 min-w-0">
                    <span className="font-extrabold">{lic.label}</span>
                    <span className="text-slate-400">
                      {" "}
                      · {lic.kind === "owner" ? "owner" : "paid"} · {lic.tokenPreview}
                      {lic.active ? "" : " · revoked"}
                    </span>
                  </span>
                  {lic.active ? (
                    <button
                      type="button"
                      disabled={asstBusy}
                      onClick={() => revokeAsst(lic.id)}
                      className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-700 disabled:opacity-40"
                      data-testid={`asst-revoke-${lic.id}`}
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {internal && asstAudit.length > 0 ? (
          <div className="mt-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              License log
            </div>
            <ul className="space-y-1.5 max-h-32 overflow-y-auto" data-testid="asst-audit">
              {asstAudit.slice(0, 12).map((row, i) => (
                <li
                  key={`${row.at}-${row.type}-${i}`}
                  className="text-xs font-semibold text-slate-600 flex gap-2"
                >
                  <span className="text-slate-400 shrink-0 tabular-nums">
                    {row.at
                      ? new Date(row.at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                  <span>
                    {row.type}
                    {row.note ? ` · ${row.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </MenuSection>

      {/* ── Agent access (internal tenants only) ── */}
      {internal ? (
        <>
          {/* Always-visible STOP strip while a grant is active (not buried in collapsed body) */}
          {agentAccessOn ? (
            <div
              className="rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 mb-3 flex flex-wrap items-center justify-between gap-3"
              data-testid="agent-24h-active-banner"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-red-800">
                  Agent access
                </div>
                <div
                  className="text-sm font-extrabold text-slate-900 mt-0.5"
                  data-testid="agent-24h-status-live"
                >
                  {agentStatusLine}
                </div>
              </div>
              <button
                type="button"
                disabled={agentBusy}
                onClick={revokeAgent}
                className="rounded-xl bg-red-600 text-white px-5 py-2.5 text-sm font-extrabold disabled:opacity-50 shrink-0"
                data-testid="agent-stop-btn"
              >
                {agentBusy ? "Stopping…" : "STOP"}
              </button>
            </div>
          ) : null}

          <MenuSection
            id="agent"
            title="Agent access"
            summary={agentStatusLine}
            open={openMenu.agent}
            onToggle={() => toggleMenu("agent")}
            badge={
              agentAccessOn ? (
                <StatusPill ok label={agentRemain || "ON"} />
              ) : null
            }
          >
            {/* One-tap 24-Hour Agent Access (primary) */}
            <div
              className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 mb-3"
              data-testid="agent-24h-panel"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">24-Hour Agent Access</div>
                  <div
                    className="text-xs font-semibold text-slate-600 mt-0.5"
                    data-testid="agent-24h-status"
                  >
                    {agentStatusLine}
                  </div>
                </div>
                <Toggle
                  on={agentAccessOn}
                  onChange={onAgent24hToggle}
                  label="24-Hour Agent Access"
                  data-testid="agent-24h-toggle"
                />
              </div>
              {!agentAccessOn ? (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Scope for 24h grant
                    <select
                      className={`${inputCls} mt-1 w-auto min-w-[9rem]`}
                      value={agent24Scope}
                      onChange={(e) => setAgent24Scope(e.target.value)}
                      data-testid="agent-24h-scope"
                    >
                      <option value="test">Test / read (default)</option>
                      <option value="full">Full app (live data)</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {agent24Scope === "full" && !agentAccessOn ? (
                <p
                  className="text-[11px] font-semibold text-amber-800 mt-2"
                  data-testid="agent-24h-full-warn"
                >
                  Full grants live-data access as you — only turn on when the agent must act on real
                  customer/company data.
                </p>
              ) : null}
              {agentAccessOn ? (
                <button
                  type="button"
                  disabled={agentBusy}
                  onClick={revokeAgent}
                  className="mt-3 w-full rounded-xl bg-red-600 text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"
                  data-testid="agent-stop-btn-inline"
                >
                  {agentBusy ? "Stopping…" : "STOP · revoke now"}
                </button>
              ) : null}
            </div>

            {agentCodeShown ? (
              <div
                className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 mb-3"
                data-testid="agent-code-panel"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800 mb-1">
                  Show this code once
                </div>
                <div className="text-2xl font-mono font-extrabold tracking-[0.2em] text-slate-900 text-center py-1">
                  {agentCodeShown}
                </div>
                <button
                  type="button"
                  onClick={copyAgentCode}
                  className="mt-2 w-full rounded-xl bg-emerald-700 text-white px-3 py-2 text-sm font-extrabold"
                >
                  Copy code
                </button>
                <p className="text-xs text-emerald-900/80 font-semibold mt-2 text-center">
                  Agent enters it on the lock screen. Single-use · expires automatically.
                </p>
              </div>
            ) : null}

            {agentGrant && !agentCodeShown ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3 text-sm font-semibold text-slate-700">
                {agentGrant.hasSession ? (
                  <span data-testid="agent-session-active">
                    Agent is in ·{" "}
                    {formatRemaining(
                      Math.max(0, (agentGrant.sessionExpiresAt || agentGrant.expiresAt) - agentNow)
                    )}{" "}
                    left
                  </span>
                ) : agentGrant.used ? (
                  <span>Code used · session ended or expired</span>
                ) : (
                  <span data-testid="agent-grant-waiting">
                    Code waiting ·{" "}
                    {formatRemaining(Math.max(0, (agentGrant.expiresAt || 0) - agentNow))} left
                  </span>
                )}
              </div>
            ) : null}

            {/* Advanced controls — secondary; no regression */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-1">
              <button
                type="button"
                onClick={() => setAgentMoreOpen((o) => !o)}
                aria-expanded={agentMoreOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                data-testid="agent-more-options"
              >
                <span className="text-sm font-extrabold text-slate-800">More options</span>
                <span
                  className={`text-slate-400 text-[9px] transition-transform ${
                    agentMoreOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden
                >
                  ▶
                </span>
              </button>
              {agentMoreOpen ? (
                <div className="px-3 pb-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500 font-semibold mb-3">
                    Custom duration, scope, and extend. Grant makes a new code. Refresh adds more time
                    to the same code.
                  </p>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <label className="text-sm font-semibold text-slate-700">
                      Duration
                      <select
                        className={`${inputCls} mt-1 w-auto min-w-[7rem]`}
                        value={agentTtlMin}
                        onChange={(e) => setAgentTtlMin(Number(e.target.value))}
                        data-testid="agent-ttl"
                      >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={60}>1 hour</option>
                        <option value={120}>2 hours</option>
                        <option value={720}>12 hours</option>
                        <option value={1440}>24 hours</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Scope
                      <select
                        className={`${inputCls} mt-1 w-auto min-w-[7rem]`}
                        value={agentScope}
                        onChange={(e) => setAgentScope(e.target.value)}
                        data-testid="agent-scope"
                      >
                        <option value="full">Full app</option>
                        <option value="test">Test / read</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={agentBusy}
                      onClick={grantAgent}
                      className="rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"
                      data-testid="agent-grant-btn"
                    >
                      {agentBusy ? "Working…" : "Grant agent access"}
                    </button>
                    <button
                      type="button"
                      disabled={agentBusy || !agentGrant}
                      onClick={extendAgent}
                      className="rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-extrabold disabled:opacity-40"
                      data-testid="agent-refresh-btn"
                      title="Add the selected duration to the same access code"
                    >
                      {agentBusy ? "Working…" : "Refresh"}
                    </button>
                    <button
                      type="button"
                      disabled={agentBusy || !agentGrant}
                      onClick={revokeAgent}
                      className="rounded-xl bg-slate-100 text-slate-800 px-4 py-2.5 text-sm font-extrabold disabled:opacity-40"
                      data-testid="agent-revoke-btn"
                    >
                      Revoke now
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-2">
                    Refresh keeps the same code and adds the duration you picked (e.g. 31 min left + 24
                    hours). Max duration is{" "}
                    {Math.round(AGENT_ACCESS_MAX_TTL_MS / 3600000)}h.
                  </p>
                </div>
              ) : null}
            </div>

            {agentAudit.length > 0 ? (
              <div className="mt-4">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
                  Access log
                </div>
                <ul className="space-y-1.5 max-h-40 overflow-y-auto" data-testid="agent-audit">
                  {agentAudit.slice(0, 12).map((row, i) => (
                    <li
                      key={`${row.at}-${row.type}-${i}`}
                      className="text-xs font-semibold text-slate-600 flex gap-2"
                    >
                      <span className="text-slate-400 shrink-0 tabular-nums">
                        {row.at
                          ? new Date(row.at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                      <span>
                        {row.type}
                        {row.note ? ` · ${row.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </MenuSection>
        </>
      ) : null}

      {/* ── Account ── */}
      <MenuSection
        id="account"
        title="Account"
        summary="Log off this device"
        open={openMenu.account}
        onToggle={() => toggleMenu("account")}
      >
        <button
          type="button"
          onClick={() => logOff()}
          className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-extrabold"
        >
          Log off
        </button>
      </MenuSection>

      {sigSheetOpen ? (
        <SignatureRegisterSheet
          profile={profile}
          onClose={() => setSigSheetOpen(false)}
          onSave={(nextProfile) => {
            setProfile(mergeProfile(nextProfile));
            setDirty(true);
            applyCompanyProfileToActiveConfig?.(mergeProfile(nextProfile));
          }}
        />
      ) : null}
    </div>
  );
}
