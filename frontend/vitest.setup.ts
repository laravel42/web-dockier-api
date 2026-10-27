import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests so one component's DOM never leaks into the next assertion.
afterEach(cleanup);

// jsdom ships no layout engine and therefore no scrollIntoView. Any list that
// keeps its active item visible calls it, so stub it once here.
Element.prototype.scrollIntoView = () => {};
