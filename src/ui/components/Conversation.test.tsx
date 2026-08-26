import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    render(<Conversation agent={agent} messages={[]} activities={[]} loading onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(screen.getByRole("status", { name: "Loading conversation history" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atlas", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Atlas" })).not.toBeInTheDocument();
  });

  it("shows the animated agent avatar before the first token arrives", () => {
    const message: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Working" })).toBeInTheDocument();
    expect(container.querySelector(".streaming-caret")).not.toBeInTheDocument();
  });

  it("exposes the current tool label on the working row", () => {
    const message: Message = { id: "run-2:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Checking now" }], createdAt: new Date().toISOString(), streaming: true };
    render(<MessageView message={message} activities={[{ id: "tool:read", conversationId: message.conversationId, kind: "file", title: "Reading file", detail: "Read", status: "running", createdAt: new Date().toISOString() }]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Reading file" })).toBeInTheDocument();
    expect(screen.getByText("Reading file")).toHaveClass("agent-working-progress");
  });
});
