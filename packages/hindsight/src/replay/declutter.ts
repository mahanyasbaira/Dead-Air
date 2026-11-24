// Pure label spreading. Keeps order, keeps labels inside [min, max], and keeps
// at least `minGap` between neighbours whenever they fit.

/**
 * `ys` are the wanted label positions in order. Returns positions in the same order.
 * If the labels cannot fit with `minGap`, they are spread evenly over the whole range.
 */
export function spreadLabels(ys: readonly number[], minGap: number, min: number, max: number): number[] {
  const n = ys.length;
  if (n === 0) return [];
  if (n === 1) return [Math.min(max, Math.max(min, ys[0] as number))];
  if ((n - 1) * minGap > max - min) {
    const step = (max - min) / (n - 1);
    return ys.map((_, i) => min + i * step);
  }
  const out = ys.map((y) => Math.min(max, Math.max(min, y)));
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i] as number, (out[i - 1] as number) + minGap);
  if ((out[n - 1] as number) > max) {
    out[n - 1] = max;
    for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i] as number, (out[i + 1] as number) - minGap);
  }
  return out;
}
