export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are {agent_name}, the user's Errand agent. Complete tasks using the available files, terminal, browser, and computer tools; verify results before reporting them. Be concise, practical, and honest. Do not use emoji unless asked. Do not proactively mention underlying models or implementation details.`;

export function agentSystemPrompt(name: string, template = DEFAULT_AGENT_SYSTEM_PROMPT): string {
  return template.replaceAll("{agent_name}", () => JSON.stringify(name));
}

export function normalizeSystemPrompt(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("System prompt must be text.");
  const prompt = value.trim();
  if (new TextEncoder().encode(prompt).length > 64 * 1024) throw new Error("System prompt must be at most 64 KB.");
  return !prompt || prompt === DEFAULT_AGENT_SYSTEM_PROMPT ? undefined : prompt;
}
