import assert from "node:assert/strict";

const endpoint = (process.env.RUNTA_CREW_E2E_ENDPOINT || "https://api.forge").replace(/\/+$/, "");
const token = process.env.RUNTA_CREW_E2E_TOKEN;
if (!token) throw new Error("RUNTA_CREW_E2E_TOKEN is required");

async function request(path, init = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const providers = await request("/v2/model-providers");
assert.equal(typeof providers.organization_id, "string", "user-authorized device token must expose an organization");
const provider = providers.model_providers?.[0];
assert.equal(typeof provider?.id, "string", "an E2E model provider is required");

const suffix = Date.now().toString(36);
let agent;
try {
  agent = await request("/v2/agents", {
    method: "POST",
    body: JSON.stringify({ name: `runta-crew-e2e-${suffix}`, model_provider: { type: "managed", id: provider.id } }),
  });
  assert.equal(typeof agent.id, "string");

  const run = await request(`/v2/agents/${encodeURIComponent(agent.id)}/runs`, {
    method: "POST",
    body: JSON.stringify({ prompt: "Reply with RUNTA_CREW_E2E_OK." }),
  });
  assert.equal(typeof run.id, "string");

  const deadline = Date.now() + 180_000;
  let completed;
  while (Date.now() < deadline) {
    completed = await request(`/v2/agents/${encodeURIComponent(agent.id)}/runs/${encodeURIComponent(run.id)}`);
    if (["finished", "failed", "cancelled"].includes(completed.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.equal(completed?.status, "finished", `run did not finish: ${completed?.status ?? "timeout"}`);
  assert.match(completed.result || "", /RUNTA_CREW_E2E_OK/);
  console.log(`Runta Crew E2E passed for agent ${agent.id}`);
} finally {
  if (agent?.id) await request(`/v2/agents/${encodeURIComponent(agent.id)}?delete_runtime=true`, { method: "DELETE" });
}
