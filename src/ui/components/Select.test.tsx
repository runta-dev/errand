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
});
