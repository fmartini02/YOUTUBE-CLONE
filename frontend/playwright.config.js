import { defineConfig } from "@playwright/test";

// Smoke test del frontend (e2e/), contro il server vero avviato in modalità
// offline da server/tests/server_offline.py: su una porta sua (8098, non la
// 8090 del server di tutti i giorni) e con una data/ temporanea. Serve la
// build in frontend/dist, come in produzione: dopo aver toccato src/ va
// rifatto `npm run build` prima dei test.
//
// Le prove marcate @rete aprono video veri da YouTube: escluse di default,
// si lanciano con `npm run test:e2e:rete`.
const PORTA = process.env.YTPROXY_E2E_PORT || "8098";
const BASE = `http://127.0.0.1:${PORTA}`;

export default defineConfig({
  testDir: "./e2e",
  // Un solo worker: il server di prova è uno solo, e le preferenze (tema)
  // sono stato condiviso fra le prove.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  grepInvert: process.env.YTPROXY_RETE ? undefined : /@rete/,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    // Chromium di Playwright: niente codec proprietari (H.264/AAC), per questo
    // i media finti sono VP9 + Opus. Autoplay con audio senza un gesto.
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 ../server/tests/server_offline.py",
    url: `${BASE}/api/health`,
    env: { YTPROXY_E2E_PORT: PORTA },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});
