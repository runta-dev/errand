import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_AGENT_SYSTEM_PROMPT } from "@/domain/agentPrompt";
import type { AppSettings, DesktopBridge } from "@/shared/desktop";
import { SettingsDialog } from "./Dialogs";

afterEach(() => { delete window.runtaCrew; });

it("saves a custom prompt, reads it back on reopen, and restores the default", async () => {
  let stored: AppSettings = { endpoint: "https://api.runta.com", theme: "light", notifications: true, modelProviderId: "provider-1" };
  const set = vi.fn(async (next: AppSettings) => { stored = next; return stored; });
  window.runtaCrew = { settings: { get: async () => stored, set } } as unknown as DesktopBridge;
  const user = userEvent.setup();
  const first = render(<SettingsDialog onClose={() => undefined} />);
  await waitFor(() => expect(screen.getByLabelText("System prompt")).toHaveValue(DEFAULT_AGENT_SYSTEM_PROMPT));
  fireEvent.change(screen.getByLabelText("System prompt"), { target: { value: "You are {agent_name}. Answer in Chinese." } });
  expect(set).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  expect(stored).toMatchObject({ modelProviderId: "provider-1", systemPrompt: "You are {agent_name}. Answer in Chinese." });
  first.unmount();
  render(<SettingsDialog onClose={() => undefined} />);
  await waitFor(() => expect(screen.getByLabelText("System prompt")).toHaveValue(stored.systemPrompt));
  await user.click(screen.getByRole("button", { name: "Restore default" }));
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  expect(stored.systemPrompt).toBeUndefined();
});

it("keeps unsaved text and reports a settings write failure", async () => {
  window.runtaCrew = { settings: { get: async () => ({ endpoint: "https://api.runta.com", theme: "light", notifications: true }), set: async () => { throw new Error("Disk is full"); } } } as unknown as DesktopBridge;
  const user = userEvent.setup();
  render(<SettingsDialog onClose={() => undefined} />);
  await user.click(screen.getByLabelText("System prompt"));
  fireEvent.change(screen.getByLabelText("System prompt"), { target: { value: "Custom instructions" } });
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Disk is full");
  expect(screen.getByLabelText("System prompt")).toHaveValue("Custom instructions");
});

it("opens provider creation from a populated picker without changing the selected provider", async () => {
  const stored: AppSettings = { endpoint: "https://api.runta.com", dashboardUrl: "https://dashboard.runta.com", theme: "light", notifications: true, modelProviderId: "existing" };
  const set = vi.fn(async (next: AppSettings) => next);
  const openExternal = vi.fn(async () => undefined); const onModelProviderOpen = vi.fn();
  window.runtaCrew = { settings: { get: async () => stored, set }, openExternal } as unknown as DesktopBridge;
  const user = userEvent.setup();
  render(<SettingsDialog organizationId="org-a/b" providers={[{ id: "existing", name: "OpenAI API", protocol: "openai_responses" }]} onModelProviderOpen={onModelProviderOpen} onClose={() => undefined} />);
  await user.click(screen.getByRole("button", { name: "Model provider" }));
  await user.click(screen.getByRole("option", { name: "Add model provider" }));
  expect(openExternal).toHaveBeenCalledWith("https://dashboard.runta.com/org/org-a%2Fb/secrets/providers/new");
  expect(onModelProviderOpen).toHaveBeenCalledOnce();
  expect(set).not.toHaveBeenCalled();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
