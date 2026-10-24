// Sincronia audio/video nel browser, misurata sul contenuto: dopo ogni salto
// i bip devono restare sui lampi come a inizio video. Copre quello che i test
// del server non vedono — SourceBuffer in modalità "segments", riaperture del
// flusso, partenzaNelBuffer, salti dentro il buffer — su VP9+Opus (il
// Chromium di Playwright non ha l'H.264). Vedi CLAUDE.md, "Sincronia
// audio/video sui salti", e registra.js per come si misura.
import { test, expect } from "@playwright/test";
import { ID_LAMPO, fingiYouTube, attendiRiproduzione, cliccaBarra, statoPlayer } from "./aiuti.js";
import { registraVideo, misuraScarto } from "./registra.js";

const SECONDI = 6;          // ~10 lampi per registrazione
// Fra due registrazioni dello stesso flusso lo scarto varia di ±30ms (fotogrammi
// da 33ms, tremolio della registrazione): misurate fino a 57ms di differenza
// fra inizio e salti su 7 esecuzioni sane. I bug visti finora valevano 133ms o più.
const TOLLERANZA_S = 0.1;

// Una registrazione dopo che il video scorre oltre `oltre`: lo scarto, e che
// quasi ogni lampo abbia il suo bip (un picco casuale ne accoppia ~60%).
async function scartoMisurato(page, testInfo, nome, oltre) {
  await attendiRiproduzione(page, oltre);
  const misura = misuraScarto(await registraVideo(page, SECONDI), testInfo, nome);
  console.log(`[sincronia] ${nome}: ${JSON.stringify(misura)}`);
  expect(misura.lampi, `${nome}: lampi visti`).toBeGreaterThanOrEqual(5);
  expect(misura.accoppiati / misura.lampi, `${nome}: lampi con il loro bip`).toBeGreaterThanOrEqual(0.9);
  return misura.scarto;
}

test("dopo salti lunghi e corti l'audio resta sui lampi come a inizio video", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await fingiYouTube(page, ID_LAMPO);
  await page.goto(`/watch?v=${ID_LAMPO}`);
  const base = await scartoMisurato(page, testInfo, "inizio", 1);
  for (const [nome, salta] of [
    ["salto-70", () => cliccaBarra(page, 0.7)],       // fuori dal buffer: riapre /api/mux
    ["salto-20", () => cliccaBarra(page, 0.2)],       // indietro, di nuovo fuori dal buffer
    ["freccia", () => page.keyboard.press("ArrowRight")], // +10s dentro il buffer
  ]) {
    const prima = (await statoPlayer(page)).t;
    await salta();
    await expect.poll(async () => Math.abs((await statoPlayer(page)).t - prima)).toBeGreaterThan(5);
    const scarto = await scartoMisurato(page, testInfo, nome, (await statoPlayer(page)).t + 0.5);
    expect(Math.abs(scarto - base), `${nome}: scarto ${scarto}s contro ${base}s a inizio video`)
      .toBeLessThanOrEqual(TOLLERANZA_S);
  }
});
