const keyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const statusEl = document.getElementById("status");

chrome.storage.local.get(["xaiApiKey", "xaiModel"], (data) => {
  if (data.xaiApiKey) keyEl.value = data.xaiApiKey;
  if (data.xaiModel) modelEl.value = data.xaiModel;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.local.set(
    { xaiApiKey: keyEl.value.trim(), xaiModel: modelEl.value.trim() || "grok-3-mini" },
    () => {
      statusEl.textContent = "Saved.";
      setTimeout(() => (statusEl.textContent = ""), 2000);
    }
  );
});