// Mini-player: la pagina video non si smonta mai passando da pagina intera a
// widget — nessuna nuova /api/mux né /api/watch. Vedi CLAUDE.md, "Mini-player".
import { test, expect } from "@playwright/test";
import { ID_FINTO, fingiYouTube, registraRichieste, statoPlayer, attendiRiproduzione } from "./aiuti.js";

test("Indietro da /watch aperto diretto: home col widget, video che continua", async ({ page }) => {
  await fingiYouTube(page);
  const richieste = registraRichieste(page);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await attendiRiproduzione(page, 1);
  const prima = { mux: richieste.mux.length, watch: richieste.watch.length };
  const t0 = (await statoPlayer(page)).t;

  await page.goBack();
  // .video-page resta montata ma senza ingombro (il player dentro è fixed):
  // si guarda l'attributo, e la visibilità del widget stesso.
  await expect(page.locator(".video-page")).toHaveAttribute("data-mode", "mini");
  await expect(page.locator(".mini-overlay")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await attendiRiproduzione(page, t0 + 1);

  // Tocco sul widget: di nuovo a pagina intera, stesso flusso, stesso punto.
  const t1 = (await statoPlayer(page)).t;
  await page.locator(".mini-overlay").click();            // al centro: gli angoli hanno pausa e X
  await expect(page.locator(".video-page")).toHaveAttribute("data-mode", "full");
  expect(new URL(page.url()).pathname).toBe("/watch");
  expect((await statoPlayer(page)).t).toBeGreaterThanOrEqual(t1);
  expect(richieste.mux.length).toBe(prima.mux);
  expect(richieste.watch.length).toBe(prima.watch);
});

test("X del widget chiude il video", async ({ page }) => {
  await fingiYouTube(page);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await attendiRiproduzione(page);
  await page.goBack();
  await page.locator(".mini-close").click();
  await expect(page.locator("video")).toHaveCount(0);
});
