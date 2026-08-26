import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Message } from "@/domain/types";
import { Conversation, MessageView } from "./Conversation";

const agent: Agent = { id: "atlas", name: "Atlas", role: "Researcher", goal: "Find the signal", status: "idle", avatar: "A", lastActiveAt: new Date().toISOString(), unreadCount: 0, computerId: "computer-atlas" };

describe("Conversation states", () => {
  it("renders a system event without treating it as a user or agent reaction target", () => {
    const message: Message = { id: "system-1", conversationId: "conversation-atlas", role: "system", parts: [{ type: "text", text: "Cloud computer reconnected" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} onReact={async () => undefined} />);
    expect(screen.getByText("Cloud computer reconnected")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("system");
    expect(screen.queryByRole("button", { name: "Mark as useful" })).not.toBeInTheDocument();
  });

  it("shows a reconnect action only when the connection is unavailable", async () => {
    const reconnect = vi.fn(); const user = userEvent.setup();
    render(<Conversation agent={agent} messages={[]} activities={[]} connection="disconnected" onSend={async () => undefined} onReact={async () => undefined} onReconnect={reconnect} onToggleDetails={() => undefined} />);
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
