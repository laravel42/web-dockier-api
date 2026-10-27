import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchSelect from "../components/ui/SearchSelect";

/**
 * The four searchable selects this replaces all declared
 * `aria-haspopup="listbox"` and then shipped a pile of buttons with no roles
 * and no keyboard at all. These assert the promise is now kept.
 */

const items = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function renderSelect(props: { value?: string; onChange?: (v: string) => void } = {}) {
  return render(
    <SearchSelect
      value={props.value ?? ""}
      onChange={props.onChange ?? vi.fn()}
      items={items}
      getValue={(i) => i.value}
      renderItem={(i) => <span>{i.label}</span>}
      matches={(i, q) => i.label.toLowerCase().includes(q)}
      placeholder="Pick one…"
      listLabel="Letters"
      searchPlaceholder="Search letters…"
    />,
  );
}

/** Open the popup and wait for focus to land in the search input. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /pick one/i }));
  const input = screen.getByRole("combobox");
  await vi.waitFor(() => expect(input).toHaveFocus());
  return input;
}

describe("SearchSelect", () => {
  it("exposes a real listbox with options, not bare buttons", async () => {
    const user = userEvent.setup();
    renderSelect();
    const trigger = screen.getByRole("button", { name: /pick one/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await open(user);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Letters" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks the current value as the selected option", async () => {
    const user = userEvent.setup();
    renderSelect({ value: "b" });
    await user.click(screen.getByRole("button", { name: "Beta" }));

    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("moves the active option with the arrow keys and selects it with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect({ onChange });
    const input = await open(user);
    const options = screen.getAllByRole("option");

    // Focus stays in the input; the active option is tracked by id.
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("wraps at both ends", async () => {
    const user = userEvent.setup();
    renderSelect();
    const input = await open(user);
    const options = screen.getAllByRole("option");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    await user.keyboard("{End}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
    await user.keyboard("{Home}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    const user = userEvent.setup();
    renderSelect();
    await open(user);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pick one/i })).toHaveFocus();
  });

  it("narrows the options as the user types and keeps the active option valid", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect({ onChange });
    const input = await open(user);

    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.type(input, "alp");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    // The active index reset, so Enter cannot select a row that is gone.
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderSelect();
    const input = await open(user);

    await user.type(input, "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });
});
