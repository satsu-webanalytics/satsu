import * as util from "node:util";

type Op = { kind: " " | "-" | "+"; text: string };

function lines(s: string | null): string[] {
  if (!s) return [];
  const l = s.replace(/\r\n/g, "\n").split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
}

// Plain LCS: layouts and env files are small, so O(n·m) is fine.
function ops(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: " ", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: "-", text: a[i++]! });
    else out.push({ kind: "+", text: b[j++]! });
  }
  while (i < n) out.push({ kind: "-", text: a[i++]! });
  while (j < m) out.push({ kind: "+", text: b[j++]! });
  return out;
}

/** Changed lines with `context` lines around them; gaps shown as `…`. */
export function diffLines(before: string | null, after: string, context = 2): string[] {
  const all = ops(lines(before), lines(after));
  const keep = new Array<boolean>(all.length).fill(false);
  all.forEach((op, i) => {
    if (op.kind === " ") return;
    for (let k = Math.max(0, i - context); k <= Math.min(all.length - 1, i + context); k++) keep[k] = true;
  });
  const out: string[] = [];
  let gap = false;
  all.forEach((op, i) => {
    if (!keep[i]) {
      gap = true;
      return;
    }
    if (gap && out.length) out.push("…");
    gap = false;
    out.push(`${op.kind} ${op.text}`);
  });
  return out;
}

function paint(color: "green" | "red" | "dim", s: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR || typeof util.styleText !== "function") return s;
  return util.styleText(color, s);
}

export function formatDiff(before: string | null, after: string): string {
  return diffLines(before, after)
    .map((l) => (l.startsWith("+") ? paint("green", l) : l.startsWith("-") ? paint("red", l) : paint("dim", l)))
    .join("\n");
}
