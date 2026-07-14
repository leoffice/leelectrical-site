/* global VoiceFlow, createSilentRecognizer */
(function () {
  if (document.getElementById("le-voice-flow-root")) return;

  const root = document.createElement("div");
  root.id = "le-voice-flow-root";
  document.body.appendChild(root);

  let phase = "idle";
  let preview = "";
  let recognizer = null;
  let insertTarget = null;

  function holdFocus(e) {
    e.preventDefault();
  }

  function render() {
    root.innerHTML = "";
    if (phase === "review") {
      const panel = document.createElement("div");
      panel.className = "le-vf-panel";
      panel.onpointerdown = holdFocus;
      const ta = document.createElement("textarea");
      ta.value = preview;
      ta.oninput = () => (preview = ta.value);
      panel.appendChild(ta);
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.justifyContent = "flex-end";
      row.style.marginTop = "8px";
      ["Cancel", "Copy", "Insert"].forEach((label) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.onpointerdown = holdFocus;
        b.onclick = () => {
          if (label === "Cancel") {
            phase = "idle";
            preview = "";
            render();
          } else if (label === "Copy") {
            navigator.clipboard.writeText(preview);
          } else {
            VoiceFlow.insertTextAtFocus(preview, insertTarget);
            phase = "idle";
            preview = "";
            render();
          }
        };
        row.appendChild(b);
      });
      panel.appendChild(row);
      root.appendChild(panel);
    }
    const btn = document.createElement("button");
    btn.className = "le-vf-btn";
    btn.textContent = phase === "listening" ? "✓" : "🎤";
    btn.onpointerdown = holdFocus;
    btn.onclick = () => {
      if (phase === "listening") {
        const raw = recognizer?.stop() || "";
        recognizer = null;
        preview = VoiceFlow.polishVoiceText(raw);
        phase = preview ? "review" : "idle";
        render();
      } else if (phase === "idle") {
        insertTarget = VoiceFlow.getLastTextTarget();
        phase = "listening";
        recognizer = createSilentRecognizer({ lang: "en-US" });
        render();
      }
    };
    root.appendChild(btn);
  }

  VoiceFlow.trackVoiceFocus();
  render();
})();