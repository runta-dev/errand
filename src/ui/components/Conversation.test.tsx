import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Agent, Message } from "@/domain/types";
import { Conversation, MessageView } from "./Conversation";

const agent: Agent = { id: "atlas", name: "Atlas", role: "Researcher", goal: "Find the signal", status: "idle", avatar: "A", lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: "computer-atlas" };

describe("Conversation states", () => {
  it("renders agent Markdown with Streamdown semantics", async () => {
    const message: Message = { id: "agent-markdown", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Hello **team**\n\n- Build\n- Test" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} onReact={async () => undefined} />);
    expect(await screen.findByRole("list")).toHaveTextContent(/Build\s+Test/);
    expect(container.querySelector(".agent-markdown")).not.toHaveTextContent("**");
  });

  it("renders a system event without treating it as a user or agent reaction target", () => {
    const message: Message = { id: "system-1", conversationId: "conversation-atlas", role: "system", parts: [{ type: "text", text: "Cloud computer reconnected" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} onReact={async () => undefined} />);
    expect(screen.getByText("Cloud computer reconnected")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("system");
    expect(screen.queryByRole("button", { name: "Mark as useful" })).not.toBeInTheDocument();
  });

  it("does not repeat agent metadata in the empty conversation intro", () => {
    render(<Conversation agent={agent} messages={[]} activities={[]} onSend={async () => undefined} onReact={async () => undefined} onToggleDetails={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Atlas", level: 2 })).toBeInTheDocument();
    expect(screen.queryByText("Find the signal")).not.toBeInTheDocument();
  });

  it("shows a streaming indicator before the first agent token arrives", () => {
    const message: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[]} onReact={async () => undefined} />);
    expect(container.querySelector(".streaming-caret")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as useful" })).not.toBeInTheDocument();
  });
});
