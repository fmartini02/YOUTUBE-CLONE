// Player: avvio, salti lunghi (riaprono /api/mux con start=) e salti corti
// (restano nel buffer MSE). Vedi CLAUDE.md, "Riproduzione" e "Barra di
// caricamento: risolta con MediaSource Extensions".
import { test, expect } from "@playwright/test";
import { ID_FINTO, DURATA, fingiYouTube, registraRichieste, statoPlayer, attendiRiproduzione, cliccaBarra } from "./aiuti.js";

let richieste;

test.beforeEach(async ({ page }) => {
  await fingiYouTube(page);
  richieste = registraRichieste(page);
  await page.goto(`/watch?v=${ID_FINTO}`);
  await attendiRiproduzione(page);
});

test("parte con MSE sulla timeline sorgente, barra = currentTime", async ({ page }) => {
  expect(richieste.mux[0]).toContain("tempi=sorgente");
  const s = await statoPlayer(page);
  expect(s.src).toMatch(/^blob:/);                       // MediaSource, non il ripiego <video src>
  expect(Math.abs(s.barra - s.t)).toBeLessThanOrEqual(1);
});

test("salto lungo avanti e poi indietro: riparte dal punto chiesto, barra coerente", async ({ page }) => {
  for (const [frazione, secondo] of [[0.7, 0.7 * DURATA], [0.2, 0.2 * DURATA]]) {
    const prima = richieste.mux.length;
    await cliccaBarra(page, frazione);
    // Fuori dai 60s di buffer: il flusso si riapre da lì, sempre in timeline sorgente.
    await expect.poll(() => richieste.mux.length).toBeGreaterThan(prima);
    expect(richieste.mux.at(-1)).toMatch(/start=\d+.*tempi=sorgente/);
    await attendiRiproduzione(page, secondo + 0.5);
    const s = await statoPlayer(page);
    // currentTime è il secondo vero del video (niente offset da 0) e la barra lo segue.
    expect(s.t).toBeGreaterThan(secondo - 3);
    expect(s.t).toBeLessThan(secondo + 5);
    expect(Math.abs(s.barra - s.t)).toBeLessThanOrEqual(1);
  }
});

test("salto corto con →: resta nel buffer, non torna all'inizio, non si ferma", async ({ page }) => {
  await attendiRiproduzione(page, 2);
  const prima = await statoPlayer(page);
  const richiestePrima = richieste.mux.length;
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await statoPlayer(page)).t).toBeGreaterThan(prima.t + 8);
  const dopo = await statoPlayer(page);
  expect(dopo.t).toBeLessThan(prima.t + 14);
  expect(richieste.mux.length).toBe(richiestePrima);     // nessuna riapertura del flusso
  await attendiRiproduzione(page, dopo.t + 1);            // e continua a scorrere da solo
});
