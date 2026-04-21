/**
 * A fixed-capacity circular buffer that stores items in insertion order
 * and evicts the oldest entries when full.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export class RingBuffer<T> {
  private items: T[];
  private head: number = 0;
  private count: number = 0;

  /**
   * @param capacity Maximum number of entries. Defaults to 10,000.
   */
  constructor(private readonly capacity: number = 10_000) {
    this.items = new Array<T>(capacity);
  }

  /**
   * Add an item to the buffer. If the buffer is at capacity,
   * the oldest item is evicted.
   */
  push(item: T): void {
    const index = (this.head + this.count) % this.capacity;

    if (this.count < this.capacity) {
      this.items[index] = item;
      this.count++;
    } else {
      // Buffer full — overwrite oldest entry
      this.items[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
      // count remains at capacity
    }
  }

  /**
   * Return the most recent `min(n, size)` entries in insertion order
   * (oldest first).
   */
  getRecent(n: number): T[] {
    const resultCount = Math.min(n, this.count);
    const startIndex =
      (this.head + this.count - resultCount + this.capacity) % this.capacity;
    const result: T[] = [];

    for (let i = 0; i < resultCount; i++) {
      result.push(this.items[(startIndex + i) % this.capacity]);
    }

    return result;
  }

  /**
   * Remove all entries and reset the buffer.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * Current number of entries in the buffer (always ≤ capacity).
   */
  get size(): number {
    return this.count;
  }

  /**
   * Return all items in insertion order (oldest first).
   * Equivalent to `getRecent(size)`.
   */
  toArray(): T[] {
    return this.getRecent(this.count);
  }
}
