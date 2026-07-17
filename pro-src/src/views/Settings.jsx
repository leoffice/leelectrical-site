// Settings — company profile, feature toggles, connection health, agent access shell.
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
        hint="Time-boxed access codes for agents. Full secure grant ships after safety review."
      >
        <p className="text-sm font-semibold text-slate-600">
          Ready to wire: 30-minute signed codes, audit log, and instant revoke. Not live yet so nobody
          can bypass your lock by accident.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-extrabold text-slate-400 cursor-not-allowed"
        >
          Grant agent access (coming soon)
        </button>
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
