// Prova contro YouTube vero (@rete): esclusa di default, si lancia con
// `npm run test:e2e:rete`. Stesso server offline, ma per un id vero
// _mux_formats passa all'estrazione yt-dlp originale.
import { test, expect } from "@playwright/test";
import { registraRichieste, statoPlayer, attendiRiproduzione, cliccaBarra } from "./aiuti.js";

test("@rete un video vero parte con MSE e un salto riparte dal punto chiesto", async ({ page }) => {
  test.setTimeout(180_000);
  const richieste = registraRichieste(page);
  await page.goto("/watch?v=jNQXAC9IVRw");
  await attendiRiproduzione(page, 1, 90_000);
  expect(richieste.mux[0]).toContain("tempi=sorgente");
  expect((await statoPlayer(page)).src).toMatch(/^blob:/);
  await cliccaBarra(page, 0.6);
  await expect.poll(async () => (await statoPlayer(page)).t, { timeout: 60_000 }).toBeGreaterThan(8);
  const s = await statoPlayer(page);
  expect(Math.abs(s.barra - s.t)).toBeLessThanOrEqual(1);
});
