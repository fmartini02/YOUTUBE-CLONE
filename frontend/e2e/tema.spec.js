// Tema: la preferenza salvata sul server diventa data-theme su <html>
// (hooks/usePrefs.jsx); "auto" toglie l'attributo e lascia decidere a
// prefers-color-scheme. Il player resta scuro in entrambi i temi.
import { test, expect } from "@playwright/test";
import { ID_FINTO, fingiYouTube, attendiRiproduzione } from "./aiuti.js";

test.afterEach(async ({ request }) => {
  // Stato condiviso del server di prova: si rimette il default.
  await request.patch("/api/prefs", { data: { theme: "dark" } });
});

test("il tema scelto nelle Impostazioni finisce su <html> e sopravvive al ricaricamento", async ({ page }) => {
  const html = page.locator("html");
  const tema = page.locator('select:has(option[value="light"])');
  await page.goto("/settings");
  await tema.selectOption("light");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await tema.selectOption("auto");
  await expect(html).not.toHaveAttribute("data-theme", /.*/);
  await tema.selectOption("dark");
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("col tema chiaro il player resta scuro", async ({ page, request }) => {
  await request.patch("/api/prefs", { data: { theme: "light" } });
  await fingiYouTube(page);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await attendiRiproduzione(page);
  const [sfondoPagina, testoBarra] = await page.evaluate(() => [
    getComputedStyle(document.body).backgroundColor,
    getComputedStyle(document.querySelector(".player-time")).color,
  ]);
  expect(sfondoPagina).not.toBe("rgb(15, 15, 15)");
  expect(testoBarra).toBe("rgb(255, 255, 255)");       // comandi chiari sopra il video
});
