// Settings — company profile, feature toggles, connection health, agent access.
import React, { useCallback, useEffect, useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  DEFAULT_FEATURES,
  DEFAULT_PROFILE,
  FEATURE_LABELS,
  mergeFeatures,
  mergeProfile,
} from "../lib/tenantProfile.js";
import { probeConnections } from "../lib/connectionHealth.js";
import { logOff } from "../lib/lock.js";
import {
  clearCompanyLogo,
  getCompanyLogoSrc,
  readLogoFileAsDataUrl,
  setCompanyLogoDataUrl,
  setSpeechToTextEnabled,
} from "../lib/appSettings.js";
import {
  fetchAgentAccessStatus,
  formatRemaining,
  mintAgentAccess,
  revokeAgentAccess,
} from "../lib/agentAccessClient.js";
import Toggle from "../components/Toggle.jsx";

function Section({ title, children, hint }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
      <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">{title}</h2>
      {hint ? <p className="text-xs text-slate-500 font-semibold mt-1 mb-3">{hint}</p> : <div className="h-3" />}
      {children}
    </section>
  );
}

function Fld({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-brand focus:bg-white";

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

export default function Settings() {
  const { showToast, pullCalendarNow, getSettings, saveSettings } = useStore();
  const [profile, setProfile] = useState(() => mergeProfile(DEFAULT_PROFILE));
  const [features, setFeatures] = useState(() => mergeFeatures(DEFAULT_FEATURES));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [agentGrant, setAgentGrant] = useState(null);
  const [agentAudit, setAgentAudit] = useState([]);
  const [agentCodeShown, setAgentCodeShown] = useState("");
  const [agentTtlMin, setAgentTtlMin] = useState(30);
  const [agentScope, setAgentScope] = useState("full");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentNow, setAgentNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof getSettings === "function") {
        const doc = await getSettings();
        const p = mergeProfile(doc?.profile);
        const f = mergeFeatures(doc?.features);
        setProfile(p);
        setFeatures(f);
        // Mirror logo + speech to this device so sidebar / voice bubble update live.
        if (p.logoDataUrl) setCompanyLogoDataUrl(p.logoDataUrl);
        else clearCompanyLogo();
        setSpeechToTextEnabled(f.speechToText !== false);
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

  useEffect(() => {
    const id = setInterval(() => setAgentNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

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
    setProfile((p) => ({ ...p, [key]: val }));
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
    setFeatures((f) => ({ ...f, [key]: on }));
    if (key === "speechToText") setSpeechToTextEnabled(!!on);
    setDirty(true);
  };

  const onLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const dataUrl = await readLogoFileAsDataUrl(file);
      setP("logoDataUrl", dataUrl);
      setCompanyLogoDataUrl(dataUrl);
      showToast?.("Logo ready — tap Save");
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
      setSpeechToTextEnabled(features.speechToText !== false);
      setDirty(false);
      showToast?.("Settings saved");
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

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-5 pb-28">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Company profile, connections, and what shows in the app.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
            dirty && !saving
              ? "bg-brand text-white shadow-sm"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <Section
        title="Connections"
        hint="Live checks — calendar sync, email send path, and card entry."
      >
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
          Payment links (send-to-customer) use the host link builder. Card typing in the app needs the
          server card key. Email needs the send key on the server.
        </p>
      </Section>

      <Section title="Company profile" hint="Used on invoices, estimates, statements, and letterhead.">
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
      </Section>

      <Section
        title="Speech to text"
        hint="Green voice bubble and chat mic. Also toggle from the chat bubble header."
      >
        <div
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
          data-testid="settings-speech-to-text"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">Speech to text</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              On = voice bubble + chat mic. Off = both hidden.
            </div>
          </div>
          <Toggle
            on={features.speechToText !== false}
            onChange={(on) => setF("speechToText", on)}
            label="Speech to text"
          />
        </div>
      </Section>

      <Section title="Features" hint="Turn sections on or off for this company.">
        <div className="space-y-2">
          {FEATURE_LABELS.filter((x) => x.key !== "speechToText").map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <span className="text-sm font-semibold text-slate-800">{label}</span>
              <input
                type="checkbox"
                checked={features[key] !== false}
                onChange={(e) => setF(key, e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Agent access"
        hint="Time-boxed one-time codes so an agent can unlock the app and test — you control when and for how long."
      >
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
                Agent is in · {formatRemaining(Math.max(0, (agentGrant.sessionExpiresAt || agentGrant.expiresAt) - agentNow))} left
              </span>
            ) : agentGrant.used ? (
              <span>Code used · session ended or expired</span>
            ) : (
              <span data-testid="agent-grant-waiting">
                Code waiting · {formatRemaining(Math.max(0, (agentGrant.expiresAt || 0) - agentNow))} left
              </span>
            )}
          </div>
        ) : null}

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
            onClick={revokeAgent}
            className="rounded-xl bg-slate-100 text-slate-800 px-4 py-2.5 text-sm font-extrabold disabled:opacity-40"
            data-testid="agent-revoke-btn"
          >
            Revoke now
          </button>
          <button
            type="button"
            disabled={agentBusy}
            onClick={loadAgentAccess}
            className="rounded-xl bg-white border border-slate-200 text-slate-700 px-4 py-2.5 text-sm font-extrabold disabled:opacity-50"
          >
            Refresh
          </button>
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
      </Section>

      <Section title="Account">
        <button
          type="button"
          onClick={() => logOff()}
          className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-extrabold"
        >
          Log off
        </button>
      </Section>
    </div>
  );
}
