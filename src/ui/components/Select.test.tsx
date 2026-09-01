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
    const option = screen.getByRole("option", { name: "Add model provider" });
    expect(option).toHaveClass("crew-select-action");
    await user.click(option);
    expect(action).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
  });

  it("right-aligns a wider popover with its trigger", async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, right: 232, top: 50, bottom: 82, width: 132, height: 32, x: 100, y: 50, toJSON: () => undefined });
    const user = userEvent.setup();
    render(<Select ariaLabel="Provider" value="" options={[{ value: "one", label: "One" }]} onChange={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Provider" }));
    expect(screen.getByRole("listbox")).toHaveStyle({ left: "52px", width: "180px" });
    bounds.mockRestore();
  });

});
