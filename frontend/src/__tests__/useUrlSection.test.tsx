import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useUrlSection } from "../hooks/useUrlSection";

/**
 * "Observe → Logs" has to be an address. These cover the three things that make it
 * one: a deep link restores the section, a section the user cannot see falls back
 * instead of rendering nothing, and the correction uses `replace` so the back button
 * does not walk through states that were never visible.
 */

const OBSERVE = ["heartbeats", "logs", "activity"] as const;

function Harness({ keys = OBSERVE }: { keys?: readonly string[] }) {
  const [active, setActive] = useUrlSection(keys);
  const location = useLocation();
  return (
    <div>
      <p data-testid="active">{active}</p>
      <p data-testid="search">{location.search}</p>
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => setActive(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}

const at = (url: string, keys?: readonly string[]) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Harness keys={keys} />
    </MemoryRouter>,
  );

describe("useUrlSection", () => {
  it("restores the section from a deep link", () => {
    at("/projects/1?tab=observe&section=logs");
    expect(screen.getByTestId("active")).toHaveTextContent("logs");
  });

  it("defaults to the first section when the param is absent", () => {
    at("/projects/1?tab=observe");
    expect(screen.getByTestId("active")).toHaveTextContent("heartbeats");
    // Absent is not wrong — leave the URL alone rather than rewriting on load.
    expect(screen.getByTestId("search")).toHaveTextContent("tab=observe");
    expect(screen.getByTestId("search")).not.toHaveTextContent("section=");
  });

  it("falls back and corrects the URL when the section is not visible", () => {
    // e.g. a link to a settings section this user's permissions hide.
    at("/projects/1?tab=settings&section=wordpress", ["general", "environment"]);
    expect(screen.getByTestId("active")).toHaveTextContent("general");
    expect(screen.getByTestId("search")).toHaveTextContent("section=general");
  });

  it("falls back when a section left over from another tab is not valid here", () => {
    at("/projects/1?tab=processes&section=logs", ["processes", "scheduler"]);
    expect(screen.getByTestId("active")).toHaveTextContent("processes");
    expect(screen.getByTestId("search")).toHaveTextContent("section=processes");
  });

  it("writes the section into the URL on selection", async () => {
    at("/projects/1?tab=observe");
    await userEvent.setup().click(screen.getByRole("button", { name: "logs" }));
    expect(screen.getByTestId("active")).toHaveTextContent("logs");
    expect(screen.getByTestId("search")).toHaveTextContent("section=logs");
  });

  it("keeps the main tab param intact when the section changes", async () => {
    at("/projects/1?tab=observe&other=keep");
    await userEvent.setup().click(screen.getByRole("button", { name: "activity" }));
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).toContain("tab=observe");
    expect(search).toContain("other=keep");
    expect(search).toContain("section=activity");
  });
});
