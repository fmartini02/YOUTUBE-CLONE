// Codec del dispositivo (api/codecDevice.js): il test gira da solo al primo
// avvio e resta in localStorage, il player chiede a /api/mux il primo codec
// acceso nell'ordine AV1 → VP9 → H.264, e le Impostazioni lo mostrano.
import { test, expect } from "@playwright/test";
import { ID_FINTO, fingiYouTube, registraRichieste, attendiRiproduzione } from "./aiuti.js";

const CHIAVE = "ytproxy.codec";
const leggi = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), CHIAVE);

test("al primo avvio il test si salva e il player chiede il codec acceso", async ({ page }) => {
  await fingiYouTube(page);
  const richieste = registraRichieste(page);
  await page.goto("/");
  await expect.poll(() => leggi(page)).not.toBeNull();
  const dati = await leggi(page);
  expect(["av1", "vp9", "h264"].every(c => typeof dati[c] === "boolean")).toBe(true);
  const atteso = ["av1", "vp9", "h264"].find(c => dati[c]);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await attendiRiproduzione(page);
  expect(richieste.mux[0]).toContain(`codec=${atteso}`);
});

test("AV1 spento, VP9 e H.264 accesi: si usa il VP9, e il test non si rifà da solo", async ({ page }) => {
  const salvato = { versione: 1, av1: false, vp9: true, h264: true, altezza: 1080, criterio: "hardware", data: "2026-09-27" };
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [CHIAVE, JSON.stringify(salvato)]);
  await fingiYouTube(page);
  const richieste = registraRichieste(page);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await attendiRiproduzione(page);
  expect(richieste.mux[0]).toContain("codec=vp9");
  expect(await leggi(page)).toEqual(salvato);
});

test("le Impostazioni mostrano i tre codec e rifanno il test a comando", async ({ page }) => {
  const vecchio = { versione: 1, av1: false, vp9: false, h264: true, altezza: 480, criterio: "fluido", data: "2020-01-01" };
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [CHIAVE, JSON.stringify(vecchio)]);
  await page.goto("/settings");
  const sezione = page.locator("div", { has: page.getByRole("heading", { name: /Codec video del dispositivo/ }) }).last();
  await expect(sezione).toContainText("In uso: H.264");
  await sezione.getByRole("button", { name: "Ripeti il test" }).click();
  await expect.poll(async () => (await leggi(page)).data).not.toBe(vecchio.data);
});
