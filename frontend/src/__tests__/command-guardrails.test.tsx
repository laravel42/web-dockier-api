import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { destructiveReason, isDestructiveCommand } from "../pages/ProjectDetail/destructiveCommand";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";

/**
 * A4: arbitrary shell against production used to run on Enter with no second step.
 * A5: none of the row action menus closed on Escape, and the one that claimed
 * role="menu" offered none of the movement that role promises.
 */

describe("destructive command detection", () => {
  it("catches every pattern the blast-radius doc lists", () => {
    const cases = [
      "rm -rf storage/logs",
      "php artisan migrate:fresh",
      "DROP TABLE users",
      "truncate table sessions",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
      "echo x > /etc/passwd",
      "chmod 777 /var/www",
      "php artisan db:wipe",
      "docker system prune -f",
    ];
    for (const c of cases) expect(isDestructiveCommand(c), c).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isDestructiveCommand("Rm -rf /")).toBe(true);
    expect(isDestructiveCommand("Drop Table x")).toBe(true);
  });

  it("leaves ordinary commands alone", () => {
    for (const c of ["php artisan migrate", "npm ci", "ls -la", "git status", "composer install"]) {
      expect(isDestructiveCommand(c), c).toBe(false);
    }
  });

  it("does not fire on a substring inside a longer word", () => {
    // "form" contains "rm"; "backdrop" contains "drop".
    expect(isDestructiveCommand("php artisan form:build")).toBe(false);
    expect(isDestructiveCommand("npm run build:backdrop")).toBe(false);
  });

  it("states a consequence, not the pattern that matched", () => {
    expect(destructiveReason("rm -rf x")).toBe("deletes files");
    expect(destructiveReason("php artisan migrate:fresh")).toBe("drops and rebuilds every table");
  });

  it("returns null for an empty command", () => {
    expect(destructiveReason("   ")).toBeNull();
  });
});

describe("menu keyboard", () => {
  const Menu = ({ onClose }: { onClose: () => void }) => {
    const { menuRef, onKeyDown } = useMenuKeyboard(true, onClose);
    return (
      <div ref={menuRef} onKeyDown={onKeyDown} role="menu" tabIndex={-1} aria-label="Row actions">
        <button type="button" role="menuitem">View logs</button>
        <button type="button" role="menuitem">Restart</button>
        <button type="button" role="menuitem">Delete</button>
      </div>
    );
  };

  it("focuses the first item when the menu opens", async () => {
    render(<Menu onClose={vi.fn()} />);
    // Focus moves on the next frame, so wait for it.
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus());
  });

  it("moves down and wraps at the end", async () => {
    render(<Menu onClose={vi.fn()} />);
    const user = userEvent.setup();
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Restart" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus();
  });

  it("moves up and wraps at the start", async () => {
    render(<Menu onClose={vi.fn()} />);
    const user = userEvent.setup();
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus());

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("jumps with Home and End", async () => {
    render(<Menu onClose={vi.fn()} />);
    const user = userEvent.setup();
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus());

    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the user tabs out", async () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    const user = userEvent.setup();
    await vi.waitFor(() => expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus());
    await user.tab();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not listen once closed", async () => {
    const onClose = vi.fn();
    const Closed = () => {
      const { menuRef, onKeyDown } = useMenuKeyboard(false, onClose);
      return <div ref={menuRef} onKeyDown={onKeyDown} role="menu" tabIndex={-1} aria-label="x" />;
    };
    render(<Closed />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ConfirmModal accepts structured messages", () => {
  // A4 echoes the command string and its execution context, which needs markup.
  it("renders element content, not just a string", async () => {
    const { default: ConfirmModal } = await import("../components/ConfirmModal");
    const Harness = () => {
      const [open] = useState(true);
      return (
        <ConfirmModal
          open={open}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Run this command?"
          message={
            <>
              <span>rm -rf storage</span>
              <span>Runs on acme as the dockier user</span>
            </>
          }
        />
      );
    };
    render(<Harness />);
    expect(screen.getByText("rm -rf storage")).toBeInTheDocument();
    expect(screen.getByText("Runs on acme as the dockier user")).toBeInTheDocument();
  });
});
