import { describe, it, expect } from "vitest";
import { RingBuffer } from "./ring-buffer.js";

/**
 * Unit tests for RingBuffer<T> — validates Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
describe("RingBuffer", () => {
  describe("Configurable capacity (Requirement 4.1)", () => {
    it("defaults capacity to 10,000", () => {
      const buf = new RingBuffer<number>();
      // Push more than default and verify size caps
      for (let i = 0; i < 10_001; i++) buf.push(i);
      expect(buf.size).toBe(10_000);
    });

    it("accepts a custom capacity", () => {
      const buf = new RingBuffer<number>(5);
      for (let i = 0; i < 10; i++) buf.push(i);
      expect(buf.size).toBe(5);
    });
  });

  describe("push() below capacity (Requirement 4.2)", () => {
    it("adds entries and increments size", () => {
      const buf = new RingBuffer<string>(5);
      buf.push("a");
      expect(buf.size).toBe(1);
      buf.push("b");
      expect(buf.size).toBe(2);
    });

    it("stores items in insertion order", () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      expect(buf.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe("push() at capacity — eviction (Requirement 4.3)", () => {
    it("evicts oldest entry when at capacity", () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      expect(buf.size).toBe(3);
      expect(buf.toArray()).toEqual([2, 3, 4]);
    });

    it("evicts multiple oldest entries as new ones are pushed", () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      buf.push(5); // evicts 2
      buf.push(6); // evicts 3
      expect(buf.toArray()).toEqual([4, 5, 6]);
    });

    it("wraps around correctly after many evictions", () => {
      const buf = new RingBuffer<number>(3);
      for (let i = 0; i < 100; i++) buf.push(i);
      expect(buf.size).toBe(3);
      expect(buf.toArray()).toEqual([97, 98, 99]);
    });
  });

  describe("size property (Requirement 4.4)", () => {
    it("starts at zero", () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.size).toBe(0);
    });

    it("never exceeds capacity", () => {
      const buf = new RingBuffer<number>(3);
      for (let i = 0; i < 20; i++) {
        buf.push(i);
        expect(buf.size).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("getRecent(n) (Requirement 4.5)", () => {
    it("returns min(n, size) entries", () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      // Ask for more than size
      expect(buf.getRecent(10)).toEqual([1, 2]);
    });

    it("returns the most recent n entries in insertion order", () => {
      const buf = new RingBuffer<number>(5);
      buf.push(10);
      buf.push(20);
      buf.push(30);
      buf.push(40);
      buf.push(50);
      expect(buf.getRecent(3)).toEqual([30, 40, 50]);
    });

    it("returns entries in insertion order after wrap-around", () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.push(4); // evicts 1
      buf.push(5); // evicts 2
      expect(buf.getRecent(2)).toEqual([4, 5]);
    });

    it("returns empty array when n is 0", () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      expect(buf.getRecent(0)).toEqual([]);
    });

    it("returns empty array when buffer is empty", () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.getRecent(5)).toEqual([]);
    });
  });

  describe("clear() (Requirement 4.6)", () => {
    it("removes all entries and resets size to zero", () => {
      const buf = new RingBuffer<number>(5);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.toArray()).toEqual([]);
    });

    it("allows new entries after clearing", () => {
      const buf = new RingBuffer<number>(3);
      buf.push(1);
      buf.push(2);
      buf.push(3);
      buf.clear();
      buf.push(10);
      buf.push(20);
      expect(buf.size).toBe(2);
      expect(buf.toArray()).toEqual([10, 20]);
    });
  });

  describe("toArray()", () => {
    it("returns all items in insertion order", () => {
      const buf = new RingBuffer<string>(4);
      buf.push("a");
      buf.push("b");
      buf.push("c");
      expect(buf.toArray()).toEqual(["a", "b", "c"]);
    });

    it("returns all items after wrap-around", () => {
      const buf = new RingBuffer<string>(3);
      buf.push("a");
      buf.push("b");
      buf.push("c");
      buf.push("d"); // evicts "a"
      expect(buf.toArray()).toEqual(["b", "c", "d"]);
    });

    it("returns empty array for empty buffer", () => {
      const buf = new RingBuffer<number>(5);
      expect(buf.toArray()).toEqual([]);
    });
  });

  describe("generic type support", () => {
    it("works with objects", () => {
      const buf = new RingBuffer<{ id: number; name: string }>(2);
      buf.push({ id: 1, name: "first" });
      buf.push({ id: 2, name: "second" });
      buf.push({ id: 3, name: "third" }); // evicts first
      expect(buf.toArray()).toEqual([
        { id: 2, name: "second" },
        { id: 3, name: "third" },
      ]);
    });
  });
});
