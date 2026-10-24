// Registrazione di quello che il <video> mostra e suona davvero, per misurare
// la sincronia audio/video nel browser (e2e/sincronia.spec.js). Non legge i
// tempi dei campioni ma il contenuto: la coppia "lampo" dei media finti ha
// un lampo bianco e un bip negli stessi istanti, e analizza_lampi.py (lato
// server, ffmpeg) dice di quanto i bip sono spostati rispetto ai lampi.
//
// `captureStream()` + `MediaRecorder` mettono le due tracce sulla stessa
// timeline della registrazione, ma la catena aggiunge uno scarto fisso suo
// (~150ms in headless, misurato nel collaudo del 2026-09-24): per questo il
// test confronta lo scarto dopo un salto con quello a inizio video, non con 0.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ANALISI = fileURLToPath(new URL("../../server/tests/analizza_lampi.py", import.meta.url));

// `secondi` di registrazione del <video> della pagina video, come Buffer WebM.
// captureStream va ripreso a ogni registrazione: una riapertura del flusso
// (ogni salto) sostituisce le tracce, e MediaRecorder si fermerebbe.
export async function registraVideo(page, secondi) {
  const base64 = await page.evaluate(async ms => {
    const video = document.querySelector(".video-page video");
    const registratore = new MediaRecorder(video.captureStream(), { mimeType: "video/webm;codecs=vp8,opus" });
    const pezzi = [];
    registratore.ondataavailable = e => pezzi.push(e.data);
    const fermo = new Promise(fatto => (registratore.onstop = fatto));
    registratore.start();
    await new Promise(fatto => setTimeout(fatto, ms));
    registratore.stop();
    await fermo;
    const byte = new Uint8Array(await new Blob(pezzi).arrayBuffer());
    let testo = "";
    for (let i = 0; i < byte.length; i += 0x8000) testo += String.fromCharCode(...byte.subarray(i, i + 0x8000));
    return btoa(testo);
  }, secondi * 1000);
  return Buffer.from(base64, "base64");
}

// {scarto, accoppiati, lampi, bip} della registrazione, salvata fra gli
// artefatti del test (test-results/) per riguardarla se la prova fallisce.
export function misuraScarto(registrazione, testInfo, nome) {
  const percorso = testInfo.outputPath(`${nome}.webm`);
  writeFileSync(percorso, registrazione);
  return JSON.parse(execFileSync("python3", [ANALISI, percorso], { encoding: "utf8" }));
}
