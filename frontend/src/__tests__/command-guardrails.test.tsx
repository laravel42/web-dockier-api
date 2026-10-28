import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { destructiveReason, isDestructiveCommand } from "../pages/ProjectDetail/destructiveCommand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";

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

/**
 * The row action menus used to be hand-rolled, each with its own outside-click
 * listener and its own partial keyboard handling. They now go through the house
 * `ui/DropdownMenu` primitive, so the A5 guarantees are asserted against that
 * primitive rather than against a hook no menu uses any more.
 */
describe("row action menu keyboard", () => {
  const Menu = () => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Actions">⋮</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Row actions">
        <DropdownMenuItem>View logs</DropdownMenuItem>
        <DropdownMenuItem>Restart</DropdownMenuItem>
        <DropdownMenuItem>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /** Opening with the keyboard is what puts focus on the first item. */
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.tab();
    await user.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus(),
    );
  };

  it("focuses the first item when the menu opens", async () => {
    render(<Menu />);
    await open(userEvent.setup());
  });

  it("moves down and wraps at the end", async () => {
    render(<Menu />);
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Restart" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus();
  });

  it("moves up and wraps at the start", async () => {
    render(<Menu />);
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });

  it("jumps with Home and End", async () => {
    render(<Menu />);
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "View logs" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Menu />);
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Actions" })).toHaveFocus();
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
