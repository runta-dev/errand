import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Message } from "@/domain/types";
import { Conversation, MessageView } from "./Conversation";

const agent: Agent = { id: "atlas", name: "Atlas", role: "Researcher", goal: "Find the signal", status: "idle", avatar: "A", lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: "computer-atlas" };

describe("Conversation states", () => {
  it("renders agent Markdown with Streamdown semantics", async () => {
    const message: Message = { id: "agent-markdown", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Hello **team**\n\n- Build\n- Test" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} />);
    expect(await screen.findByRole("list")).toHaveTextContent(/Build\s+Test/);
    expect(container.querySelector(".agent-markdown")).not.toHaveTextContent("**");
  });

  it("lets long Markdown tables expand without overlapping following content", async () => {
    const message: Message = { id: "agent-table", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "| Date | News |\n| --- | --- |\n| Aug 13, 2026 | A very long update that must wrap inside the table cell instead of escaping the table layout. |\n| Aug 5, 2026 | Another long update. |\n\nSources: [Runta Blog](https://runta.com/blog)\n\nWant me to dig deeper?" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} />);
    const table = await screen.findByRole("table");
    const wrapper = table.closest('[data-streamdown="table-wrapper"]');

    expect(wrapper).toBeInTheDocument();
    expect(wrapper).not.toContainElement(screen.getByText(/Sources:/).closest("p"));
    const tableViewport = container.querySelector<HTMLElement>('[data-streamdown="table-wrapper"] > div:last-child');
    expect(tableViewport).toBeInTheDocument();
    expect(tableViewport).not.toHaveAttribute("style");
    expect(screen.getByText("Want me to dig deeper?")).toBeInTheDocument();
  });

  it("renders normal links and opens them in the system browser", async () => {
    const openExternal = vi.fn(async () => undefined);
    window.runtaCrew = { openExternal } as unknown as typeof window.runtaCrew;
    const message: Message = { id: "agent-link", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Visit [runta.com](https://runta.com/docs)." }], createdAt: new Date().toISOString() };
    render(<MessageView message={message} activities={[]} />);
    const link = await screen.findByRole("link", { name: "runta.com" });
    expect(link).toHaveAttribute("href", "https://runta.com/docs");
    fireEvent.click(link);
    expect(openExternal).toHaveBeenCalledWith("https://runta.com/docs");
  });

  it("renders a system event", () => {
    const message: Message = { id: "system-1", conversationId: "conversation-atlas", role: "system", parts: [{ type: "text", text: "Cloud computer reconnected" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} />);
    expect(screen.getByText("Cloud computer reconnected")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("system");
  });

  it("does not repeat agent metadata in the empty conversation intro", () => {
    render(<Conversation agent={agent} messages={[]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Atlas", level: 2 })).toBeInTheDocument();
    expect(screen.queryByText("Find the signal")).not.toBeInTheDocument();
  });

  it("shows a skeleton instead of the empty conversation while history loads", () => {
    const { container } = render(<Conversation agent={agent} messages={[]} activities={[]} loading onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(screen.getByRole("status", { name: "Loading conversation history" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atlas", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Atlas" })).toBeInTheDocument();
    expect(container.querySelector(".skeleton-bubble")?.parentElement).toHaveClass("skeleton-user");
  });

  it("keeps a bottom safe area for late-rendering conversation content", () => {
    const message: Message = { id: "agent-late-layout", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "A long final response" }], createdAt: new Date().toISOString() };
    const { container } = render(<Conversation agent={agent} messages={[message]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);

    expect(container.querySelector(".message-content")).toBeInTheDocument();
    expect(container.querySelector(".message-content")?.parentElement).toHaveClass("message-scroll");
  });

  it("focuses the composer when a new-agent focus request arrives", () => {
    const { rerender } = render(<Conversation agent={agent} messages={[]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    const composer = screen.getByRole("textbox", { name: "Message Atlas" });
    expect(composer).not.toHaveFocus();
    rerender(<Conversation agent={agent} messages={[]} activities={[]} focusRequest={1} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(composer).toHaveFocus();
  });

  it("shows the animated agent avatar before the first token arrives", () => {
    const message: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Working" })).toBeInTheDocument();
    expect(container.querySelector(".streaming-caret")).not.toBeInTheDocument();
  });

  it("shows the latest progress message directly on the working row", () => {
    const message: Message = { id: "run-2:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Checking now" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[{ id: "tool:read", conversationId: message.conversationId, kind: "file", title: "Reading file", detail: "Read", status: "running", createdAt: new Date().toISOString() }]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Checking now" })).toBeInTheDocument();
    expect(screen.getByText("Checking now")).toHaveClass("agent-working-progress");
    expect(container.querySelector(".message-body")).not.toBeInTheDocument();
  });

  it("animates a user entry and the final agent response at their actual state transitions", () => {
    const animate = vi.fn(); const originalAnimate = HTMLElement.prototype.animate;
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    try {
      const user: Message = { id: "optimistic-user:1", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "Hello" }], createdAt: new Date().toISOString() };
      render(<MessageView message={user} activities={[]} entering />);
      expect(animate).toHaveBeenCalledTimes(1);

      const streaming: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
      const { rerender } = render(<MessageView message={streaming} activities={[]} />);
      rerender(<MessageView message={{ ...streaming, parts: [{ type: "text", text: "Done" }], streaming: false }} activities={[]} />);
      expect(animate).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: originalAnimate });
    }
  });
});
