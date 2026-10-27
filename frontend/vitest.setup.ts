import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests so one component's DOM never leaks into the next assertion.
afterEach(cleanup);

// jsdom ships no layout engine, so neither of these exists. Any list that keeps
// its active item visible needs the first; Radix's popovers need the second.
Element.prototype.scrollIntoView = () => {};
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
