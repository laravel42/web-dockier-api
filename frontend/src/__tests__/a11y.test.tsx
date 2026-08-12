import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Modal from "../components/Modal";
import { clickableProps } from "../utils/a11y";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { panelId, tabId, useTabListKeyboard } from "../hooks/useTabListKeyboard";

/**
 * These cover the accessibility guarantees eslint-plugin-jsx-a11y cannot see:
 * props delivered through a spread, behaviour that lives in a hook, and focus
 * management. The lint rules cover the static markup; this covers the rest.
 */

describe("clickableProps", () => {
  // The bug: cards across the app carried a bare onClick on a <div> — operable
  // with a mouse, invisible to keyboard and assistive tech.
  const Card = ({ onSelect, enabled = true }: { onSelect: () => void; enabled?: boolean }) => (
    <div {...clickableProps(onSelect, enabled)}>Acme API</div>
  );

  it("exposes the card as a button and puts it in the tab order", () => {
    render(<Card onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Acme API" })).toHaveAttribute("tabindex", "0");
  });

  it("activates on Enter and on Space", async () => {
    const onSelect = vi.fn();
    render(<Card onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.tab();
    expect(screen.getByRole("button", { name: "Acme API" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);

    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("contributes no role and no tab stop when the card is not actionable", () => {
    const onSelect = vi.fn();
    render(<Card onSelect={onSelect} enabled={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Acme API")).not.toHaveAttribute("tabindex");
  });
});

describe("useEscapeKey", () => {
  // The bug: several dropdowns shipped with only an invisible click-catcher
  // backdrop, leaving keyboard users with no way to dismiss them at all.
  const Menu = () => {
    const [open, setOpen] = useState(true);
    useEscapeKey(open, () => setOpen(false));
    return open ? <div>Menu contents</div> : <div>closed</div>;
  };

  it("closes the surface on Escape", async () => {
    render(<Menu />);
    const user = userEvent.setup();
    expect(screen.getByText("Menu contents")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("does not listen while inactive", async () => {
    const onEscape = vi.fn();
    const Inert = () => {
      useEscapeKey(false, onEscape);
      return <div>inert</div>;
    };
    render(<Inert />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe("tablist keyboard navigation", () => {
  const KEYS = ["heartbeats", "logs", "activity"] as const;

  const TabList = () => {
    const [active, setActive] = useState<(typeof KEYS)[number]>("heartbeats");
    const onKeyDown = useTabListKeyboard(KEYS, setActive);
    return (
      <>
        <div role="tablist" aria-label="Observe sections">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={tabId(k)}
              aria-controls={panelId(k)}
              aria-selected={active === k}
              tabIndex={active === k ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={panelId(active)} aria-labelledby={tabId(active)}>
          {active} panel
        </div>
      </>
    );
  };

  it("keeps exactly one tab in the tab order (roving tabIndex)", () => {
    render(<TabList />);
    const inOrder = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(inOrder).toHaveLength(1);
    expect(inOrder[0]).toHaveAccessibleName("heartbeats");
  });

  it("moves selection with arrows and wraps at both ends", async () => {
    render(<TabList />);
    const user = userEvent.setup();
    await user.tab();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("logs");

    // wrap forward past the last tab
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("heartbeats");

    // wrap backward past the first
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("activity");
  });

  it("jumps to first and last with Home and End", async () => {
    render(<TabList />);
    const user = userEvent.setup();
    await user.tab();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("activity");

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("heartbeats");
  });

  it("names the panel with its tab", () => {
    render(<TabList />);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("heartbeats");
  });
});

describe("Modal", () => {
  it("names the dialog by its own title, uniquely per instance", () => {
    render(
      <>
        <Modal open onClose={vi.fn()} title="Delete domain">
          <button type="button">Confirm</button>
        </Modal>
        <Modal open onClose={vi.fn()} title="Add certificate">
          <button type="button">Save</button>
        </Modal>
      </>,
    );
    const names = screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-labelledby"));
    // Two dialogs must not both claim id="modal-title".
    expect(new Set(names).size).toBe(2);
    expect(screen.getByRole("dialog", { name: "Delete domain" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add certificate" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Delete domain">
        <p>body</p>
      </Modal>,
    );
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves focus into the dialog when it opens", async () => {
    render(
      <Modal open onClose={vi.fn()} title="Delete domain">
        <button type="button">Confirm</button>
      </Modal>,
    );
    // The close button is the first focusable node inside the dialog.
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement),
    );
  });

  it("keeps Tab inside the dialog", async () => {
    render(
      <Modal open onClose={vi.fn()} title="Delete domain">
        <button type="button">Confirm</button>
      </Modal>,
    );
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
