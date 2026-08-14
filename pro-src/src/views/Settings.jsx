// Settings — collapsible menu: connections, company profile, features, agent access.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { MODULES, MODULE_LABELS } from "../lib/tenantConfig.js";
import {
  DEFAULT_FEATURES,
  DEFAULT_PROFILE,
  FEATURE_GROUPS,
  PAYMENT_METHOD_OPTIONS,
  anyQuickbooksDocFeature,
  featureLabel,
  mergeFeatures,
  mergeProfile,
  quickbooksDocFeature,
} from "../lib/tenantProfile.js";
import SignatureRegisterSheet from "../components/SignatureRegisterSheet.jsx";
import { probeConnections } from "../lib/connectionHealth.js";
import { gdriveStatus } from "../lib/agencyForms/gdriveSave.js";
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
  setEstimateGeneratorFees,
  getEstimateGeneratorFees,
  hydrateEstimateGeneratorFeesFromCloud,
  useAppSettings,
} from "../lib/appSettings.js";
import { buildCheckPdfBlob, BLZ_CHECK } from "../lib/checkPrintPdf.js";
import { openPdfForNativeView } from "../lib/pdfOpen.js";
import { DEFAULT_FEES } from "../lib/serviceUpgradeEstimator.js";
import {
  applyCompanyLogoToActiveConfig,
  applyCompanyProfileToActiveConfig,
  defaultZelleInstructions,
} from "../lib/tenantBranding.js";
import {
  fetchAgentAccessStatus,
  formatAccessStatusLine,
  formatRemaining,
  revealStandingAgentCode,
  rotateStandingAgentCode,
  setAgentAccess,
  setAgentAccessTimer,
  setAgentPayments,
  stopAgentAccess,
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
  const [gdriveInfo, setGdriveInfo] = useState(null);
  const [agentState, setAgentState] = useState(null);
  const [agentAudit, setAgentAudit] = useState([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentNow, setAgentNow] = useState(Date.now());
  const [agentPayWarn, setAgentPayWarn] = useState(false);
  const [agentStandingCode, setAgentStandingCode] = useState("");
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
    estimateGen: false,
    checkPrint: false,
    features: false,
    special: false,
    assistant: false,
    agent: false,
    account: false,
  });
  const [estFees, setEstFees] = useState(() => ({
    ...DEFAULT_FEES,
    ...getEstimateGeneratorFees(),
  }));
  // Check Print (BLZ flagship only) — payee / amount / date entered by Levi.
  const [chk, setChk] = useState(() => ({
    payee: "",
    amount: "",
    date: "",
    checkNo: String(BLZ_CHECK.startCheckNo),
    memo: "",
  }));

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
        // Estimate Generator prices — cloud is shared phone ↔ computer.
        if (doc?.profile?.estimateGeneratorFees && typeof doc.profile.estimateGeneratorFees === "object") {
          hydrateEstimateGeneratorFeesFromCloud(doc.profile.estimateGeneratorFees);
          setEstFees({
            ...DEFAULT_FEES,
            ...getEstimateGeneratorFees(),
          });
        }
      }
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setLoading(false);
      setDirty(false);
    }
  }, [getSettings, showToast]);

  // One-time probe: is a platform Drive credential configured? Drives the
  // helper text under the Google Drive folder field (which SA email to share
  // with). Failure just leaves the neutral copy — Drive is always optional.
  useEffect(() => {
    let alive = true;
    gdriveStatus()
      .then((s) => {
        if (alive && s && s.ok) setGdriveInfo(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
      setAgentState(st.state || null);
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

  const toggleAgentAccess = useCallback(
    async (on) => {
      setAgentBusy(true);
      try {
        const timerMode = agentState?.timerMode === "24h" ? "24h" : "manual";
        const res = await setAgentAccess({ on: !!on, timerMode });
        setAgentState(res.state || null);
        setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
        if (on && res.standingCode) setAgentStandingCode(res.standingCode);
        if (!on) setAgentStandingCode("");
        showToast?.(res.message || (on ? "Agent access ON" : "Agent access OFF"));
      } catch (e) {
        showToast?.(String(e.message || e));
      } finally {
        setAgentBusy(false);
      }
    },
    [agentState?.timerMode, showToast]
  );

  const revealAgentCode = useCallback(async () => {
    setAgentBusy(true);
    try {
      const res = await revealStandingAgentCode();
      if (res.standingCode) setAgentStandingCode(res.standingCode);
      if (res.state) setAgentState(res.state);
      showToast?.(res.message || "Standing agent code ready");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [showToast]);

  const rotateAgentCode = useCallback(async () => {
    setAgentBusy(true);
    try {
      const res = await rotateStandingAgentCode();
      if (res.standingCode) setAgentStandingCode(res.standingCode);
      if (res.state) setAgentState(res.state);
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      showToast?.(res.message || "New agent code");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [showToast]);

  const copyAgentCode = useCallback(async () => {
    if (!agentStandingCode) return;
    try {
      await navigator.clipboard?.writeText?.(agentStandingCode);
      showToast?.("Agent code copied");
    } catch {
      showToast?.("Could not copy — select the code manually");
    }
  }, [agentStandingCode, showToast]);

  const changeAgentTimer = useCallback(
    async (timerMode) => {
      setAgentBusy(true);
      try {
        const res = await setAgentAccessTimer(timerMode);
        setAgentState(res.state || null);
        setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
        showToast?.(
          timerMode === "24h" ? "24-hour auto turn-off" : "Stays on until you stop it"
        );
      } catch (e) {
        showToast?.(String(e.message || e));
      } finally {
        setAgentBusy(false);
      }
    },
    [showToast]
  );

  const toggleAgentPayments = useCallback(
    async (on, { confirmed = false } = {}) => {
      // First ON tap only shows the warning; confirm button passes confirmed:true.
      if (on && !confirmed) {
        setAgentPayWarn(true);
        return;
      }
      setAgentBusy(true);
      try {
        const res = await setAgentPayments({ on: !!on });
        setAgentState(res.state || null);
        setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
        setAgentPayWarn(false);
        showToast?.(res.message || (on ? "Payment access ON" : "Payment access OFF"));
      } catch (e) {
        showToast?.(String(e.message || e));
      } finally {
        setAgentBusy(false);
      }
    },
    [showToast]
  );

  const stopAgent = useCallback(async () => {
    setAgentBusy(true);
    try {
      const res = await stopAgentAccess();
      setAgentState(res.state || null);
      setAgentAudit(Array.isArray(res.audit) ? res.audit : []);
      setAgentPayWarn(false);
      setAgentStandingCode("");
      showToast?.(res.message || "Agent access stopped");
    } catch (e) {
      showToast?.(String(e.message || e));
    } finally {
      setAgentBusy(false);
    }
  }, [showToast]);

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
      // Keep estimate-generator prices on the same cloud profile so phone + computer match.
      const fees = getEstimateGeneratorFees();
      await saveSettings({
        profile: {
          ...profile,
          ...(fees && Object.keys(fees).length ? { estimateGeneratorFees: fees } : {}),
        },
        features,
      });
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
  const agentStatusLine = formatAccessStatusLine(
    agentState
      ? {
          ...agentState,
          remainingMs:
            agentState.accessOn &&
            agentState.timerMode === "24h" &&
            agentState.autoOffAt
              ? Math.max(0, Number(agentState.autoOffAt) - agentNow)
              : agentState.remainingMs,
        }
      : null,
    agentNow
  );

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

      {/* ── Estimate Generator pricing ── */}
      <MenuSection
        id="estimateGen"
        title="Estimate Generator"
        summary="Service Upgrade pricing — meters, panels, filing, conduit"
        open={openMenu.estimateGen}
        onToggle={() => toggleMenu("estimateGen")}
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Adjust sell prices used by the Service Upgrade generator. Saved on this device.
        </p>
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
          Service Upgrade Generator
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            ["filing", "Filing (permit + utility)", "filing"],
            ["removalDisposal", "Removal & disposal", "removalDisposal"],
            ["alwaysIncluded", "Always included (outlet/ground/light)", "alwaysIncluded"],
            ["panelAdditional", "Each extra panel", "panelAdditional"],
            ["perFootMeterPanel", "$/ft meter→panel (extra)", "perFootMeterPanel"],
            ["conduitPerFoot", "$/ft conduit (2\")", "conduitPerFoot"],
            ["trenchDirtPerFoot", "$/ft trench dirt", "trenchDirtPerFoot"],
            ["trenchConcretePerFoot", "$/ft trench concrete", "trenchConcretePerFoot"],
          ].map(([key, label]) => (
            <Fld key={key} label={label}>
              <input
                className={inputCls}
                inputMode="decimal"
                value={estFees[key] ?? ""}
                data-testid={"est-fee-" + key}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setEstFees((f) => ({ ...f, [key]: Number.isFinite(n) ? n : e.target.value }));
                }}
              />
            </Fld>
          ))}
        </div>
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
          First meter (by size)
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {Object.keys(DEFAULT_FEES.meter || {}).map((sizeId) => (
            <Fld key={sizeId} label={sizeId}>
              <input
                className={inputCls}
                inputMode="decimal"
                value={estFees.meter?.[sizeId] ?? DEFAULT_FEES.meter[sizeId]}
                data-testid={"est-fee-meter-" + sizeId}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setEstFees((f) => ({
                    ...f,
                    meter: { ...(f.meter || DEFAULT_FEES.meter), [sizeId]: Number.isFinite(n) ? n : e.target.value },
                  }));
                }}
              />
            </Fld>
          ))}
        </div>
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
          Extra meter (2nd+)
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {Object.keys(DEFAULT_FEES.meterAdditional || {}).map((sizeId) => (
            <Fld key={"add-" + sizeId} label={sizeId}>
              <input
                className={inputCls}
                inputMode="decimal"
                value={estFees.meterAdditional?.[sizeId] ?? DEFAULT_FEES.meterAdditional[sizeId]}
                data-testid={"est-fee-meter-add-" + sizeId}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setEstFees((f) => ({
                    ...f,
                    meterAdditional: {
                      ...(f.meterAdditional || DEFAULT_FEES.meterAdditional),
                      [sizeId]: Number.isFinite(n) ? n : e.target.value,
                    },
                  }));
                }}
              />
            </Fld>
          ))}
        </div>
        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
          First panel (by amp)
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {Object.keys(DEFAULT_FEES.panel || {}).map((amp) => (
            <Fld key={"panel-" + amp} label={amp + "A"}>
              <input
                className={inputCls}
                inputMode="decimal"
                value={estFees.panel?.[amp] ?? DEFAULT_FEES.panel[amp]}
                data-testid={"est-fee-panel-" + amp}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setEstFees((f) => ({
                    ...f,
                    panel: { ...(f.panel || DEFAULT_FEES.panel), [amp]: Number.isFinite(n) ? n : e.target.value },
                  }));
                }}
              />
            </Fld>
          ))}
        </div>
        <button
          type="button"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white w-full"
          data-testid="est-fee-save"
          onClick={async () => {
            const payload = {
              filing: Number(estFees.filing),
              removalDisposal: Number(estFees.removalDisposal),
              alwaysIncluded: Number(estFees.alwaysIncluded),
              panelAdditional: Number(estFees.panelAdditional),
              perFootMeterPanel: Number(estFees.perFootMeterPanel),
              conduitPerFoot: Number(estFees.conduitPerFoot),
              trenchDirtPerFoot: Number(estFees.trenchDirtPerFoot),
              trenchConcretePerFoot: Number(estFees.trenchConcretePerFoot),
              meter: { ...(estFees.meter || {}) },
              meterAdditional: { ...(estFees.meterAdditional || {}) },
              panel: { ...(estFees.panel || {}) },
            };
            setEstimateGeneratorFees(payload);
            // Cloud link — phone and computer both read/write the same prices.
            if (typeof saveSettings === "function") {
              try {
                const doc = typeof getSettings === "function" ? await getSettings() : null;
                const baseProfile = mergeProfile(doc?.profile || profile);
                await saveSettings({
                  profile: { ...baseProfile, estimateGeneratorFees: payload },
                  features: mergeFeatures(doc?.features || features),
                });
                showToast?.("Estimate Generator prices saved — linked on all your devices");
              } catch (e) {
                showToast?.(
                  "Saved on this device — cloud link failed: " + String(e?.message || e)
                );
              }
            } else {
              showToast?.("Estimate Generator prices saved on this device");
            }
          }}
        >
          Save Estimate Generator prices
        </button>
      </MenuSection>

      {/* ── Check Print (BLZ flagship only) ── */}
      {internal ? (
        <MenuSection
          id="checkPrint"
          title="Check Print"
          summary="Print a BLZ Electric business check (front) — enter amount, payee, date"
          open={openMenu.checkPrint}
          onToggle={() => toggleMenu("checkPrint")}
        >
          <p className="text-xs text-slate-500 font-semibold mb-3">
            Generates a print-ready PDF of the check front on BLZ&apos;s own Chase
            account ({BLZ_CHECK.bank}) with the E-13B MICR line. The written amount
            is spelled automatically. Your authorized signature is applied automatically.
          </p>
          <Fld label="Pay to the order of">
            <input
              className={inputCls}
              value={chk.payee}
              data-testid="check-payee"
              placeholder="Vendor / payee name"
              onChange={(e) => setChk((c) => ({ ...c, payee: e.target.value }))}
            />
          </Fld>
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Amount ($)">
              <input
                className={inputCls}
                inputMode="decimal"
                value={chk.amount}
                data-testid="check-amount"
                placeholder="397.50"
                onChange={(e) => setChk((c) => ({ ...c, amount: e.target.value }))}
              />
            </Fld>
            <Fld label="Date">
              <input
                className={inputCls}
                value={chk.date}
                data-testid="check-date"
                placeholder="MM/DD/YYYY"
                onChange={(e) => setChk((c) => ({ ...c, date: e.target.value }))}
              />
            </Fld>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Check #">
              <input
                className={inputCls}
                inputMode="numeric"
                value={chk.checkNo}
                data-testid="check-number"
                onChange={(e) => setChk((c) => ({ ...c, checkNo: e.target.value }))}
              />
            </Fld>
            <Fld label="Memo (optional)">
              <input
                className={inputCls}
                value={chk.memo}
                data-testid="check-memo"
                placeholder="Invoice #"
                onChange={(e) => setChk((c) => ({ ...c, memo: e.target.value }))}
              />
            </Fld>
          </div>
          <button
            type="button"
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white w-full mt-1"
            data-testid="check-generate"
            onClick={() => {
              const amt = Number(chk.amount);
              if (!chk.payee.trim()) {
                showToast?.("Enter a payee for the check");
                return;
              }
              if (!Number.isFinite(amt) || amt <= 0) {
                showToast?.("Enter a valid check amount");
                return;
              }
              try {
                const blob = buildCheckPdfBlob({
                  payee: chk.payee.trim(),
                  amount: amt,
                  date: chk.date.trim(),
                  checkNo: chk.checkNo.trim() || String(BLZ_CHECK.startCheckNo),
                  memo: chk.memo.trim(),
                });
                const fname = `BLZ_Check_${(chk.checkNo || "").trim() || BLZ_CHECK.startCheckNo}.pdf`;
                openPdfForNativeView({ blob, filename: fname });
                showToast?.("Check PDF generated — signature included, ready to print");
              } catch (e) {
                showToast?.("Could not generate check: " + String(e?.message || e));
              }
            }}
          >
            Generate check PDF
          </button>
        </MenuSection>
      ) : null}


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
        <Fld label="Google Drive folder ID (agency applications copy)">
          <input
            className={inputCls}
            value={profile.gdriveFolderId || ""}
            onChange={(e) => setP("gdriveFolderId", e.target.value.trim())}
            placeholder="Optional — Drive folder id for completed applications"
            data-testid="settings-gdrive-folder"
          />
          <div className="text-[11px] text-slate-500 mt-1">
            {gdriveInfo === null
              ? "Optional. Completed applications always save to the in-app Con Edison Application tab; add a folder id to also copy them to your Google Drive."
              : gdriveInfo.configured
                ? `Drive connected (${gdriveInfo.mode === "sa" ? "service account" : "OAuth"}). ${
                    gdriveInfo.saEmail
                      ? `Share your folder with ${gdriveInfo.saEmail} (Editor) so uploads land.`
                      : ""
                  }`
                : "Drive credential not configured on the server yet — files still save to the in-app tab. Ask support to enable the Drive integration."}
          </div>
        </Fld>
        <div
          className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 mb-3"
          data-testid="settings-payment-methods"
        >
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">
            Payment methods (white-label)
          </div>
          <p className="text-[11px] text-slate-500 font-semibold mb-3 leading-relaxed">
            Turn on what customers can use. Enabled methods show on the secure pay page, invoice PDFs, and
            invoice emails. Card and ACH still use your payment processor; Zelle / Venmo / Cash App show the
            handles you set below.
          </p>
          <div className="space-y-2.5 mb-3">
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 cursor-pointer"
                data-testid={`settings-pay-method-${opt.key}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  checked={!!profile.paymentMethods?.[opt.key]}
                  onChange={(e) => setPayMethod(opt.key, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">{opt.label}</span>
                  <span className="block text-[11px] text-slate-500 font-semibold leading-snug">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {profile.paymentMethods?.zelle ? (
            <Fld label="Zelle handle (email or phone)">
              <input
                className={inputCls}
                value={profile.zelleHandle || ""}
                onChange={(e) => setP("zelleHandle", e.target.value)}
                placeholder={profile.email || "office@company.com"}
                data-testid="settings-zelle-handle"
              />
              <p className="text-[11px] text-slate-500 font-semibold mt-1">
                Empty = company email. Full invoice line below can still be customized.
              </p>
            </Fld>
          ) : null}
          {profile.paymentMethods?.venmo ? (
            <Fld label="Venmo username or phone">
              <input
                className={inputCls}
                value={profile.venmoHandle || ""}
                onChange={(e) => setP("venmoHandle", e.target.value)}
                placeholder="@yourbusiness"
                data-testid="settings-venmo-handle"
              />
            </Fld>
          ) : null}
          {profile.paymentMethods?.cashapp ? (
            <Fld label="Cash App $cashtag">
              <input
                className={inputCls}
                value={profile.cashAppHandle || ""}
                onChange={(e) => setP("cashAppHandle", e.target.value)}
                placeholder="$YourBusiness"
                data-testid="settings-cashapp-handle"
              />
            </Fld>
          ) : null}
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
            <p className="text-[11px] text-slate-500 font-semibold mt-1">
              Standard language points customers to the secure link to process a check photo (not email a
              picture of the check).
            </p>
          </Fld>
        </div>
        <Fld label="Letter signature">
          <select
            className={inputCls}
            value={profile.letterSignatureMode || "company"}
            onChange={(e) => setP("letterSignatureMode", e.target.value)}
            data-testid="settings-letter-signature-mode"
          >
            <option value="company">Company only (e.g. BLZ Electric — no name / President)</option>
            <option value="signer">Signer name + title (classic)</option>
          </select>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            Applies to load letters and other letterhead PDFs. Company mode uses the short name above.
          </p>
        </Fld>
        <Fld label="Source of truth for invoices">
          <select
            className={inputCls}
            value={profile.docSourceOfTruth || "lepro"}
            onChange={(e) => setP("docSourceOfTruth", e.target.value)}
            data-testid="settings-doc-source-of-truth"
          >
            <option value="lepro">LE Pro (recommended) — this app owns the books</option>
            <option value="qbo">QuickBooks — QBO owns the books</option>
          </select>
          <p className="text-[11px] text-slate-500 font-semibold mt-1">
            LE Pro mode keeps every invoice this app recorded, even if QuickBooks has not synced
            it — a sync gap can never hide or drop an invoice. QuickBooks sync stays on either way.
          </p>
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

      {/* ── Agent Access (internal tenants only) — toggle + fleet identity ── */}
      {internal ? (
      <MenuSection
        id="agent"
        title="Agent Access"
        summary={agentStatusLine}
        open={openMenu.agent}
        onToggle={() => toggleMenu("agent")}
        badge={
          agentState?.accessOn ? (
            <StatusPill
              ok
              label={
                agentState.paymentsOn
                  ? "ON · Pay"
                  : agentState.standing || agentState.timerMode === "manual"
                    ? "ON"
                    : formatRemaining(
                        Math.max(0, Number(agentState.autoOffAt || 0) - agentNow)
                      ) || "ON"
              }
            />
          ) : (
            <StatusPill ok={false} label="OFF" />
          )
        }
      >
        <p className="text-xs text-slate-500 font-semibold mb-3">
          Flip access on. Agents enter with the standing agent code on the lock screen.
          Turn access off and the code stops working immediately.
        </p>

        {agentState?.accessOn ? (
          <div
            className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2.5 mb-3 flex items-center justify-between gap-2"
            data-testid="agent-stop-strip"
          >
            <div className="text-sm font-extrabold text-red-900" data-testid="agent-status-line">
              {agentStatusLine}
            </div>
            <button
              type="button"
              disabled={agentBusy}
              onClick={stopAgent}
              className="shrink-0 rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
              data-testid="agent-stop-btn"
            >
              STOP
            </button>
          </div>
        ) : (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3 text-sm font-semibold text-slate-700"
            data-testid="agent-status-line"
          >
            {agentStatusLine}
          </div>
        )}

        <div
          className="flex items-center justify-between gap-3 py-2 border-b border-slate-100"
          data-testid="agent-access-row"
        >
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-800">Agent access</div>
            <div className="text-xs text-slate-500 font-semibold">
              When on, agents use the standing code below to open the app
            </div>
          </div>
          <Toggle
            on={!!agentState?.accessOn}
            onChange={(v) => toggleAgentAccess(v)}
            label="Agent access"
          />
        </div>

        {agentState?.accessOn ? (
          <div
            className="py-3 border-b border-slate-100 space-y-2"
            data-testid="agent-standing-code-row"
          >
            <div className="text-sm font-extrabold text-slate-800">Standing agent code</div>
            <div className="text-xs text-slate-500 font-semibold">
              Always works while access is ON. Stops the second you turn access off or rotate.
            </div>
            {agentStandingCode ? (
              <div className="flex flex-wrap items-center gap-2">
                <code
                  className="font-mono text-base font-extrabold tracking-wider text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"
                  data-testid="agent-standing-code"
                >
                  {agentStandingCode}
                </code>
                <button
                  type="button"
                  className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-extrabold"
                  onClick={copyAgentCode}
                  data-testid="agent-code-copy"
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={agentBusy}
                  className="rounded-lg bg-white border border-slate-300 text-slate-800 px-3 py-1.5 text-xs font-extrabold disabled:opacity-50"
                  onClick={rotateAgentCode}
                  data-testid="agent-code-rotate"
                >
                  Rotate
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={agentBusy}
                className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-sm font-extrabold disabled:opacity-50"
                onClick={revealAgentCode}
                data-testid="agent-code-reveal"
              >
                Show agent code
              </button>
            )}
          </div>
        ) : null}

        <div
          className="flex items-center justify-between gap-3 py-3 border-b border-slate-100"
          data-testid="agent-timer-row"
        >
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-800">Auto turn-off</div>
            <div className="text-xs text-slate-500 font-semibold">
              24-hour automatic off, or stay on until you stop it
            </div>
          </div>
          <select
            className={`${inputCls} w-auto min-w-[9rem]`}
            value={agentState?.timerMode === "24h" ? "24h" : "manual"}
            disabled={agentBusy}
            onChange={(e) => changeAgentTimer(e.target.value)}
            data-testid="agent-timer-select"
          >
            <option value="manual">Manual (until STOP)</option>
            <option value="24h">24-hour auto-off</option>
          </select>
        </div>

        <div className="py-3" data-testid="agent-payments-row">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-800">Payment management</div>
              <div className="text-xs text-slate-500 font-semibold">
                Off by default · agent may stage invoice payments only
              </div>
            </div>
            <Toggle
              on={!!agentState?.paymentsOn}
              onChange={(v) => toggleAgentPayments(v)}
              label="Payment management"
            />
          </div>
          {agentPayWarn ? (
            <div
              className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950"
              data-testid="agent-payments-warning"
            >
              <p className="mb-2">
                This lets the agent <strong>stage</strong> a customer invoice payment. Every actual
                charge still needs your explicit confirm in the app — never silent. Agent never sees
                card processor keys or your password.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={agentBusy}
                  onClick={() => toggleAgentPayments(true, { confirmed: true })}
                  className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-xs font-extrabold"
                  data-testid="agent-payments-confirm"
                >
                  Turn payment access on
                </button>
                <button
                  type="button"
                  onClick={() => setAgentPayWarn(false)}
                  className="rounded-lg bg-white border border-amber-300 text-amber-950 px-3 py-1.5 text-xs font-extrabold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {agentState?.paymentsOn ? (
            <p
              className="mt-2 text-[11px] font-semibold text-emerald-800"
              data-testid="agent-payments-chip"
            >
              Payments · stage only · per-charge confirm required
            </p>
          ) : null}
        </div>

        {agentAudit.length > 0 ? (
          <div className="mt-2">
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
        <p className="text-[11px] text-slate-400 mt-2 font-semibold" data-testid="settings-app-version">
          Version shows under Log off on the left (e.g. V348 · full parity build).
        </p>
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
