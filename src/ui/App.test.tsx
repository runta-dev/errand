import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Runta Crew primary flows", () => {
  it("switches agents and handles a scoped approval", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Atlas", level: 1 });
    await user.click(screen.getByRole("button", { name: /Mira/ }));
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
    await user.type(screen.getByLabelText("Message Scout"), "Start with this week's interviews"); await user.click(screen.getByLabelText("Send message"));
    expect(await screen.findByText("Start with this week's interviews")).toBeInTheDocument();
  });

  it("labels the computer surface as a safe mock", async () => {
    render(<App />); await screen.findByRole("heading", { name: "Atlas", level: 1 });
    expect(screen.getByText("Safe mock preview")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Take over" }));
    expect(document.querySelector(".detail-panel")).toHaveAttribute("data-computer-action", "takeover");
    await waitFor(() => expect(document.querySelector(".computer-overlay")?.textContent).toContain("No remote desktop session is connected yet."));
  });
});
