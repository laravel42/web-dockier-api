export type DiffRow =
  | { kind: "context"; text: string; beforeLine: number; afterLine: number }
  | { kind: "add"; text: string; afterLine: number }
  | { kind: "remove"; text: string; beforeLine: number }
  | { kind: "gap"; hidden: number };

/** Above this, the LCS table costs more than the preview is worth. */
const LCS_CELL_LIMIT = 2_000_000;
/** Context lines kept either side of a change. */
const CONTEXT = 3;

/**
 * Line diff for the AI fix preview.
 *
 * Uses an LCS table for normal files and degrades to a common-prefix/suffix trim
 * for very large ones — a coarser but still truthful view, never a wrong one.
 */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");

  const rows =
    a.length * b.length > LCS_CELL_LIMIT ? trimmedDiff(a, b) : lcsDiff(a, b);
  return collapse(rows);
}

function lcsDiff(a: string[], b: string[]): DiffRow[] {
  const n = a.length, m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "context", text: a[i], beforeLine: i + 1, afterLine: j + 1 });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: "remove", text: a[i], beforeLine: i + 1 });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j], afterLine: j + 1 });
      j++;
    }
  }
  while (i < n) { rows.push({ kind: "remove", text: a[i], beforeLine: i + 1 }); i++; }
  while (j < m) { rows.push({ kind: "add", text: b[j], afterLine: j + 1 }); j++; }
  return rows;
}

/** Fallback: everything between the shared head and tail is treated as changed. */
function trimmedDiff(a: string[], b: string[]): DiffRow[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;

  const rows: DiffRow[] = [];
  for (let i = 0; i < head; i++) rows.push({ kind: "context", text: a[i], beforeLine: i + 1, afterLine: i + 1 });
  for (let i = head; i < a.length - tail; i++) rows.push({ kind: "remove", text: a[i], beforeLine: i + 1 });
  for (let j = head; j < b.length - tail; j++) rows.push({ kind: "add", text: b[j], afterLine: j + 1 });
  for (let k = 0; k < tail; k++) {
    const i = a.length - tail + k;
    rows.push({ kind: "context", text: a[i], beforeLine: i + 1, afterLine: b.length - tail + k + 1 });
  }
  return rows;
}

/** Replace long unchanged stretches with a gap marker. */
function collapse(rows: DiffRow[]): DiffRow[] {
  const keep = new Array<boolean>(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.kind === "context") return;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true;
  });
  if (!keep.some(Boolean)) return [];      // identical files

  const out: DiffRow[] = [];
  let hidden = 0;
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (hidden > 0) { out.push({ kind: "gap", hidden }); hidden = 0; }
      out.push(r);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) out.push({ kind: "gap", hidden });
  return out;
}

export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.kind === "add").length,
    removed: rows.filter((r) => r.kind === "remove").length,
  };
}
