import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("renders the selected label and chooses an option", async () => {
    const onChange = vi.fn(); const user = userEvent.setup();
    render(<Select ariaLabel="Theme" value="system" options={[{ value: "system", label: "Follow System" }, { value: "light", label: "Light" }]} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Theme" });
    expect(trigger).toHaveTextContent("Follow System");
    await user.click(trigger); await user.click(screen.getByRole("option", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("supports arrow-key selection and escape", async () => {
    const onChange = vi.fn(); const user = userEvent.setup();
    render(<Select ariaLabel="Theme" value="system" options={[{ value: "system", label: "Follow System" }, { value: "light", label: "Light" }]} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Theme" });
    trigger.focus(); await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledWith("light"); expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}"); expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("runs an action option without changing the value", async () => {
    const onChange = vi.fn(); const action = vi.fn(); const user = userEvent.setup();
    render(<Select ariaLabel="Model provider" value="" options={[{ value: "add", label: "Add model provider", action }]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Model provider" }));
    await user.click(screen.getByRole("option", { name: "Add model provider" }));
    expect(action).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
  });
});
