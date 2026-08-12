/// <reference types="vitest/globals" />

// jest-dom augments vitest's Assertion via this import. The setup file performs
// it at runtime, but tsconfig only includes `src`, so the augmentation has to be
// referenced from inside `src` for typecheck to see the matchers too.
import "@testing-library/jest-dom/vitest";
