import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { RingBuffer } from "../ring-buffer.js";

/**
 * Property-based tests for RingBuffer<T>
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**
 *
 * Property 1: Ring Buffer Capacity Invariant
 * For any sequence of push, clear, and getRecent operations on a Ring_Buffer
 * with capacity C, the buffer size SHALL remain less than or equal to C at all
 * times. After pushing N items where N > C, the size SHALL equal C and the
 * buffer SHALL contain only the most recent C items. After clear(), the size
 * SHALL be zero.
 *
 * Property 2: Ring Buffer Ordering
 * For any Ring_Buffer state and any value of n, calling getRecent(n) SHALL
 * return min(n, size) entries in insertion order (oldest first). The returned
 * entries SHALL be the most recently pushed items.
 */

/** Arbitrary for a reasonable buffer capacity (1–200). */
const capacityArb = fc.integer({ min: 1, max: 200 });

/** Arbitrary for a list of items to push into the buffer. */
const itemsArb = fc.array(fc.integer(), { minLength: 0, maxLength: 500 });

/**
 * Arbitrary for a sequence of operations: push, clear, or getRecent.
 * This lets us test arbitrary interleaving of operations.
 */
type Op =
  | { type: "push"; value: number }
  | { type: "clear" }
  | { type: "getRecent"; n: number };

const opArb = (maxN: number): fc.Arbitrary<Op> =>
  fc.oneof(
    fc.integer().map((value): Op => ({ type: "push", value })),
    fc.constant<Op>({ type: "clear" }),
    fc.integer({ min: 0, max: maxN + 10 }).map((n): Op => ({ type: "getRecent", n }))
  );

const opsArb = (maxN: number): fc.Arbitrary<Op[]> =>
  fc.array(opArb(maxN), { minLength: 0, maxLength: 300 });

describe("RingBuffer — Property 1: Ring Buffer Capacity Invariant", () => {
  it("size never exceeds capacity for any sequence of push operations", () => {
    fc.assert(
      fc.property(capacityArb, itemsArb, (capacity, items) => {
        const buf = new RingBuffer<number>(capacity);
        for (const item of items) {
          buf.push(item);
          expect(buf.size).toBeLessThanOrEqual(capacity);
          expect(buf.size).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("after pushing N > C items, size equals C and buffer contains only the last C items", () => {
    fc.assert(
      fc.property(capacityArb, itemsArb, (capacity, items) => {
        const buf = new RingBuffer<number>(capacity);
        for (const item of items) {
          buf.push(item);
        }

        if (items.length > capacity) {
          expect(buf.size).toBe(capacity);
          const expected = items.slice(-capacity);
          expect(buf.toArray()).toEqual(expected);
        } else {
          expect(buf.size).toBe(items.length);
          expect(buf.toArray()).toEqual(items);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("after clear(), size is zero", () => {
    fc.assert(
      fc.property(capacityArb, itemsArb, (capacity, items) => {
        const buf = new RingBuffer<number>(capacity);
        for (const item of items) {
          buf.push(item);
        }
        buf.clear();
        expect(buf.size).toBe(0);
        expect(buf.toArray()).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  it("size <= capacity holds for any interleaved sequence of push, clear, and getRecent", () => {
    fc.assert(
      fc.property(capacityArb, opsArb(300), (capacity, ops) => {
        const buf = new RingBuffer<number>(capacity);
        for (const op of ops) {
          switch (op.type) {
            case "push":
              buf.push(op.value);
              break;
            case "clear":
              buf.clear();
              break;
            case "getRecent":
              buf.getRecent(op.n);
              break;
          }
          // Invariant must hold after every operation
          expect(buf.size).toBeLessThanOrEqual(capacity);
          expect(buf.size).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 }
    );
  });
});

describe("RingBuffer — Property 2: Ring Buffer Ordering", () => {
  it("getRecent(n) returns min(n, size) items", () => {
    fc.assert(
      fc.property(
        capacityArb,
        itemsArb,
        fc.integer({ min: 0, max: 600 }),
        (capacity, items, n) => {
          const buf = new RingBuffer<number>(capacity);
          for (const item of items) {
            buf.push(item);
          }
          const recent = buf.getRecent(n);
          expect(recent.length).toBe(Math.min(n, buf.size));
        }
      ),
      { numRuns: 200 }
    );
  });

  it("getRecent(n) returns items in insertion order (oldest first)", () => {
    fc.assert(
      fc.property(
        capacityArb,
        itemsArb,
        fc.integer({ min: 0, max: 600 }),
        (capacity, items, n) => {
          const buf = new RingBuffer<number>(capacity);
          for (const item of items) {
            buf.push(item);
          }

          const recent = buf.getRecent(n);
          const effectiveItems =
            items.length > capacity ? items.slice(-capacity) : items;
          const expectedCount = Math.min(n, effectiveItems.length);
          const expected =
            expectedCount === 0
              ? []
              : effectiveItems.slice(-expectedCount);

          expect(recent).toEqual(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("getRecent(n) returns the most recently pushed items", () => {
    fc.assert(
      fc.property(
        capacityArb,
        itemsArb,
        fc.integer({ min: 1, max: 600 }),
        (capacity, items, n) => {
          // Skip if no items pushed
          fc.pre(items.length > 0);

          const buf = new RingBuffer<number>(capacity);
          for (const item of items) {
            buf.push(item);
          }

          const recent = buf.getRecent(n);
          if (recent.length > 0) {
            // The last element of getRecent should be the last pushed item
            // that's still in the buffer
            const allItems = buf.toArray();
            const lastRecent = recent[recent.length - 1];
            const lastInBuffer = allItems[allItems.length - 1];
            expect(lastRecent).toBe(lastInBuffer);

            // All returned items should be a contiguous suffix of toArray()
            const allArr = buf.toArray();
            const suffix = allArr.slice(-recent.length);
            expect(recent).toEqual(suffix);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("getRecent(size) equals toArray()", () => {
    fc.assert(
      fc.property(capacityArb, itemsArb, (capacity, items) => {
        const buf = new RingBuffer<number>(capacity);
        for (const item of items) {
          buf.push(item);
        }
        expect(buf.getRecent(buf.size)).toEqual(buf.toArray());
      }),
      { numRuns: 200 }
    );
  });
});
