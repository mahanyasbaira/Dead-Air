// Diff variant: loads both servers (4801 before, 4802 after) and returns only differing rows.
// Dumps computed styles of every element on the entry and run screens, light and dark.
async (page) => {
  const PROPS = ["color","background-color","font-family","font-size","font-weight","line-height","letter-spacing","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left","border-top-width","border-top-style","border-top-color","border-bottom-width","border-bottom-color","border-left-width","border-left-style","max-width","list-style-type","display","box-sizing","text-align","outline-style"];
  const run = async (BASE) => {
  const out = {};
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE + "/dead-air/");
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + "/dead-air/");
    await page.waitForSelector("button");
    const grab = () => page.evaluate((props) => {
      const rows = [];
      const root = getComputedStyle(document.documentElement);
      rows.push("vars " + ["--paper","--ink","--grey-1","--grey-2","--grey-3","--loss","--sans","--mono"].map(v => root.getPropertyValue(v).trim()).join(" "));
      const all = [document.documentElement, document.body, ...document.body.querySelectorAll("*")];
      for (const el of all) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        rows.push(el.tagName + "." + (el.className && el.className.baseVal === undefined ? el.className : "") + " " + props.map(p => cs.getPropertyValue(p)).join("|") + " " + Math.round(r.width) + "x" + Math.round(r.height));
      }
      rows.push("fonts " + [...document.fonts].map(f => f.family + f.weight + f.status).join(","));
      return rows;
    }, PROPS);
    out[scheme + "-entry"] = await grab();
    await page.getByRole("button", { name: "Solo" }).click();
    await page.getByRole("button", { name: /Dispatch/ }).click();
    await page.waitForSelector(".frame");
    out[scheme + "-run"] = await grab();
  }
  return out;
  };
  const before = await run("http://127.0.0.1:4801");
  const after = await run("http://127.0.0.1:4802");
  const diffs = [];
  for (const k of Object.keys(before)) {
    before[k].forEach((row, i) => { if (row !== after[k][i]) diffs.push(k + " #" + i + "\n  before " + row + "\n  after  " + after[k][i]); });
  }
  return { differing: diffs.length, diffs };
}
