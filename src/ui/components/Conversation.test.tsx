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

  it("keeps code copy controls inside the code block chrome", async () => {
    const message: Message = { id: "agent-code", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "```bash\necho hello\n```" }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} />);
    const copyButton = await screen.findByRole("button", { name: "Copy Code" });
    const codeBlock = container.querySelector<HTMLElement>('[data-streamdown="code-block"]');
    const actions = container.querySelector<HTMLElement>('[data-streamdown="code-block-actions"]');

    expect(codeBlock).toBeInTheDocument();
    expect(actions).toContainElement(copyButton);
    expect(codeBlock).toContainElement(actions);
    expect(codeBlock).toHaveTextContent("bash");
    expect(codeBlock).toHaveTextContent("echo hello");
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

  it("stops following when the user scrolls up and offers a return to latest", () => {
    const first: Message = { id: "agent-1", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "First response" }], createdAt: new Date().toISOString() };
    const second: Message = { ...first, id: "agent-2", parts: [{ type: "text", text: "New response" }] };
    const { container, rerender } = render(<Conversation agent={agent} messages={[first]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    const scroller = container.querySelector<HTMLElement>(".message-scroll");
    expect(scroller).toBeInTheDocument();
    Object.defineProperties(scroller!, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 }, scrollTop: { configurable: true, writable: true, value: 600 } });
    const scrollTo = vi.fn(); Object.defineProperty(scroller!, "scrollTo", { configurable: true, value: scrollTo });

    fireEvent.scroll(scroller!);
    fireEvent.wheel(scroller!, { deltaY: -120 });
    scroller!.scrollTop = 590; fireEvent.scroll(scroller!);
    expect(screen.queryByRole("button", { name: "Scroll to latest message" })).not.toBeInTheDocument();
    scroller!.scrollTop = 240; fireEvent.scroll(scroller!);
    const returnButton = screen.getByRole("button", { name: "Scroll to latest message" });
    expect(returnButton).toBeInTheDocument();

    scrollTo.mockClear();
    rerender(<Conversation agent={agent} messages={[first, second]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(returnButton);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(screen.queryByRole("button", { name: "Scroll to latest message" })).not.toBeInTheDocument();
  });

  it("detects upward scrollbar dragging while an automatic scroll is in progress", () => {
    const message: Message = { id: "agent-streaming", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Streaming" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<Conversation agent={agent} messages={[message]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    const scroller = container.querySelector<HTMLElement>(".message-scroll")!;
    Object.defineProperties(scroller, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 400 }, scrollTop: { configurable: true, writable: true, value: 600 } });
    fireEvent.scroll(scroller);
    scroller.scrollTop = 220; fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "Scroll to latest message" })).toBeInTheDocument();
  });

  it("focuses the composer when a new-agent focus request arrives", () => {
    const { rerender } = render(<Conversation agent={agent} messages={[]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    const composer = screen.getByRole("textbox", { name: "Message Atlas" });
    expect(composer).not.toHaveFocus();
    rerender(<Conversation agent={agent} messages={[]} activities={[]} focusRequest={1} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    expect(composer).toHaveFocus();
  });

  it("does not submit when Enter confirms an IME composition", () => {
    const onSend = vi.fn(async () => undefined);
    render(<Conversation agent={agent} messages={[]} activities={[]} onSend={onSend} onToggleDetails={() => undefined} />);
    const composer = screen.getByRole("textbox", { name: "Message Atlas" });
    fireEvent.change(composer, { target: { value: "你好" } });

    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer, { key: "Enter", keyCode: 229 });

    expect(onSend).not.toHaveBeenCalled();
    expect(composer).toHaveValue("你好");
  });

  it("submits with Enter after IME composition ends", () => {
    const onSend = vi.fn(async () => undefined);
    render(<Conversation agent={agent} messages={[]} activities={[]} onSend={onSend} onToggleDetails={() => undefined} />);
    const composer = screen.getByRole("textbox", { name: "Message Atlas" });
    fireEvent.change(composer, { target: { value: "你好" } });
    fireEvent.keyDown(composer, { key: "Enter", isComposing: false, keyCode: 13 });

    expect(onSend).toHaveBeenCalledWith("你好", []);
  });

  it("adds a pasted image to the composer", async () => {
    const addImage = vi.fn(async () => ({ id: "pasted-1", name: "pasted.png", size: 3, mediaType: "image/png" }));
    window.runtaCrew = { attachments: { choose: async () => [], addImage, read: async () => ({ name: "pasted.png", mediaType: "image/png", base64: "YWJj" }) } } as unknown as typeof window.runtaCrew;
    render(<Conversation agent={agent} messages={[]} activities={[]} onSend={async () => undefined} onToggleDetails={() => undefined} />);
    const composer = screen.getByRole("textbox", { name: "Message Atlas" });
    const image = new File([Uint8Array.from([97, 98, 99])], "pasted.png", { type: "image/png" });

    fireEvent.paste(composer, { clipboardData: { files: [], items: [{ kind: "file", type: "image/png", getAsFile: () => image }] } });

    expect(await screen.findByText("pasted.png")).toBeInTheDocument();
    expect(addImage).toHaveBeenCalledWith(expect.objectContaining({ name: "pasted.png", mediaType: "image/png", base64: "YWJj" }));
  });

  it("shows the animated agent avatar before the first token arrives", () => {
    const message: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Working" })).toBeInTheDocument();
    expect(container.querySelector(".streaming-caret")).not.toBeInTheDocument();
  });

  it("shows an interrupted marker when a newer user message supersedes active work", () => {
    const message: Message = { id: "interrupted", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: false, interrupted: true };
    render(<MessageView message={message} activities={[]} />);
    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByText(/Working for/)).not.toBeInTheDocument();
  });

  it("shows the latest progress message directly on the working row", () => {
    const message: Message = { id: "run-2:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "Checking now" }], createdAt: new Date().toISOString(), streaming: true };
    const { container } = render(<MessageView message={message} activities={[{ id: "tool:read", conversationId: message.conversationId, kind: "file", title: "Reading file", detail: "Read", status: "running", createdAt: new Date().toISOString() }]} />);
    expect(screen.getByRole("status", { name: "Agent is working: Checking now" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Agent is working: Checking now" })).toHaveTextContent("Working for");
    expect(screen.getByText("Reading file")).toBeInTheDocument();
    expect(container.querySelector(".message-body")).not.toBeInTheDocument();
  });

  it("keeps the latest completed work detail visible while the run continues", () => {
    const message: Message = { id: "run-3:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
    render(<MessageView message={message} activities={[
      { id: "tool:old", conversationId: message.conversationId, kind: "terminal", title: "Installing Chromium", detail: "Install", status: "completed", createdAt: new Date(0).toISOString() },
      { id: "tool:other", conversationId: "conversation-other", kind: "browser", title: "Browsing web", detail: "Browse", status: "running", createdAt: new Date(1).toISOString() },
    ]} />);

    expect(screen.getByRole("status", { name: "Agent is working: Installing Chromium" })).toBeInTheDocument();
    expect(screen.queryByText("Browsing web")).not.toBeInTheDocument();
  });

  it("shows elapsed working time and expandable tool details", () => {
    const message: Message = { id: "run-timer:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date(Date.now() - 65_000).toISOString(), streaming: true };
    render(<MessageView message={message} activities={[{ id: "tool:install", conversationId: message.conversationId, kind: "terminal", title: "apt-get install chromium", detail: "apt-get install chromium", output: "Chromium installed", status: "completed", createdAt: message.createdAt }]} />);

    expect(screen.getByText("Working for 1m 5s")).toBeInTheDocument();
    expect(screen.getByText("apt-get install chromium")).toBeInTheDocument();
    expect(screen.getByText("Chromium installed")).toBeInTheDocument();
    const summary = screen.getByRole("status", { name: "Agent is working: apt-get install chromium" });
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
  });

  it("opens a safe text attachment preview", async () => {
    window.runtaCrew = { attachments: { choose: async () => [], read: async () => ({ name: "report.txt", mediaType: "text/plain", base64: btoa("hello preview") }) } } as unknown as typeof window.runtaCrew;
    const message: Message = { id: "artifact-message", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "attachment", attachment: { id: "file-1", name: "report.txt", size: 13, mediaType: "text/plain", source: "local-selection" } }], createdAt: new Date().toISOString() };
    render(<MessageView message={message} activities={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /report.txt/i }));

    expect(await screen.findByRole("dialog", { name: "Preview report.txt" })).toHaveTextContent("hello preview");
  });

  it("renders user images above the text bubble", () => {
    window.runtaCrew = { attachments: { choose: async () => [], addImage: async () => ({ id: "unused", name: "unused.png", size: 3, mediaType: "image/png" }), read: async () => ({ name: "pasted.png", mediaType: "image/png", base64: "YWJj" }) } } as unknown as typeof window.runtaCrew;
    const message: Message = { id: "user-with-image", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "What is this?" }, { type: "attachment", attachment: { id: "image-1", name: "pasted.png", size: 3, mediaType: "image/png", source: "local-selection" } }], createdAt: new Date().toISOString() };
    const { container } = render(<MessageView message={message} activities={[]} />);
    const messageElement = container.querySelector(".message")!;

    expect(messageElement.children[0]).toHaveClass("message-attachments");
    expect(messageElement.children[1]).toHaveClass("message-body");
    expect(messageElement.children[1]).toHaveTextContent("What is this?");
  });

  it("animates a user entry with CSS and the final agent response at its state transition", () => {
    const animate = vi.fn(); const originalAnimate = HTMLElement.prototype.animate;
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    try {
      const user: Message = { id: "optimistic-user:1", conversationId: "conversation-atlas", role: "user", parts: [{ type: "text", text: "Hello" }], createdAt: new Date().toISOString() };
      const { container: userContainer } = render(<MessageView message={user} activities={[]} entering />);
      expect(userContainer.firstElementChild).toHaveClass("message-entering");
      expect(animate).not.toHaveBeenCalled();

      const streaming: Message = { id: "run-1:agent", conversationId: "conversation-atlas", role: "agent", parts: [{ type: "text", text: "" }], createdAt: new Date().toISOString(), streaming: true };
      const { rerender } = render(<MessageView message={streaming} activities={[]} />);
      rerender(<MessageView message={{ ...streaming, parts: [{ type: "text", text: "Done" }], streaming: false }} activities={[]} />);
      expect(animate).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: originalAnimate });
    }
  });
});
