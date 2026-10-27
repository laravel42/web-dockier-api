import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "../components/ErrorBoundary";

/**
 * App.tsx now mounts this boundary outermost, above the providers, so a render
 * error on /login no longer leaves a blank page. Nothing mounts App in a test,
 * so these cover the boundary's own contract instead: it shows the fallback,
 * logs the error, and can be dismissed.
 */
describe("ErrorBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error itself; silence it so the run stays readable.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function Boom(): never {
    throw new Error("kaboom");
  }

  it("renders the fallback with the error message instead of nothing", () => {
    render(
      <ErrorBoundary title="This page encountered an error">
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This page encountered an error")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("logs the error so a caught crash is not swallowed", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(consoleError).toHaveBeenCalledWith(
      "Render error caught by ErrorBoundary:",
      expect.objectContaining({ message: "kaboom" }),
      expect.anything(),
    );
  });

  it("renders children again after Try again", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) throw new Error("kaboom");
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("passes children through untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
