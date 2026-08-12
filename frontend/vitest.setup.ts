import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests so one component's DOM never leaks into the next assertion.
afterEach(cleanup);
