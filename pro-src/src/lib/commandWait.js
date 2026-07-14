/** Poll the command bus until a command with this idempotency key finishes. */
export async function waitForCommandDone(api, idempotencyKey, { maxMs = 120000, intervalMs = 2000 } = {}) {
  const idk = String(idempotencyKey || "").trim();
  if (!idk || !api?.listCommands) return { ok: false, cmd: null, timeout: true };
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    let cmds = [];
    try {
      cmds = await api.listCommands();
    } catch {
      cmds = [];
    }
    const cmd = (cmds || []).find((c) => String(c.idempotencyKey || "") === idk);
    if (cmd?.status === "done") return { ok: true, cmd };
    if (cmd?.status === "failed") return { ok: false, cmd };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, cmd: null, timeout: true };
}