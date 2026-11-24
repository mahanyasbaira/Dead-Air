// browser_run_code_unsafe: load once, start a solo run, send once, go offline, reload, record what happens.
async (page) => {
  const BASE = "http://127.0.0.1:4802";
  const log = [];
  const ctx = page.context();
  await ctx.setOffline(false);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(BASE + "/dead-air/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "/dead-air/");
  await page.getByRole("button", { name: "Solo" }).click();
  await page.getByRole("button", { name: /Dispatch/ }).click();
  await page.getByRole("textbox").first().fill("Hold the gate");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(500);
  log.push("online: saved keys " + JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));
  log.push("online: page text " + JSON.stringify((await page.locator("body").innerText()).slice(0, 300)));
  await page.screenshot({ path: "docs/evidence/consoles-13.2/offline-1-online-after-send.png" });
  await ctx.setOffline(true);
  const failed = [];
  page.on("requestfailed", (r) => failed.push(r.url() + " " + (r.failure() && r.failure().errorText)));
  let nav;
  try {
    const resp = await page.reload({ waitUntil: "load", timeout: 8000 });
    nav = "reload resolved, status " + (resp && resp.status());
  } catch (e) {
    nav = "reload threw: " + String(e.message).split("\n")[0];
  }
  log.push("offline: " + nav);
  log.push("offline: failed requests " + JSON.stringify(failed));
  log.push("offline: title " + JSON.stringify(await page.title().catch((e) => "n/a")));
  log.push("offline: body text " + JSON.stringify(await page.locator("body").innerText().then((t) => t.slice(0, 300)).catch((e) => "n/a")));
  await page.screenshot({ path: "docs/evidence/consoles-13.2/offline-2-after-offline-reload.png" }).catch(() => {});
  await ctx.setOffline(false);
  return log;
}
