import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecentDeploys from "../pages/ProjectDetail/sections/RecentDeploys";
import RecentScans from "../pages/ProjectDetail/sections/RecentScans";

/**
 * Same rule as the posture line: an unfinished fetch must never be reported as
 * "never". These two panels said "hasn't been deployed yet" and "no security
 * scans have been run" on the empty array they hold before their first
 * response lands.
 */

const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("RecentDeploys", () => {
  it("shows a loading state, not 'never deployed', before the fetch settles", () => {
    at(<RecentDeploys deploys={[]} allProviders={[]} navigate={() => {}} loaded={false} />);
    expect(screen.getByText("Loading deploy history…")).toBeInTheDocument();
    expect(screen.queryByText(/hasn't been deployed yet/)).not.toBeInTheDocument();
  });

  it("reports an empty history only once the fetch has settled", () => {
    at(<RecentDeploys deploys={[]} allProviders={[]} navigate={() => {}} loaded />);
    expect(screen.getByText(/hasn't been deployed yet/)).toBeInTheDocument();
  });

  it("prefers the error over both", () => {
    at(<RecentDeploys deploys={[]} allProviders={[]} navigate={() => {}} loaded={false} error="offline" />);
    expect(screen.getByText("Couldn't load deploys")).toBeInTheDocument();
    expect(screen.queryByText("Loading deploy history…")).not.toBeInTheDocument();
  });
});

describe("RecentScans", () => {
  it("shows a loading state, not 'never scanned', before the fetch settles", () => {
    at(<RecentScans scans={[]} navigate={() => {}} loaded={false} />);
    expect(screen.getByText("Loading scan history…")).toBeInTheDocument();
    expect(screen.queryByText(/No security scans have been run/)).not.toBeInTheDocument();
  });

  it("reports an empty history only once the fetch has settled", () => {
    at(<RecentScans scans={[]} navigate={() => {}} loaded />);
    expect(screen.getByText(/No security scans have been run/)).toBeInTheDocument();
  });
});
