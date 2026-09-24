// Aiuti comuni agli smoke test: finti YouTube per l'id sintetico, conteggio
// delle richieste, lettura dello stato del player.
//
// ID_FINTO e DURATA devono coincidere con server/tests/media_finti.py: per
// quell'id il server offline serve da /api/mux due file locali di 10 minuti.
import { expect } from "@playwright/test";

export const ID_FINTO = "ytproxyTEST";
export const DURATA = 600;

const METADATI = {
  id: ID_FINTO, title: "Video sintetico di prova", description: "Generato da ffmpeg (testsrc2 + sine).",
  channel: "Canale di prova", channel_id: "UCprova0000000000000000", duration: DURATA,
  views: 1, likes: 0, thumbnail: "", published: "20260924", tags: [], subscribers: 0, chapters: [],
};

// Tutto ciò che per l'id finto andrebbe comunque su YouTube: metadati,
// correlati, commenti, sottotitoli, miniature. /api/mux invece NON è finto:
// è il pezzo da provare, e il server offline lo serve davvero con ffmpeg.
export async function fingiYouTube(page) {
  const json = body => route => route.fulfill({ json: body });
  await page.route(`**/api/watch/${ID_FINTO}`, json(METADATI));
  await page.route(`**/api/related/${ID_FINTO}*`, json({ results: [], total: 0, has_more: false, source: "nessuna" }));
  await page.route(`**/api/comments/${ID_FINTO}*`, json({ comments: [], comment_count: 0, next_page_token: "", source: "ytdlp" }));
  await page.route(`**/api/subtitles/${ID_FINTO}`, json({ languages: [] }));
  await page.route("**/api/img?*", route => route.fulfill({ status: 404, body: "" }));
}

// Elenco vivo degli URL di /api/mux e /api/watch chiesti dalla pagina.
export function registraRichieste(page) {
  const richieste = { mux: [], watch: [] };
  page.on("request", req => {
    const url = req.url();
    if (url.includes("/api/mux/")) richieste.mux.push(url);
    if (url.includes("/api/watch/")) richieste.watch.push(url);
  });
  return richieste;
}

// currentTime, pausa e valore della barra (aria-valuenow = secondo mostrato).
export async function statoPlayer(page) {
  return page.evaluate(() => {
    const video = document.querySelector(".video-page video");
    const barra = document.querySelector(".player-progress");
    return {
      t: video ? video.currentTime : NaN,
      paused: video ? video.paused : true,
      barra: barra ? Number(barra.getAttribute("aria-valuenow")) : NaN,
      src: video ? video.currentSrc : "",
    };
  });
}

// Attende che il video stia scorrendo oltre `oltre` secondi.
export async function attendiRiproduzione(page, oltre = 0.5, timeout = 30_000) {
  await expect.poll(async () => {
    const s = await statoPlayer(page);
    return !s.paused && s.t > oltre;
  }, { timeout }).toBe(true);
}

// Clic sulla barra di avanzamento a una frazione della sua larghezza.
export async function cliccaBarra(page, frazione) {
  await page.locator(".video-page").hover();
  const box = await page.locator(".player-progress").boundingBox();
  await page.mouse.click(box.x + box.width * frazione, box.y + box.height / 2);
}
