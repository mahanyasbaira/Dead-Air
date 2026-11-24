/** Minutes after midnight to "11:10 pm". Wraps past midnight; rounds down to a whole minute. */
export function formatClock(minutes: number): string {
  const total = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "am" : "pm"}`;
}
