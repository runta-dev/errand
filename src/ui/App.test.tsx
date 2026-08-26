import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { AgentList } from "./components/AgentList";
import { LoginPage } from "./components/LoginPage";
import type { DesktopBridge } from "@/shared/desktop";

describe("Runta Crew authentication surfaces", () => {
  it("keeps account actions in the username popover", async () => {
    const opened: string[] = [];
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async (url) => { opened.push(url); },
      settings: { get: async () => ({ endpoint: "", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => true }, attachments: { choose: async () => [] },
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

  it("shows the standalone OAuth page when no credential exists", async () => {
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async () => undefined,
      settings: { get: async () => ({ endpoint: "https://api.forge", dashboardUrl: "https://app.forge", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => false }, attachments: { choose: async () => [] },
      notifications: { show: async () => true, setBadge: async () => undefined },
      deepLinks: { onOpenAgent: () => () => undefined },
    };
    window.runtaCrew = bridge;
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Runta Crew", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Runta account" })).not.toBeInTheDocument();
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
