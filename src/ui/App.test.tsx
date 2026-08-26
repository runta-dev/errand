import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { DesktopBridge } from "@/shared/desktop";

describe("Runta Crew primary flows", () => {
  it("switches agents and handles a scoped approval", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: /Mira Needs approval$/ }));
    await screen.findByText("Submit vendor renewal");
    await user.type(screen.getByLabelText("Approval note"), "Approved for this form only");
    await user.click(screen.getByRole("button", { name: "Allow once" }));
    await waitFor(() => expect(screen.queryByText("Submit vendor renewal")).not.toBeInTheDocument());
  });

  it("creates an agent and sends a message", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: "New agent" }));
    await user.type(screen.getByLabelText("Name"), "Scout"); await user.type(screen.getByLabelText("Role"), "Research lead"); await user.type(screen.getByLabelText("Initial goal"), "Track customer feedback");
    await user.click(screen.getByRole("button", { name: "Create agent" }));
    await screen.findByRole("heading", { name: "Scout", level: 1 });
    const send = screen.getByLabelText("Send message"); expect(send).toBeDisabled();
    expect([...send.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual(["m5 12 7-7 7 7", "M12 19V5"]);
    await user.type(screen.getByLabelText("Message Scout"), "Start with this week's interviews"); expect(send).toBeEnabled(); await user.click(send);
    expect(await screen.findByText("Start with this week's interviews")).toBeInTheDocument();
  });

  it("labels the computer surface as a safe mock", async () => {
    render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Open agent computer" }));
    expect(screen.getByText("Safe mock preview")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Take over" }));
    await waitFor(() => expect(document.querySelector(".detail-panel")).toHaveAttribute("data-computer-action", "takeover"));
    await waitFor(() => expect(document.querySelector(".computer-overlay")?.textContent).toContain("No remote desktop session is connected yet."));
  });

  it("opens the command palette from the native shortcut and switches agents", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search commands and agents"), "Patch");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Patch", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("selects a local attachment through the typed desktop bridge and sends it", async () => {
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async () => undefined,
      settings: { get: async () => ({ endpoint: "", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => true },
      attachments: { choose: async () => [{ id: "selected-1", name: "brief.pdf", size: 4200, mediaType: "application/pdf" }] },
      notifications: { show: async () => true, setBadge: async () => undefined },
      deepLinks: { onOpenAgent: () => () => undefined },
    };
    window.runtaCrew = bridge;
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    expect(await screen.findByText("brief.pdf")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message Atlas"), "Please review this brief");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Please review this brief")).toBeInTheDocument();
    expect(screen.getByText("4.1 KB · application/pdf")).toBeInTheDocument();
    delete window.runtaCrew;
  });

  it("opens a validated agent deep link through the typed desktop bridge", async () => {
    let listener: ((agentId: string) => void) | undefined;
    const bridge: DesktopBridge = {
      getVersion: async () => "0.1.0", openExternal: async () => undefined,
      settings: { get: async () => ({ endpoint: "", theme: "light", notifications: true }), set: async (settings) => settings },
      credentials: { has: async () => false, set: async () => true }, attachments: { choose: async () => [] },
      notifications: { show: async () => true, setBadge: async () => undefined },
      deepLinks: { onOpenAgent: (next) => { listener = next; return () => { listener = undefined; }; } },
    };
    window.runtaCrew = bridge; render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await act(() => listener?.("patch"));
    expect(await screen.findByRole("heading", { name: "Patch", level: 1 })).toBeInTheDocument(); delete window.runtaCrew;
  });

  it("records useful feedback on an agent message", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await screen.findByText(/I’m grouping the feedback/);
    const reaction = screen.getByRole("button", { name: "Mark as useful" });
    expect(reaction).toHaveAttribute("aria-pressed", "false"); await user.click(reaction);
    await waitFor(() => expect(reaction).toHaveAttribute("aria-pressed", "true"));
    expect(reaction).toHaveTextContent("1");
  });

  it("edits and marks an agent read from scoped row actions", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: "More actions for Atlas" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark as read" }));
    await user.click(screen.getByRole("button", { name: "More actions for Atlas" }));
    expect(await screen.findByRole("menuitem", { name: "Mark as unread" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Edit agent" }));
    const name = screen.getByLabelText("Name"); await user.clear(name); await user.type(name, "Atlas Prime");
    await user.click(screen.getByRole("button", { name: "Save agent" }));
    expect(await screen.findByRole("heading", { name: "Atlas Prime", level: 1 })).toBeInTheDocument();
  });

  it("duplicates and safely deletes an agent", async () => {
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: "More actions for Patch" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(await screen.findByRole("heading", { name: "Patch copy", level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions for Patch copy" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete agent" }));
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "More actions for Patch copy" })).not.toBeInTheDocument());
  });

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
    const user = userEvent.setup(); render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });

    const account = screen.getByRole("button", { name: "Runta account" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(account);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([" Settings", " Join Discord", " Logout"]);

    await user.click(screen.getByRole("menuitem", { name: "Join Discord" }));
    expect(opened).toEqual(["https://discord.com/invite/62d4bkaTnS"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(account);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    delete window.runtaCrew;
  });
});
