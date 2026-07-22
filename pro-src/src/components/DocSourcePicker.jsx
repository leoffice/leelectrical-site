// Submenu — pick local LE Pro PDF/email or QuickBooks file.
// When QuickBooks is off in Settings, only local is offered (or auto-picked).
import React, { useEffect } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { docKindLabel, sourcePickerPrompt } from "../lib/docSource.js";
import { productName } from "../lib/tenantBranding.js";
import { useTenantConfig } from "../state/tenant.jsx";
import { isQuickbooksEnabled } from "../lib/qboEnabled.js";
import { useAppSettings } from "../lib/appSettings.js";

export default function DocSourcePicker({ title, prompt, kind, onPick, onBack }) {
  const config = useTenantConfig();
  const appSettings = useAppSettings();
  const qboOn = isQuickbooksEnabled(config);
  // re-read when feature flag flips (useAppSettings triggers re-render)
  void appSettings.quickbooks;
  const word = docKindLabel(kind);
  const product = productName(config);

  // Local-only tenants: skip the picker and go straight to local.
  useEffect(() => {
    if (!qboOn) onPick?.("local");
  }, [qboOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!qboOn) {
    return (
      <Sheet title={title} onClose={onBack}>
        <p className="text-sm text-slate-500 mb-3" data-testid="doc-source-local-only">
          QuickBooks is off — using the local {word} from this job.
        </p>
        <div className="text-sm text-slate-400 text-center py-2">Opening…</div>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onBack}>
      <p className="text-sm text-slate-500 mb-3">{prompt || sourcePickerPrompt()}</p>
      <Opt
        icon="📄"
        title={"Local " + word}
        note={`${product} PDF built from this job`}
        onClick={() => onPick("local")}
        data-testid="doc-source-local"
      />
      <Opt
        icon="📗"
        title={"QuickBooks " + word}
        note="Uses the file in QuickBooks Online"
        onClick={() => onPick("qbo")}
        data-testid="doc-source-qbo"
      />
    </Sheet>
  );
}