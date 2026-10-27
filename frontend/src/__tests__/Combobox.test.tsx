import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "../components/ui/Combobox";

/**
 * The four searchable selects this primitive replaced all declared
 * `aria-haspopup="listbox"` and then shipped a pile of buttons with no roles
 * and no keyboard. The roles and the keyboard now come from Radix Popover and
 * cmdk; these assert the promise is kept through our wrapper's own props —
 * per-row content, the server-search hook and the pinned footer included.
 */

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

/**
 * Always rendered with a label: `role="combobox"` takes its accessible name
 * from a label or `aria-label`, never from the trigger's own text, so a
 * combobox without one is unnamed however much text it shows.
 */
function renderSelect(props: Partial<Parameters<typeof Combobox>[0]> = {}) {
  return render(
    <>
      <label htmlFor="letter">Letter</label>
      <Combobox
        id="letter"
        value=""
        onValueChange={vi.fn()}
        options={options}
        placeholder="Pick one…"
        searchPlaceholder="Search letters…"
        {...props}
      />
    </>,
  );
}

/** Open the popup and wait for focus to land in the search input. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Letter" }));
  const input = await screen.findByPlaceholderText("Search letters…");
  await vi.waitFor(() => expect(input).toHaveFocus());
  return input;
}

describe("Combobox", () => {
  it("exposes a real listbox with options, not bare buttons", async () => {
    const user = userEvent.setup();
    renderSelect();
    const trigger = screen.getByRole("combobox", { name: "Letter" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await open(user);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks the current value as the selected option", async () => {
    const user = userEvent.setup();
    renderSelect({ value: "b" });
    await user.click(screen.getByRole("combobox", { name: "Letter" }));

    const selected = await screen.findByRole("option", { name: "Beta" });
    expect(selected).toHaveClass("text-primary-600");
  });

  it("moves the active option with the arrow keys and selects it with Enter", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    await open(user);

    // Focus stays in the search input; the active option is marked instead.
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("data-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Beta" })).toHaveAttribute("data-selected", "true");

    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("narrows the options as the user types", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderSelect({ onValueChange });
    const input = await open(user);

    await user.type(input, "alp");
    await vi.waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));

    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderSelect({ emptyMessage: "No letters found" });
    const input = await open(user);

    await user.type(input, "zzz");
    await vi.waitFor(() => expect(screen.getByText("No letters found")).toBeInTheDocument());
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("renders per-row content in the row and in the trigger", async () => {
    const user = userEvent.setup();
    renderSelect({
      value: "a",
      options: [{ value: "a", label: "Alpha", content: <span data-testid="row">Alpha ⬤</span> }],
    });
    expect(screen.getByTestId("row")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await vi.waitFor(() => expect(screen.getAllByTestId("row")).toHaveLength(2));
  });

  it("debounces the server search and keeps filtering locally meanwhile", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onSearch = vi.fn();
      const user = userEvent.setup();
      renderSelect({ onSearch });
      const input = await open(user);

      await user.type(input, "gam");
      expect(onSearch).not.toHaveBeenCalled();
      // Local filtering already narrowed the loaded page.
      expect(screen.getAllByRole("option")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(300);
      expect(onSearch).toHaveBeenCalledExactlyOnceWith("gam");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pins a footer under the list and hands it the query", async () => {
    const user = userEvent.setup();
    renderSelect({ footer: (query) => <p>query:{query || "(none)"}</p> });
    const input = await open(user);
    expect(screen.getByText("query:(none)")).toBeInTheDocument();

    await user.type(input, "be");
    await vi.waitFor(() => expect(screen.getByText("query:be")).toBeInTheDocument());
  });
});

describe("Combobox naming", () => {
  // role="combobox" is not named from content, so a trigger showing "Pick one…"
  // is announced as an unnamed combobox unless one of these two is supplied.
  it("takes its name from the label it points at", () => {
    render(
      <>
        <span id="lbl">Repository</span>
        <Combobox
          aria-labelledby="lbl"
          value=""
          onValueChange={vi.fn()}
          options={options}
          placeholder="Select a repository…"
        />
      </>,
    );
    expect(screen.getByRole("combobox", { name: "Repository" })).toBeInTheDocument();
  });

  it("falls back to aria-label when there is no visible label", () => {
    render(
      <Combobox
        aria-label="Branch"
        value=""
        onValueChange={vi.fn()}
        options={options}
        placeholder="Select a branch…"
      />,
    );
    expect(screen.getByRole("combobox", { name: "Branch" })).toBeInTheDocument();
  });
});
