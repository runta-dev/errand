import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentsLanding, App } from "./App";
import { accountDisplayName } from "./accountDisplayName";
import { nextAgentName } from "@/domain/agentName";
import { AgentList } from "./components/AgentList";
import { LoginPage } from "./components/LoginPage";
import { SettingsDialog } from "./components/Dialogs";
import type { AppSettings, DesktopBridge } from "@/shared/desktop";

describe("Runta Crew authentication surfaces", () => {
  it("opens the dashboard add-provider page when no providers exist", async () => {
    const openExternal = vi.fn(async () => undefined); const user = userEvent.setup();
    window.runtaCrew = {
      openExternal,
      settings: { get: async () => ({ endpoint: "https://api.forge", dashboardUrl: "https://app.forge", theme: "light", notifications: true }), set: async (settings: AppSettings) => settings },
    } as unknown as DesktopBridge;
    render(<SettingsDialog organizationId="org-a/b" providers={[]} onClose={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Add model provider" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(openExternal).toHaveBeenCalledWith("https://app.forge/org/org-a%2Fb/secrets/providers/new");
    delete window.runtaCrew;
  });

  it("notifies when the model-provider picker opens", async () => {
    const onModelProviderOpen = vi.fn(); const user = userEvent.setup();
    window.runtaCrew = {
      settings: { get: async () => ({ endpoint: "https://api.forge", dashboardUrl: "https://app.forge", theme: "light", notifications: true }), set: async (settings: AppSettings) => settings },
    } as unknown as DesktopBridge;
    render(<SettingsDialog providers={[]} onModelProviderOpen={onModelProviderOpen} onClose={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Add model provider" }));
    expect(onModelProviderOpen).toHaveBeenCalledOnce();
    delete window.runtaCrew;
  });

  it("adapts the landing copy to whether agents exist", () => {
    const { rerender } = render(<AgentsLanding hasAgents={false} />);
    expect(screen.getByText("Create your first agent to get started.")).toBeInTheDocument();
    rerender(<AgentsLanding hasAgents />);
    expect(screen.getByText("Choose an agent to get started.")).toBeInTheDocument();
  });
  it("assigns unique single names before deterministic word pairs", () => {
    const used: string[] = [];
    for (let index = 0; index < 18; index += 1) { const name = nextAgentName(used); expect(used.map((value) => value.toLowerCase())).not.toContain(name.toLowerCase()); used.push(name); }
    expect(used.slice(0, 3)).toEqual(["Atlas", "Scout", "Mira"]);
    expect(used[16]).toBe("Amber Brook");
    expect(used[17]).toBe("Amber Cedar");
    expect(nextAgentName(["atlas"])).toBe("Scout");
  });
  it("derives a human account name from the authorized profile", () => {
    expect(accountDisplayName({ email: "shiqi@runta.com" })).toBe("Shiqi");
    expect(accountDisplayName({ email: "shiqi.mei@runta.com" })).toBe("Shiqi Mei");
    expect(accountDisplayName({ email: "xydd@runta.com" })).toBe("Xydd");
    expect(accountDisplayName({ display_name: "  Shiqi Mei  ", email: "ignored@runta.com" })).toBe("Shiqi Mei");
  });
  it("keeps account actions in the username popover", async () => {
    const opened: string[] = [];
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async (url) => { opened.push(url); },
      settings: { get: async () => ({ endpoint: "", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => true }, attachments: { choose: async () => [], addImage: async (image) => ({ id: "image", name: image.name, size: 0, mediaType: image.mediaType }), read: async () => ({ name: "test.txt", mediaType: "text/plain", base64: "" }) },
      notifications: { show: async () => true, setBadge: async () => undefined },
      deepLinks: { onOpenAgent: () => () => undefined },
    };
    window.runtaCrew = bridge;
    const user = userEvent.setup();
    render(<AgentList agents={[]} selectedId="" search="" signedIn userName="Shiqi Mei" onSearch={() => undefined} onSelect={() => undefined} onAction={() => undefined} onCreate={() => undefined} onSettings={() => undefined} onSignIn={() => undefined} onLogout={() => undefined} />);

    const account = screen.getByRole("button", { name: "Shiqi Mei" });
    await user.click(account);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([" Settings", " Join Discord", " Logout"]);
    await user.click(screen.getByRole("menuitem", { name: "Join Discord" }));
    expect(opened).toEqual(["https://discord.com/invite/62d4bkaTnS"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    delete window.runtaCrew;
  });

  it("shows immediate feedback while an agent is being created", () => {
    const { rerender } = render(<AgentList agents={[]} selectedId="" search="" creatingAgentName="Atlas" signedIn userName="Shiqi Mei" onSearch={() => undefined} onSelect={() => undefined} onAction={() => undefined} onCreate={() => undefined} onSettings={() => undefined} onSignIn={() => undefined} onLogout={() => undefined} />);
    expect(screen.getByRole("status", { name: "Atlas is being created" })).toHaveTextContent("AtlasCreating…");
    expect(screen.getByRole("button", { name: "New agent" })).toBeDisabled();
    rerender(<AgentList agents={[]} selectedId="" search="" creatingAgentName="Atlas" creatingAgentPhase="typing" signedIn userName="Shiqi Mei" onSearch={() => undefined} onSelect={() => undefined} onAction={() => undefined} onCreate={() => undefined} onSettings={() => undefined} onSignIn={() => undefined} onLogout={() => undefined} />);
    expect(screen.getByRole("status", { name: "Atlas is typing" })).toBeInTheDocument();
  });

  it("does not duplicate a creating row when polling sees the new server agent first", () => {
    const existing = { id: "existing", name: "Scout", role: "Cloud coding agent", goal: "Scout", status: "idle" as const, avatar: "S", lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: "existing" };
    const created = { ...existing, id: "created", status: "working" as const, computerId: "created" };
    const props = { selectedId: "", search: "", signedIn: true, userName: "Shiqi Mei", onSearch: () => undefined, onSelect: () => undefined, onAction: () => undefined, onCreate: () => undefined, onSettings: () => undefined, onSignIn: () => undefined, onLogout: () => undefined };
    const { rerender } = render(<AgentList {...props} agents={[existing, created]} creatingAgentName="Scout" creatingAgentBaselineIds={new Set([existing.id])} />);

    expect(screen.getAllByText("Scout")).toHaveLength(2);
    expect(screen.getByText("Creating…")).toBeInTheDocument();

    rerender(<AgentList {...props} agents={[existing, created]} />);
    expect(screen.getAllByText("Scout")).toHaveLength(2);
    expect(screen.queryByText("Creating…")).not.toBeInTheDocument();
  });

  it("distinguishes an empty crew from an empty search result", () => {
    const props = { agents: [], selectedId: "", signedIn: true, userName: "Shiqi Mei", onSearch: () => undefined, onSelect: () => undefined, onAction: () => undefined, onCreate: () => undefined, onSettings: () => undefined, onSignIn: () => undefined, onLogout: () => undefined };
    const { rerender } = render(<AgentList {...props} search="" />);
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    rerender(<AgentList {...props} search="missing" />);
    expect(screen.getByText("No agents found")).toBeInTheDocument();
  });

  it("shows only Agent actions backed by the Cloud Agents API", async () => {
    const user = userEvent.setup(); const atlas = { id: "atlas", name: "Atlas", role: "Cloud coding agent", goal: "Atlas", status: "idle" as const, avatar: "A", lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: "atlas" };
    render(<AgentList agents={[atlas]} selectedId="atlas" search="" signedIn userName="Shiqi Mei" onSearch={() => undefined} onSelect={() => undefined} onAction={() => undefined} onCreate={() => undefined} onSettings={() => undefined} onSignIn={() => undefined} onLogout={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "More actions for Atlas" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([" Edit agent", " Delete agent"]);
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByText("Mark as unread")).not.toBeInTheDocument();
  });

  it("shows the standalone OAuth page when no credential exists", async () => {
    const cloudRequest = vi.fn();
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async () => undefined,
      settings: { get: async () => ({ endpoint: "https://api.runta.com", dashboardUrl: "https://dashboard.runta.com", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => false }, attachments: { choose: async () => [], addImage: async (image) => ({ id: "image", name: image.name, size: 0, mediaType: image.mediaType }), read: async () => ({ name: "test.txt", mediaType: "text/plain", base64: "" }) },
      cloud: { request: cloudRequest, subscribe: () => () => undefined },
      notifications: { show: async () => true, setBadge: async () => undefined },
      deepLinks: { onOpenAgent: () => () => undefined },
    };
    window.runtaCrew = bridge;
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Runta Crew", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Runta account" })).not.toBeInTheDocument();
    expect(cloudRequest).not.toHaveBeenCalled();
    delete window.runtaCrew;
  });

  it("does not expose Electron IPC errors on sign-in failure", async () => {
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async () => undefined,
      settings: { get: async () => ({ endpoint: "https://api.runta.com", dashboardUrl: "https://dashboard.runta.com", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => false },
      auth: { start: async () => { throw new Error("Error invoking remote method 'auth:start': Error: Device authorization failed (401)"); }, status: async () => "error", logout: async () => true },
      attachments: { choose: async () => [], addImage: async (image) => ({ id: "image", name: image.name, size: 0, mediaType: image.mediaType }), read: async () => ({ name: "test.txt", mediaType: "text/plain", base64: "" }) }, notifications: { show: async () => true, setBadge: async () => undefined }, deepLinks: { onOpenAgent: () => () => undefined },
    };
    window.runtaCrew = bridge;
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("This Runta environment does not support Crew sign-in yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument();
    delete window.runtaCrew;
  });

  it("keeps connection configuration behind the development gesture", () => {
    render(<LoginPage status="idle" allowConnectionSettings onSignIn={() => undefined} onSettings={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Connection settings" })).not.toBeInTheDocument();
    for (let press = 0; press < 5; press += 1) fireEvent.keyDown(window, { key: "Control" });
    expect(screen.getByRole("button", { name: "Connection settings" })).toBeInTheDocument();
  });

  it("never exposes connection configuration in production mode", () => {
    render(<LoginPage status="idle" allowConnectionSettings={false} onSignIn={() => undefined} onSettings={() => undefined} />);
    for (let press = 0; press < 5; press += 1) fireEvent.keyDown(window, { key: "Control" });
    expect(screen.queryByRole("button", { name: "Connection settings" })).not.toBeInTheDocument();
  });
});
